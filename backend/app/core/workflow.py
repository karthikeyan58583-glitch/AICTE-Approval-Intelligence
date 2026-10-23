"""Statutory Approval Workflow State Machine Engine for AICTE AIP.

Implements the 10-state regulatory approval lifecycle defined in SIH Problem Statement 26262
and AICTE Approval Process Handbook (APH) regulations:
  draft -> submitted -> regional_scrutiny -> deficiency_resolution -> evc_evaluation ->
  sac_review -> shc_hearing -> approved / rejected / withdrawn.

Provides role-based transition authorization, input validation, and reference number generation.
"""

import secrets
from typing import Dict, List, Optional, Tuple, Any
from app.schemas.applications import (
    ApplicationTypeEnum,
    WorkflowStatusEnum,
    ApplicationFormData,
)


class WorkflowTransitionRule:
    """Defines a legal transition between two statutory workflow statuses."""
    def __init__(
        self,
        from_status: WorkflowStatusEnum,
        to_status: WorkflowStatusEnum,
        allowed_roles: List[str],
        action: str,
        requires_notes: bool = False,
        description: str = "",
    ):
        self.from_status = from_status
        self.to_status = to_status
        self.allowed_roles = allowed_roles
        self.action = action
        self.requires_notes = requires_notes
        self.description = description


# The authoritative statutory state machine definition
STATUTORY_TRANSITIONS: List[WorkflowTransitionRule] = [
    # 1. Draft to Submitted (Applicant)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.DRAFT,
        to_status=WorkflowStatusEnum.SUBMITTED,
        allowed_roles=["applicant_institution_representative", "aicte_executive_admin"],
        action="submit_application",
        requires_notes=False,
        description="Formal statutory submission by institution authorized signatory.",
    ),
    # 2. Draft to Withdrawn (Applicant)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.DRAFT,
        to_status=WorkflowStatusEnum.WITHDRAWN,
        allowed_roles=["applicant_institution_representative", "aicte_executive_admin"],
        action="withdraw_draft",
        requires_notes=True,
        description="Applicant voluntary withdrawal of application draft.",
    ),
    # 3. Submitted to Regional Scrutiny (Officer / Admin)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.SUBMITTED,
        to_status=WorkflowStatusEnum.REGIONAL_SCRUTINY,
        allowed_roles=["regional_scrutiny_officer", "aicte_executive_admin"],
        action="commence_scrutiny",
        requires_notes=False,
        description="Regional office officer claims application and commences document scrutiny.",
    ),
    # 4. Regional Scrutiny to Deficiency Resolution (Return to applicant)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.REGIONAL_SCRUTINY,
        to_status=WorkflowStatusEnum.DEFICIENCY_RESOLUTION,
        allowed_roles=["regional_scrutiny_officer", "aicte_executive_admin"],
        action="raise_deficiency",
        requires_notes=True,
        description="Regional scrutiny officer identifies statutory deficiencies requiring rectification.",
    ),
    # 5. Deficiency Resolution to Regional Scrutiny (Applicant resubmits)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.DEFICIENCY_RESOLUTION,
        to_status=WorkflowStatusEnum.REGIONAL_SCRUTINY,
        allowed_roles=["applicant_institution_representative", "aicte_executive_admin"],
        action="resubmit_rectification",
        requires_notes=True,
        description="Applicant submits response and compliance documentation addressing deficiencies.",
    ),
    # 6. Regional Scrutiny to EVC Evaluation (Inspection recommended)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.REGIONAL_SCRUTINY,
        to_status=WorkflowStatusEnum.EVC_EVALUATION,
        allowed_roles=["regional_scrutiny_officer", "aicte_executive_admin"],
        action="recommend_evc",
        requires_notes=False,
        description="Regional scrutiny clears documentation; Expert Visiting Committee inspection scheduled.",
    ),
    # 7. Regional Scrutiny to SAC Review (Direct approval pathway if eligible for EoA without EVC)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.REGIONAL_SCRUTINY,
        to_status=WorkflowStatusEnum.SAC_REVIEW,
        allowed_roles=["regional_scrutiny_officer", "aicte_executive_admin"],
        action="recommend_sac_direct",
        requires_notes=False,
        description="Clean EoA scrutiny forwarded directly to Scrutiny Appraisal Committee.",
    ),
    # 8. Regional Scrutiny to Rejected (Fundamental statutory non-compliance)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.REGIONAL_SCRUTINY,
        to_status=WorkflowStatusEnum.REJECTED,
        allowed_roles=["regional_scrutiny_officer", "aicte_executive_admin"],
        action="reject_at_scrutiny",
        requires_notes=True,
        description="Scrutiny officer rejects application for irremediable statutory violations.",
    ),
    # 9. EVC Evaluation to SAC Review (Inspection report submitted)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.EVC_EVALUATION,
        to_status=WorkflowStatusEnum.SAC_REVIEW,
        allowed_roles=["evc_evaluator", "aicte_executive_admin"],
        action="submit_evc_report",
        requires_notes=True,
        description="Expert Visiting Committee completes physical/digital evaluation and tables report.",
    ),
    # 10. EVC Evaluation to Deficiency Resolution (Physical defects found)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.EVC_EVALUATION,
        to_status=WorkflowStatusEnum.DEFICIENCY_RESOLUTION,
        allowed_roles=["evc_evaluator", "aicte_executive_admin"],
        action="evc_deficiency",
        requires_notes=True,
        description="EVC inspection identifies physical infrastructure or faculty deficiencies.",
    ),
    # 11. SAC Review to SHC Hearing (Standing Hearing Committee referral)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.SAC_REVIEW,
        to_status=WorkflowStatusEnum.SHC_HEARING,
        allowed_roles=["shc_member", "aicte_executive_admin"],
        action="refer_to_shc",
        requires_notes=True,
        description="SAC refers contested or deficient institution to Standing Hearing Committee for personal hearing.",
    ),
    # 12. SAC Review to Approved (Final statutory approval)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.SAC_REVIEW,
        to_status=WorkflowStatusEnum.APPROVED,
        allowed_roles=["aicte_executive_admin"],
        action="grant_approval",
        requires_notes=False,
        description="AICTE Executive Administration grants official Letter of Approval (LoA) / EoA.",
    ),
    # 13. SAC Review to Rejected
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.SAC_REVIEW,
        to_status=WorkflowStatusEnum.REJECTED,
        allowed_roles=["aicte_executive_admin"],
        action="deny_approval",
        requires_notes=True,
        description="AICTE Executive Administration formally rejects application upon SAC appraisal.",
    ),
    # 14. SHC Hearing to Approved (Post-hearing exoneration/compliance)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.SHC_HEARING,
        to_status=WorkflowStatusEnum.APPROVED,
        allowed_roles=["shc_member", "aicte_executive_admin"],
        action="shc_grant_approval",
        requires_notes=True,
        description="Standing Hearing Committee upholds compliance and grants statutory approval.",
    ),
    # 15. SHC Hearing to Rejected (Post-hearing final rejection)
    WorkflowTransitionRule(
        from_status=WorkflowStatusEnum.SHC_HEARING,
        to_status=WorkflowStatusEnum.REJECTED,
        allowed_roles=["shc_member", "aicte_executive_admin"],
        action="shc_deny_approval",
        requires_notes=True,
        description="Standing Hearing Committee confirms deficiencies and executes final rejection.",
    ),
]


def generate_application_reference(app_type: ApplicationTypeEnum, academic_year: str = "2026-2027") -> str:
    """
    Generates a unique, server-authoritative statutory reference number.
    Format: AICTE-{YEAR}-{TYPE_PREFIX}-{RANDOM_NUMERIC}
    Example: AICTE-2026-NEW-48291
    """
    type_prefixes = {
        ApplicationTypeEnum.NEW_INSTITUTE: "NEW",
        ApplicationTypeEnum.EXTENSION_OF_APPROVAL: "EOA",
        ApplicationTypeEnum.COURSE_ADDITION: "CRS",
    }
    prefix = type_prefixes.get(app_type, "APP")
    year = academic_year.split("-")[0] if "-" in academic_year else academic_year
    random_digits = "".join(str(secrets.randbelow(10)) for _ in range(5))
    return f"AICTE-{year}-{prefix}-{random_digits}"


def get_allowed_transitions(
    current_status: str,
    user_role: str,
) -> List[Dict[str, Any]]:
    """
    Returns the list of permitted transitions from the current status for the caller's verified role.
    """
    allowed = []
    for rule in STATUTORY_TRANSITIONS:
        if rule.from_status.value == current_status:
            if user_role in rule.allowed_roles:
                allowed.append({
                    "target_status": rule.to_status.value,
                    "action": rule.action,
                    "requires_notes": rule.requires_notes,
                    "description": rule.description,
                })
    return allowed


def validate_statutory_transition(
    current_status: str,
    target_status: str,
    user_role: str,
    transition_notes: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[WorkflowTransitionRule]]:
    """
    Validates whether the requested state mutation conforms to the statutory workflow rules.
    Returns: (is_valid, error_message, matching_rule)
    """
    for rule in STATUTORY_TRANSITIONS:
        if rule.from_status.value == current_status and rule.to_status.value == target_status:
            # Check role permissions
            if user_role not in rule.allowed_roles:
                return (
                    False,
                    f"Role '{user_role}' is not authorized to transition application from '{current_status}' to '{target_status}'. "
                    f"Authorized roles: {', '.join(rule.allowed_roles)}.",
                    None,
                )

            # Check notes requirement
            if rule.requires_notes and (not transition_notes or len(transition_notes.strip()) < 5):
                return (
                    False,
                    f"Statutory transition from '{current_status}' to '{target_status}' requires official scrutiny notes (minimum 5 characters).",
                    None,
                )

            return True, None, rule

    return (
        False,
        f"Illegal workflow transition: Cannot move application directly from '{current_status}' to '{target_status}'.",
        None,
    )


def validate_form_data_for_submission(
    app_type: ApplicationTypeEnum,
    raw_form_data: Dict[str, Any],
) -> Tuple[bool, Optional[str], Optional[ApplicationFormData]]:
    """
    Validates form data strictly against Pydantic schema based on application type.
    Ensures applicants cannot submit incomplete, malformed, or deficient payloads.
    """
    cleaned_data = dict(raw_form_data)

    # Resolve canonical permanent_id if supplied at top level or nested
    canonical_pid = (
        cleaned_data.get("permanent_id")
        or (cleaned_data.get("eoa_details") or {}).get("permanent_id")
        or (cleaned_data.get("course_addition_details") or {}).get("permanent_id")
    )
    if canonical_pid and isinstance(canonical_pid, str) and canonical_pid.strip():
        canonical_pid = canonical_pid.strip()
        cleaned_data["permanent_id"] = canonical_pid
        if app_type == ApplicationTypeEnum.EXTENSION_OF_APPROVAL:
            if "eoa_details" not in cleaned_data or not isinstance(cleaned_data["eoa_details"], dict):
                cleaned_data["eoa_details"] = {}
            cleaned_data["eoa_details"]["permanent_id"] = canonical_pid
        elif app_type == ApplicationTypeEnum.COURSE_ADDITION:
            if "course_addition_details" not in cleaned_data or not isinstance(cleaned_data["course_addition_details"], dict):
                cleaned_data["course_addition_details"] = {}
            cleaned_data["course_addition_details"]["permanent_id"] = canonical_pid
    else:
        if app_type == ApplicationTypeEnum.EXTENSION_OF_APPROVAL:
            return False, "Permanent ID (minimum 4 characters) is mandatory for Extension of Approval.", None
        elif app_type == ApplicationTypeEnum.COURSE_ADDITION:
            return False, "Permanent ID (minimum 4 characters) is mandatory for Course Addition.", None

    # Prune sub-schemas irrelevant to the statutory application type
    if app_type == ApplicationTypeEnum.NEW_INSTITUTE:
        cleaned_data.pop("eoa_details", None)
        cleaned_data.pop("course_addition_details", None)
    elif app_type == ApplicationTypeEnum.EXTENSION_OF_APPROVAL:
        cleaned_data.pop("course_addition_details", None)
    elif app_type == ApplicationTypeEnum.COURSE_ADDITION:
        cleaned_data.pop("eoa_details", None)

    try:
        validated_data = ApplicationFormData.model_validate(cleaned_data)
    except Exception as e:
        return False, f"Server validation failed: {str(e)}", None

    # Application-type-specific statutory constraints
    if app_type == ApplicationTypeEnum.NEW_INSTITUTE:
        if not validated_data.infrastructure:
            return False, "New Institute applications require complete Infrastructure and Cadastral details.", None
        if not validated_data.programs_courses or len(validated_data.programs_courses) == 0:
            return False, "New Institute applications must propose at least one academic program/course.", None

    elif app_type == ApplicationTypeEnum.EXTENSION_OF_APPROVAL:
        if not validated_data.eoa_details:
            return False, "Extension of Approval applications require existing AICTE Permanent ID and compliance details.", None
        if not validated_data.eoa_details.permanent_id or len(validated_data.eoa_details.permanent_id.strip()) < 4:
            return False, "Permanent ID (minimum 4 characters) is mandatory for Extension of Approval.", None

    elif app_type == ApplicationTypeEnum.COURSE_ADDITION:
        if not validated_data.course_addition_details:
            return False, "Course Addition applications require new course details and laboratory readiness confirmation.", None
        if not validated_data.course_addition_details.permanent_id or len(validated_data.course_addition_details.permanent_id.strip()) < 4:
            return False, "Permanent ID (minimum 4 characters) is mandatory for Course Addition.", None
        if not validated_data.course_addition_details.new_course_name or len(validated_data.course_addition_details.new_course_name.strip()) < 2:
            return False, "Proposed new course name is required.", None

    return True, None, validated_data
