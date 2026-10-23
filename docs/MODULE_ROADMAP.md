# AIP Phased Engineering Roadmap

This document outlines the architectural roadmap for the **AICTE Approval Intelligence Platform (AIP)** developed under Smart India Hackathon Problem Statement 26262.

---

## 1. Roadmap Structural Alignment (7 Broad Phases vs 14 Granular Modules)

To provide clear executive visibility while preserving granular engineering milestones, the project's delivery architecture maps 7 broad strategic phases to 14 detailed sub-modules:

| Phase | Strategic Domain | Granular Engineering Modules | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Project Foundation & Shell | **Module 1**: Project Foundation, Monorepo & Enterprise Application Shell | **Completed (Module 1)** |
| **Phase 2** | Identity, Security & RBAC | **Module 2**: Supabase Auth Integration & Session Governance<br>**Module 3**: Role-Based Access Control (RBAC), SQL RLS Policies & FastAPI Security | **Completed (Module 2)** |
| **Phase 3** | Intake & Workflow Engine | **Module 4**: Institutional Application Intake Wizards & Document Slots<br>**Module 5**: Statutory Approval State Machine & Audit Trail Transitions | **Completed (Module 3)** |
| **Phase 4** | AI Document Intelligence | **Module 6**: Multi-Format Document Ingestion & High-Fidelity OCR<br>**Module 7**: Cross-Document Discrepancy & Deficiency Engine<br>**Module 8**: Evidence Linking & Bounding-Box Visual Inspection Workspace | Planned (Module 4) |
| **Phase 5** | Bottleneck Analytics | **Module 9**: Stage Duration Telemetry & Regional Queue Sizing<br>**Module 10**: Explainable Root-Cause Delay Attribution & SLA Predictive Modeling<br>**Module 11**: EVC Inspection & Hearing Committee Scheduling Optimizer | Planned (Module 5) |
| **Phase 6** | Compliance & Alerts | **Module 12**: Automated Threshold Evaluation (Cadastral, Carpet, Faculty Ratios)<br>**Module 13**: Escalation Ladders & Multi-Channel Alert Dispatcher (In-app, SMS, Email) | Planned (Module 6) |
| **Phase 7** | Audits & Hackathon Polish | **Module 14**: Statutory Audit Dossiers, RTI Exports & Hackathon Production Polish | Planned (Module 7) |

---

## 2. Detailed Module Status Breakdown

### ✅ Module 1: Project Foundation & Application Shell (Phase 1)
- Monorepo directory structure (`frontend/`, `backend/`, `docs/`, `supabase/`).
- Python 3.13 FastAPI backend with `uv` virtual environment and `/api/health` vitality probe.
- Next.js 16 App Router frontend with TypeScript, Tailwind CSS, Lucide icons, and Recharts.
- Government-grade administrative layout with persistent desktop sidebar and mobile responsive drawer.
- Overview dashboard presenting 4 core metrics, stage distribution histogram, recent activity table, action items, and innovation overview.
- Unified mock data layer ([mock-data.ts](file:///d:/AICTE-Approval-Intelligence/frontend/src/lib/mock-data.ts)) with clear UI demonstration notices.

---

### ✅ Module 2: Authentication, Security & Role-Based Access Control (Phase 2)
- **Supabase Auth Integration**: Email/password registration, login, logout, password recovery, and email verification.
- **Next.js 16 Routing Proxy (`src/proxy.ts`)**: Session refresh and verified server-side authentication using `@supabase/ssr`.
- **5 Regulatory Roles Supported**:
  1. `applicant_institution_representative`: Intake, deficiency rectification, status tracking.
  2. `regional_scrutiny_officer`: Evaluation, deficiency issuance, queue telemetry.
  3. `evc_evaluator`: Physical/virtual inspection review.
  4. `shc_member`: Hearing governance and appeal evaluation.
  5. `aicte_executive_admin`: Full statutory administration.
- **Security Boundaries**:
  - Public registration automatically assigned default applicant role; client-supplied role tampering rejected.
  - SQL migration ([20261022000001_auth_roles_schema.sql](file:///d:/AICTE-Approval-Intelligence/supabase/migrations/20261022000001_auth_roles_schema.sql)) with RLS and trigger preventing unauthorized role elevation.
  - Protected FastAPI endpoints (`GET /api/v1/auth/me`, `GET /api/v1/auth/admin-dossier`, `GET /api/v1/auth/scrutiny-queue`) verifying cryptographic bearer tokens.
- **Auth UI Suite**: Polished `/login`, `/register`, `/confirm-email`, `/forgot-password`, `/reset-password`, and `/access-denied` matching sovereign AIP visual identity.

---

### ✅ Module 3: Application Intake Wizards, Core Data Model & Statutory Workflow (Phase 3)
- **Core Entities & Additive Migration (`20261023000001_core_applications_workflow.sql`)**:
  - `institutions`, `institution_memberships`, `applications`, and `application_workflow_history`.
  - Hardened `SECURITY DEFINER` helpers (`is_institution_member`, `is_regulatory_reviewer`) with `SET search_path = ''` and revoked execute from PUBLIC.
  - Anti-tampering triggers protecting application immutability and enforcing append-only workflow audit logs.
- **Three Regulated Application Categories**:
  - Establishment of New Technical Institute (`new_institute` / LoA).
  - Extension of Approval (`extension_of_approval` / EoA).
  - Introduction of New Course / Program (`course_addition`).
- **Statutory Workflow State Machine (10 States)**:
  - `draft` ➔ `submitted` ➔ `regional_scrutiny` ➔ `deficiency_resolution` (rectification loop) ➔ `evc_evaluation` ➔ `sac_review` ➔ `shc_hearing` ➔ `approved` / `rejected` / `withdrawn`.
  - Server-authoritative transition authorization and validation.
- **Client & Fast API Integration**:
  - Real `/applications` directory with search, type/status filters, and metrics.
  - Multi-step `/applications/new` intake wizard with live client validation, server validation, draft autosave/recovery, and unique reference generation (`AICTE-2026-APP-XXXXX`).
  - Comprehensive `/applications/[id]` dossier view with interactive stage tracker, deficiency resolution response, officer transition modals, and chronological audit timeline.
- **Automated Verification**:
  - 29 backend tests passing (including workflow lifecycle and SQL AST tests).
  - Zero TypeScript compiler errors; Next.js 16 production build passing.

---

### ✅ Module 4: Secure Document Management & Regulatory Evidence (Phase 4)
- **Dedicated Private Supabase Storage**:
  - Private bucket `aip-application-documents` with 10 MiB limit and PDF allowlist.
  - Server-controlled paths (`{application_id}/{uuid}.pdf`) preventing path traversal and object collisions.
- **Authoritative Database Metadata & Immutability**:
  - `public.application_documents` metadata table with persisted SHA-256 integrity hash (`file_hash_sha256`).
  - Trigger `tr_protect_document_metadata_mutation` safeguarding upload timestamps, file sizes, and storage paths.
- **Durable Deletion Outbox Queue & Worker**:
  - `public.document_storage_deletion_queue` populated via trigger `tr_enqueue_document_storage_deletion`.
  - Zero SQL deletes against Supabase `storage.objects`.
  - `DocumentStorageCleanupWorker` with lease-based crash recovery, 404 idempotent handling, exponential retries, and standalone CLI runner (`python -m app.worker`).
- **PDF Signature & Structural Validation**:
  - Enforced `%PDF-` magic byte signature checking.
  - Structural validation via `pypdf` rejecting corrupt, truncated, or 0-page files.
  - Streaming download with safe `Content-Disposition`, `X-Content-Type-Options: nosniff`, and application-level access authorization.
- **Frontend Integration**:
  - Tabbed Document Management section in `/applications/[id]`.
  - AICTE APH Statutory Document Checklist card with completeness indicators.
  - Categorized upload modal with live drag/drop and client validation.
  - Officer scrutiny modal for `verified_valid`, `deficiency_flagged`, and `rejected` determinations with non-repudiation stamping.
- **Automated Verification**:
  - 116 backend tests passing (including schema, AST, API endpoints, workflow state protection, and worker tests).
  - Next.js 16 production build passing with 0 errors across all 20 routes.


---

### ⏳ Module 5: Explainable Bottleneck Detection (Phase 5 — Core Innovation 2)
- State-transition duration analytics and historical queue processing times.
- Explainable Machine Learning attribution:
  - Why is an application delayed? (e.g., *Deficiency response pending by institution*, *Regional scrutiny queue overloaded by 34%*, *Specialist evaluator unavailability*).
  - Delay probability scoring based on institutional archetype and complexity.
- What-if simulation for regional officer workload balancing.

---

### ⏳ Module 6: Compliance Monitoring & Proactive Alert Engine (Phase 6)
- Continuous regulatory threshold monitoring (faculty-to-student ratios, accreditation expiry, mandatory disclosure compliance).
- Automated escalation triggers for pending regulatory deadlines.
- Multi-channel notification pipeline (In-app notification center, SMS, and registered email advisories).
- Automated deficiency resolution tracking.

---

### ⏳ Module 7: Reporting, Final Audit & Production Polish (Phase 7)
- Exportable regulatory audit dossiers (PDF/Excel) for parliamentary and RTI reporting.
- High-concurrency performance tuning and end-to-end regression validation.
- Public institutional verification portal for accreditation certificate lookup.
