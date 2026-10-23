"""Application data store and statutory workflow service for AIP Module 3.

Provides persistent, Supabase-backed storage with PostgreSQL Row Level Security (RLS)
enforcement and authoritative statutory workflow state transitions via database RPC.
Also provides an in-memory repository for isolated unit and security AST tests.
"""

import logging
import uuid
import httpx
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any, Tuple
from fastapi import HTTPException, status
from app.core.config import settings
from app.schemas.auth import UserAuthPayload
from app.schemas.applications import (
    ApplicationTypeEnum,
    WorkflowStatusEnum,
    DraftCreateRequest,
    DraftUpdateRequest,
    ApplicationSubmitRequest,
    WorkflowTransitionRequest,
    ApplicationResponse,
    WorkflowTimelineEntry,
)
from app.core.workflow import (
    generate_application_reference,
    validate_statutory_transition,
    validate_form_data_for_submission,
    get_allowed_transitions,
)

logger = logging.getLogger("aicte.application_store")


class InMemoryApplicationStore:
    """Thread-safe in-memory store for isolated unit tests and offline testing."""

    def __init__(self):
        self._institutions: Dict[str, Dict[str, Any]] = {}
        self._memberships: Dict[Tuple[str, str], Dict[str, Any]] = {}
        self._applications: Dict[str, Dict[str, Any]] = {}
        self._workflow_history: List[Dict[str, Any]] = []
        self._seed_default_demo_data()

    def _seed_default_demo_data(self):
        inst_id_1 = "11111111-1111-1111-1111-111111111111"
        self._institutions[inst_id_1] = {
            "id": inst_id_1,
            "aicte_permanent_id": "1-9318420191",
            "name": "Delhi Institute of Technology & Advanced Studies",
            "institution_type": "engineering_technology",
            "state": "Delhi",
            "district": "New Delhi",
            "address": "Sector 14, Dwarka, Institutional Area",
            "pincode": "110078",
            "status": "approved",
            "created_by": "00000000-0000-0000-0000-000000000001",
            "created_at": "2026-01-15T10:00:00Z",
            "updated_at": "2026-01-15T10:00:00Z",
        }

        inst_id_2 = "22222222-2222-2222-2222-222222222222"
        self._institutions[inst_id_2] = {
            "id": inst_id_2,
            "aicte_permanent_id": "1-8849201944",
            "name": "Maharashtra Institute of Technology & Management",
            "institution_type": "management",
            "state": "Maharashtra",
            "district": "Pune",
            "address": "Kothrud Industrial Estate, Paud Road",
            "pincode": "411038",
            "status": "approved",
            "created_by": "00000000-0000-0000-0000-000000000002",
            "created_at": "2026-01-20T10:00:00Z",
            "updated_at": "2026-01-20T10:00:00Z",
        }

    def _get_utc_now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def ensure_user_institution_membership(
        self,
        user: UserAuthPayload,
        institution_id: Optional[str] = None,
        institution_name: Optional[str] = None,
    ) -> str:
        if institution_id:
            if institution_id not in self._institutions:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Institution with ID '{institution_id}' does not exist.",
                )
            key = (user.id, institution_id)
            if key in self._memberships and self._memberships[key].get("status") == "active":
                return institution_id
            if user.role == "aicte_executive_admin":
                return institution_id
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: You do not hold an active membership in institution '{institution_id}'. Joining requires administrative invitation.",
            )

        for (u_id, inst_id), mem in self._memberships.items():
            if u_id == user.id and mem.get("status") == "active":
                return inst_id

        new_inst_id = str(uuid.uuid4())
        name = institution_name or user.institution_name or f"Institution of {user.full_name or user.email}"
        self._institutions[new_inst_id] = {
            "id": new_inst_id,
            "aicte_permanent_id": None,
            "name": name,
            "institution_type": "engineering_technology",
            "state": "National Capital Region",
            "district": "Central",
            "address": "Onboarding Address Specified in Application Intake",
            "pincode": "110001",
            "status": "unverified_draft",
            "created_by": user.id,
            "created_at": self._get_utc_now(),
            "updated_at": self._get_utc_now(),
        }

        self._memberships[(user.id, new_inst_id)] = {
            "id": str(uuid.uuid4()),
            "institution_id": new_inst_id,
            "user_id": user.id,
            "role": "nodal_officer",
            "status": "active",
            "created_at": self._get_utc_now(),
        }
        return new_inst_id

    def is_user_authorized_for_institution(self, user: UserAuthPayload, institution_id: str) -> bool:
        if user.role in ["regional_scrutiny_officer", "evc_evaluator", "shc_member", "aicte_executive_admin"]:
            return True
        key = (user.id, institution_id)
        mem = self._memberships.get(key)
        return mem is not None and mem.get("status") == "active"

    def list_applications(self, user: UserAuthPayload) -> List[ApplicationResponse]:
        results = []
        is_regulatory = user.role in [
            "regional_scrutiny_officer",
            "evc_evaluator",
            "shc_member",
            "aicte_executive_admin",
        ]
        for app_id, app in self._applications.items():
            inst_id = app["institution_id"]
            created_by = app["created_by"]
            has_access = is_regulatory or self.is_user_authorized_for_institution(user, inst_id) or created_by == user.id
            if has_access:
                inst = self._institutions.get(inst_id, {})
                allowed = get_allowed_transitions(app["current_status"], user.role)
                results.append(
                    ApplicationResponse(
                        id=app["id"],
                        application_number=app.get("application_number"),
                        institution_id=inst_id,
                        institution_name=inst.get("name", "Unknown Institution"),
                        application_type=app["application_type"],
                        academic_year=app["academic_year"],
                        current_status=app["current_status"],
                        form_data=app.get("form_data", {}),
                        created_by=app["created_by"],
                        submitted_at=app.get("submitted_at"),
                        created_at=app["created_at"],
                        updated_at=app["updated_at"],
                        allowed_transitions=[t["target_status"] for t in allowed],
                    )
                )
        results.sort(key=lambda x: x.updated_at, reverse=True)
        return results

    def create_draft(self, user: UserAuthPayload, req: DraftCreateRequest) -> ApplicationResponse:
        inst_id = self.ensure_user_institution_membership(
            user=user,
            institution_id=str(req.institution_id) if req.institution_id else None,
            institution_name=req.institution_name,
        )
        app_id = str(uuid.uuid4())
        now = self._get_utc_now()
        app_record = {
            "id": app_id,
            "application_number": None,
            "institution_id": inst_id,
            "application_type": req.application_type.value,
            "academic_year": req.academic_year,
            "current_status": WorkflowStatusEnum.DRAFT.value,
            "form_data": req.form_data or {},
            "created_by": user.id,
            "submitted_at": None,
            "created_at": now,
            "updated_at": now,
        }
        self._applications[app_id] = app_record

        self._workflow_history.append({
            "id": str(uuid.uuid4()),
            "application_id": app_id,
            "previous_status": None,
            "new_status": WorkflowStatusEnum.DRAFT.value,
            "action": "create_draft",
            "transition_notes": "Application draft initialized by applicant.",
            "actor_id": user.id,
            "actor_role": user.role,
            "actor_name": user.full_name or user.email,
            "created_at": now,
        })

        inst = self._institutions.get(inst_id, {})
        allowed = get_allowed_transitions(WorkflowStatusEnum.DRAFT.value, user.role)
        return ApplicationResponse(
            id=app_id,
            application_number=None,
            institution_id=inst_id,
            institution_name=inst.get("name"),
            application_type=app_record["application_type"],
            academic_year=app_record["academic_year"],
            current_status=app_record["current_status"],
            form_data=app_record["form_data"],
            created_by=app_record["created_by"],
            submitted_at=None,
            created_at=now,
            updated_at=now,
            allowed_transitions=[t["target_status"] for t in allowed],
        )

    def get_application(self, user: UserAuthPayload, app_id: str) -> ApplicationResponse:
        app = self._applications.get(app_id)
        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{app_id}' not found.",
            )
        inst_id = app["institution_id"]
        if not (self.is_user_authorized_for_institution(user, inst_id) or app["created_by"] == user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: You are not authorized to inspect this application.",
            )
        inst = self._institutions.get(inst_id, {})
        allowed = get_allowed_transitions(app["current_status"], user.role)
        return ApplicationResponse(
            id=app["id"],
            application_number=app.get("application_number"),
            institution_id=inst_id,
            institution_name=inst.get("name"),
            application_type=app["application_type"],
            academic_year=app["academic_year"],
            current_status=app["current_status"],
            form_data=app.get("form_data", {}),
            created_by=app["created_by"],
            submitted_at=app.get("submitted_at"),
            created_at=app["created_at"],
            updated_at=app["updated_at"],
            allowed_transitions=[t["target_status"] for t in allowed],
        )

    def update_draft(self, user: UserAuthPayload, app_id: str, req: DraftUpdateRequest) -> ApplicationResponse:
        app = self._applications.get(app_id)
        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{app_id}' not found.",
            )
        inst_id = app["institution_id"]
        if not (self.is_user_authorized_for_institution(user, inst_id) or app["created_by"] == user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: Unauthorized to update this application.",
            )
        if app["current_status"] not in [WorkflowStatusEnum.DRAFT.value, WorkflowStatusEnum.DEFICIENCY_RESOLUTION.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot edit application in statutory status '{app['current_status']}'. Editing is only permitted in draft or deficiency resolution stages.",
            )

        now = self._get_utc_now()
        existing_data = app.get("form_data", {})
        existing_data.update(req.form_data)
        app["form_data"] = existing_data
        app["updated_at"] = now

        inst = self._institutions.get(inst_id, {})
        allowed = get_allowed_transitions(app["current_status"], user.role)
        return ApplicationResponse(
            id=app["id"],
            application_number=app.get("application_number"),
            institution_id=inst_id,
            institution_name=inst.get("name"),
            application_type=app["application_type"],
            academic_year=app["academic_year"],
            current_status=app["current_status"],
            form_data=app["form_data"],
            created_by=app["created_by"],
            submitted_at=app.get("submitted_at"),
            created_at=app["created_at"],
            updated_at=now,
            allowed_transitions=[t["target_status"] for t in allowed],
        )

    def submit_application(self, user: UserAuthPayload, app_id: str, req: ApplicationSubmitRequest) -> ApplicationResponse:
        app = self._applications.get(app_id)
        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{app_id}' not found.",
            )
        inst_id = app["institution_id"]
        if not (self.is_user_authorized_for_institution(user, inst_id) or app["created_by"] == user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: You cannot submit an application on behalf of an institution without authorization.",
            )
        if app["current_status"] != WorkflowStatusEnum.DRAFT.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Application is already in status '{app['current_status']}'. Only drafts can be submitted.",
            )

        final_form_data = app.get("form_data", {})
        if req.form_data:
            final_form_data.update(req.form_data)
        final_form_data["declaration_confirmed"] = True

        app_type_enum = ApplicationTypeEnum(app["application_type"])
        is_valid, error_msg, validated_model = validate_form_data_for_submission(app_type_enum, final_form_data)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=error_msg,
            )

        now = self._get_utc_now()
        ref_number = generate_application_reference(app_type_enum, app["academic_year"])
        app["form_data"] = validated_model.model_dump()
        app["application_number"] = ref_number
        app["current_status"] = WorkflowStatusEnum.SUBMITTED.value
        app["submitted_at"] = now
        app["updated_at"] = now

        self._workflow_history.append({
            "id": str(uuid.uuid4()),
            "application_id": app_id,
            "previous_status": WorkflowStatusEnum.DRAFT.value,
            "new_status": WorkflowStatusEnum.SUBMITTED.value,
            "action": "submit_application",
            "transition_notes": f"Statutory application successfully submitted with reference {ref_number}.",
            "actor_id": user.id,
            "actor_role": user.role,
            "actor_name": user.full_name or user.email,
            "created_at": now,
        })

        inst = self._institutions.get(inst_id, {})
        allowed = get_allowed_transitions(WorkflowStatusEnum.SUBMITTED.value, user.role)
        return ApplicationResponse(
            id=app["id"],
            application_number=ref_number,
            institution_id=inst_id,
            institution_name=inst.get("name"),
            application_type=app["application_type"],
            academic_year=app["academic_year"],
            current_status=WorkflowStatusEnum.SUBMITTED.value,
            form_data=app["form_data"],
            created_by=app["created_by"],
            submitted_at=now,
            created_at=app["created_at"],
            updated_at=now,
            allowed_transitions=[t["target_status"] for t in allowed],
        )

    def transition_application(
        self,
        user: UserAuthPayload,
        app_id: str,
        req: WorkflowTransitionRequest,
    ) -> ApplicationResponse:
        app = self._applications.get(app_id)
        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{app_id}' not found.",
            )
        current_status = app["current_status"]
        target_status = req.target_status.value
        is_legal, err, rule = validate_statutory_transition(
            current_status=current_status,
            target_status=target_status,
            user_role=user.role,
            transition_notes=req.transition_notes,
        )
        if not is_legal:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN if "not authorized" in (err or "") else status.HTTP_400_BAD_REQUEST,
                detail=err,
            )

        now = self._get_utc_now()
        app["current_status"] = target_status
        app["updated_at"] = now

        self._workflow_history.append({
            "id": str(uuid.uuid4()),
            "application_id": app_id,
            "previous_status": current_status,
            "new_status": target_status,
            "action": req.action,
            "transition_notes": req.transition_notes or rule.description,
            "actor_id": user.id,
            "actor_role": user.role,
            "actor_name": user.full_name or user.email,
            "created_at": now,
        })

        inst = self._institutions.get(app["institution_id"], {})
        allowed = get_allowed_transitions(target_status, user.role)
        return ApplicationResponse(
            id=app["id"],
            application_number=app.get("application_number"),
            institution_id=app["institution_id"],
            institution_name=inst.get("name"),
            application_type=app["application_type"],
            academic_year=app["academic_year"],
            current_status=target_status,
            form_data=app.get("form_data", {}),
            created_by=app["created_by"],
            submitted_at=app.get("submitted_at"),
            created_at=app["created_at"],
            updated_at=now,
            allowed_transitions=[t["target_status"] for t in allowed],
        )

    def get_timeline(self, user: UserAuthPayload, app_id: str) -> List[WorkflowTimelineEntry]:
        app = self._applications.get(app_id)
        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{app_id}' not found.",
            )
        inst_id = app["institution_id"]
        if not (self.is_user_authorized_for_institution(user, inst_id) or app["created_by"] == user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: You cannot view the timeline of an application outside your authorized scope.",
            )
        entries = [
            WorkflowTimelineEntry(
                id=h["id"],
                application_id=h["application_id"],
                previous_status=h["previous_status"],
                new_status=h["new_status"],
                action=h["action"],
                transition_notes=h["transition_notes"],
                actor_id=h["actor_id"],
                actor_role=h.get("actor_role"),
                actor_name=h.get("actor_name"),
                created_at=h["created_at"],
            )
            for h in self._workflow_history
            if h["application_id"] == app_id
        ]
        entries.sort(key=lambda x: x.created_at)
        return entries


class SupabaseApplicationStore:
    """
    Authoritative database-backed store for AICTE applications.
    Forwards user access tokens so PostgreSQL Row Level Security (RLS) policies
    and the atomic RPC execute_statutory_workflow_transition() are strictly enforced.
    """

    def __init__(self, supabase_url: str, supabase_key: str):
        self._base_url = supabase_url.rstrip("/")
        self._api_key = supabase_key

    def _headers(self, user: UserAuthPayload, prefer: Optional[str] = None) -> Dict[str, str]:
        if not user.access_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token required for Supabase operations.",
            )
        h = {
            "apikey": self._api_key,
            "Authorization": f"Bearer {user.access_token}",
            "Content-Type": "application/json",
        }
        if prefer:
            h["Prefer"] = prefer
        return h

    def _request(
        self,
        method: str,
        endpoint: str,
        user: UserAuthPayload,
        json_data: Optional[Any] = None,
        prefer: Optional[str] = None,
    ) -> Any:
        url = f"{self._base_url}/rest/v1/{endpoint.lstrip('/')}"
        headers = self._headers(user, prefer=prefer)
        try:
            with httpx.Client(timeout=15.0) as client:
                res = client.request(method, url, headers=headers, json=json_data)
        except httpx.RequestError as e:
            logger.error("Supabase network error on %s %s: %s", method, endpoint, str(e))
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Supabase database connection failed: {str(e)}",
            )

        if res.status_code in [200, 201]:
            return res.json()
        elif res.status_code == 204:
            return None
        elif res.status_code in [401, 403]:
            err_body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            msg = err_body.get("message") or err_body.get("hint") or "Database authorization rejected request."
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access Denied: {msg}")
        elif res.status_code == 404:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found in database.")
        else:
            err_body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            msg = err_body.get("message") or res.text
            logger.warning("Database error %s on %s %s: %s", res.status_code, method, endpoint, msg)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Database rejected operation: {msg}",
            )

    def list_applications(self, user: UserAuthPayload) -> List[ApplicationResponse]:
        """Lists applications authorized for the caller via PostgreSQL RLS."""
        data = self._request("GET", "applications?select=*,institutions(id,name)&order=updated_at.desc", user)
        results = []
        for row in data:
            inst = row.get("institutions") or {}
            allowed = get_allowed_transitions(row["current_status"], user.role)
            results.append(
                ApplicationResponse(
                    id=row["id"],
                    application_number=row.get("application_number"),
                    institution_id=row["institution_id"],
                    institution_name=inst.get("name", "Unknown Institution"),
                    application_type=row["application_type"],
                    academic_year=row["academic_year"],
                    current_status=row["current_status"],
                    form_data=row.get("draft_data") or {},
                    created_by=row["created_by"],
                    submitted_at=row.get("submitted_at"),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    allowed_transitions=[t["target_status"] for t in allowed],
                )
            )
        return results

    def get_application(self, user: UserAuthPayload, app_id: str) -> ApplicationResponse:
        """Retrieves a single application, enforcing RLS."""
        data = self._request("GET", f"applications?id=eq.{app_id}&select=*,institutions(id,name)", user)
        if not data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Application '{app_id}' not found or access denied by database policy.",
            )
        row = data[0]
        inst = row.get("institutions") or {}
        allowed = get_allowed_transitions(row["current_status"], user.role)
        return ApplicationResponse(
            id=row["id"],
            application_number=row.get("application_number"),
            institution_id=row["institution_id"],
            institution_name=inst.get("name", "Unknown Institution"),
            application_type=row["application_type"],
            academic_year=row["academic_year"],
            current_status=row["current_status"],
            form_data=row.get("draft_data") or {},
            created_by=row["created_by"],
            submitted_at=row.get("submitted_at"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            allowed_transitions=[t["target_status"] for t in allowed],
        )

    def _resolve_or_create_institution(
        self,
        user: UserAuthPayload,
        institution_id: Optional[str] = None,
        institution_name: Optional[str] = None,
    ) -> Tuple[str, str]:
        """
        Resolves or onboards an institution following hardened database constraints:
        - Rejects arbitrary joining of existing institutions without active membership.
        - Onboards new institution in 'unverified_draft' status.
        - Database trigger tr_handle_new_institution_membership automatically creates
          the restricted 'nodal_officer' membership for the creator.
        """
        if institution_id:
            # Check user membership
            mems = self._request(
                "GET",
                f"institution_memberships?institution_id=eq.{institution_id}&user_id=eq.{user.id}&status=eq.active&select=*,institutions(id,name)",
                user,
            )
            if mems:
                inst = mems[0].get("institutions") or {}
                return institution_id, inst.get("name", "Institution")

            if user.role == "aicte_executive_admin":
                inst_data = self._request("GET", f"institutions?id=eq.{institution_id}&select=id,name", user)
                if inst_data:
                    return institution_id, inst_data[0].get("name", "Institution")

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: You do not hold an active membership in institution '{institution_id}'. Joining requires administrative invitation.",
            )

        # Check if user already owns or belongs to an active institution
        existing_mems = self._request(
            "GET",
            f"institution_memberships?user_id=eq.{user.id}&status=eq.active&select=institution_id,institutions(id,name)",
            user,
        )
        if existing_mems:
            inst = existing_mems[0].get("institutions") or {}
            return existing_mems[0]["institution_id"], inst.get("name", "Institution")

        # Onboard new provisional institution
        name = institution_name or user.institution_name or f"Institution of {user.full_name or user.email}"
        reg_office = user.regional_office or "Northern Regional Office (NRO)"
        new_inst_payload = {
            "name": name,
            "institution_type": "engineering_technology",
            "status": "unverified_draft",
            "institution_code": None,
            "state": "National Capital Region",
            "regional_office": reg_office,
            "address": "Statutory Intake Address",
            "district": "Central",
            "pincode": "110001",
            "created_by": user.id,
        }
        created_inst = self._request(
            "POST",
            "institutions",
            user,
            json_data=new_inst_payload,
            prefer="return=representation",
        )
        if not created_inst:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to register institution in database.",
            )
        inst_row = created_inst[0]
        return inst_row["id"], inst_row["name"]

    def create_draft(self, user: UserAuthPayload, req: DraftCreateRequest) -> ApplicationResponse:
        """Creates a persistent draft in public.applications."""
        inst_id, inst_name = self._resolve_or_create_institution(
            user=user,
            institution_id=str(req.institution_id) if req.institution_id else None,
            institution_name=req.institution_name,
        )

        app_number = generate_application_reference(req.application_type, req.academic_year)
        app_payload = {
            "application_number": app_number,
            "institution_id": inst_id,
            "application_type": req.application_type.value,
            "academic_year": req.academic_year,
            "current_status": WorkflowStatusEnum.DRAFT.value,
            "draft_data": req.form_data or {},
            "created_by": user.id,
        }

        created_apps = self._request(
            "POST",
            "applications",
            user,
            json_data=app_payload,
            prefer="return=representation",
        )
        if not created_apps:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create application draft in database.",
            )
        row = created_apps[0]
        allowed = get_allowed_transitions(WorkflowStatusEnum.DRAFT.value, user.role)
        return ApplicationResponse(
            id=row["id"],
            application_number=row["application_number"],
            institution_id=row["institution_id"],
            institution_name=inst_name,
            application_type=row["application_type"],
            academic_year=row["academic_year"],
            current_status=row["current_status"],
            form_data=row.get("draft_data") or {},
            created_by=row["created_by"],
            submitted_at=row.get("submitted_at"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            allowed_transitions=[t["target_status"] for t in allowed],
        )

    def update_draft(self, user: UserAuthPayload, app_id: str, req: DraftUpdateRequest) -> ApplicationResponse:
        """Updates draft form data while in editable status."""
        existing = self.get_application(user, app_id)
        if existing.current_status not in [WorkflowStatusEnum.DRAFT.value, WorkflowStatusEnum.DEFICIENCY_RESOLUTION.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot edit application in statutory status '{existing.current_status}'. Editing is only permitted in draft or deficiency resolution stages.",
            )

        merged_data = dict(existing.form_data)
        merged_data.update(req.form_data)

        updated = self._request(
            "PATCH",
            f"applications?id=eq.{app_id}",
            user,
            json_data={"draft_data": merged_data, "updated_at": datetime.now(timezone.utc).isoformat()},
            prefer="return=representation",
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application update failed.")
        row = updated[0]
        allowed = get_allowed_transitions(row["current_status"], user.role)
        return ApplicationResponse(
            id=row["id"],
            application_number=row.get("application_number"),
            institution_id=row["institution_id"],
            institution_name=existing.institution_name,
            application_type=row["application_type"],
            academic_year=row["academic_year"],
            current_status=row["current_status"],
            form_data=row.get("draft_data") or {},
            created_by=row["created_by"],
            submitted_at=row.get("submitted_at"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            allowed_transitions=[t["target_status"] for t in allowed],
        )

    def submit_application(self, user: UserAuthPayload, app_id: str, req: ApplicationSubmitRequest) -> ApplicationResponse:
        """
        Executes statutory submission:
        1. Validates form data against Pydantic schema.
        2. Updates draft_data with validated payload.
        3. Executes statutory state transition atomically via database RPC execute_statutory_workflow_transition.
        """
        existing = self.get_application(user, app_id)
        if existing.current_status != WorkflowStatusEnum.DRAFT.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Application is already in status '{existing.current_status}'. Only drafts can be submitted.",
            )

        final_form_data = dict(existing.form_data)
        if req.form_data:
            final_form_data.update(req.form_data)
        final_form_data["declaration_confirmed"] = True

        app_type_enum = ApplicationTypeEnum(existing.application_type)
        is_valid, error_msg, validated_model = validate_form_data_for_submission(app_type_enum, final_form_data)
        if not is_valid:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=error_msg)

        # Update draft_data first
        self._request(
            "PATCH",
            f"applications?id=eq.{app_id}",
            user,
            json_data={"draft_data": validated_model.model_dump()},
            prefer="return=minimal",
        )

        # Execute atomic statutory state transition via RPC
        rpc_payload = {
            "p_application_id": app_id,
            "p_target_status": WorkflowStatusEnum.SUBMITTED.value,
            "p_action": "submit_application",
            "p_comments": f"Statutory application successfully submitted with reference {existing.application_number}.",
        }
        self._request("POST", "rpc/execute_statutory_workflow_transition", user, json_data=rpc_payload)

        # Return updated application
        return self.get_application(user, app_id)

    def transition_application(
        self,
        user: UserAuthPayload,
        app_id: str,
        req: WorkflowTransitionRequest,
    ) -> ApplicationResponse:
        """Executes authorized statutory state transition via the database RPC."""
        rpc_payload = {
            "p_application_id": app_id,
            "p_target_status": req.target_status.value,
            "p_action": req.action,
            "p_comments": req.transition_notes,
        }
        self._request("POST", "rpc/execute_statutory_workflow_transition", user, json_data=rpc_payload)
        return self.get_application(user, app_id)

    def get_timeline(self, user: UserAuthPayload, app_id: str) -> List[WorkflowTimelineEntry]:
        """Fetches chronological workflow history via RLS."""
        data = self._request(
            "GET",
            f"application_workflow_history?application_id=eq.{app_id}&select=*&order=created_at.asc",
            user,
        )
        entries = []
        for h in data:
            entries.append(
                WorkflowTimelineEntry(
                    id=h["id"],
                    application_id=h["application_id"],
                    previous_status=h.get("previous_status"),
                    new_status=h["new_status"],
                    action=h["action"],
                    transition_notes=h.get("comments"),
                    actor_id=h["actor_id"],
                    actor_role=None,
                    actor_name=None,
                    created_at=h["created_at"],
                )
            )
        return entries


class HybridApplicationStore:
    """
    Unified application store router:
    - If caller has a verified access_token and Supabase is configured: routes to SupabaseApplicationStore.
    - If in mock/offline test mode: routes to InMemoryApplicationStore.
    - If Supabase is configured but fails: raises error without silent mock fallback.
    """

    def __init__(self):
        self._mock_store = InMemoryApplicationStore()

    def _get_store(self, user: UserAuthPayload):
        # Determine whether to use Supabase or mock store
        url = settings.supabase_url
        key = settings.supabase_key

        # If user has a valid access_token, is not a mock token, and Supabase is configured and not explicit test-mock mode
        if (
            url
            and key
            and user.access_token
            and not getattr(user, "is_mock", False)
            and not getattr(settings, "MOCK_PERSISTENCE", False)
        ):
            return SupabaseApplicationStore(supabase_url=url, supabase_key=key)

        return self._mock_store

    def ensure_user_institution_membership(self, user: UserAuthPayload, **kwargs):
        store = self._get_store(user)
        if isinstance(store, InMemoryApplicationStore):
            return store.ensure_user_institution_membership(user, **kwargs)
        inst_id, _ = store._resolve_or_create_institution(user, kwargs.get("institution_id"), kwargs.get("institution_name"))
        return inst_id

    def list_applications(self, user: UserAuthPayload) -> List[ApplicationResponse]:
        return self._get_store(user).list_applications(user)

    def get_application(self, user: UserAuthPayload, app_id: str) -> ApplicationResponse:
        return self._get_store(user).get_application(user, app_id)

    def create_draft(self, user: UserAuthPayload, req: DraftCreateRequest) -> ApplicationResponse:
        return self._get_store(user).create_draft(user, req)

    def update_draft(self, user: UserAuthPayload, app_id: str, req: DraftUpdateRequest) -> ApplicationResponse:
        return self._get_store(user).update_draft(user, app_id, req)

    def submit_application(self, user: UserAuthPayload, app_id: str, req: ApplicationSubmitRequest) -> ApplicationResponse:
        return self._get_store(user).submit_application(user, app_id, req)

    def transition_application(self, user: UserAuthPayload, app_id: str, req: WorkflowTransitionRequest) -> ApplicationResponse:
        return self._get_store(user).transition_application(user, app_id, req)

    def get_timeline(self, user: UserAuthPayload, app_id: str) -> List[WorkflowTimelineEntry]:
        return self._get_store(user).get_timeline(user, app_id)


# Primary application store instance
application_store = HybridApplicationStore()
