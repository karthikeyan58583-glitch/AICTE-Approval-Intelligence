# AIP Phased Engineering Roadmap

This document outlines the architectural roadmap for the **AICTE Approval Intelligence Platform (AIP)** developed under Smart India Hackathon Problem Statement 26262.

---

## 1. Roadmap Structural Alignment (7 Broad Phases vs 14 Granular Modules)

To provide clear executive visibility while preserving granular engineering milestones, the project's delivery architecture maps 7 broad strategic phases to 14 detailed sub-modules:

| Phase | Strategic Domain | Granular Engineering Modules | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Project Foundation & Shell | **Module 1**: Project Foundation, Monorepo & Enterprise Application Shell | **Completed (Module 1)** |
| **Phase 2** | Identity, Security & RBAC | **Module 2**: Supabase Auth Integration & Session Governance<br>**Module 3**: Role-Based Access Control (RBAC), SQL RLS Policies & FastAPI Security | **Completed (Module 2)** |
| **Phase 3** | Intake & Workflow Engine | **Module 4**: Institutional Application Intake Wizards & Document Slots<br>**Module 5**: Statutory Approval State Machine & Audit Trail Transitions | Planned (Module 3) |
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

### ⏳ Module 3: Application Intake & Approval State Machine (Phase 3)
- Dynamic approval workflow models matching the AICTE Approval Process Handbook (APH).
- State transitions: `Submitted` ➔ `Scrutiny` ➔ `Deficiency Notice` ➔ `EVC Inspection` ➔ `SAC Review` ➔ `Approval / Rejection`.
- Multi-step application intake wizards for new institution approvals, intake capacity expansions, and course additions.
- Immutable audit log tracking timestamped status changes and officer notes.

---

### ⏳ Module 4: AI-Powered Document Intelligence (Phase 4 — Core Innovation 1)
- Multi-format ingestion pipeline (PDF, scanned affidavits, building plans, land conversion certificates, FDR guarantees).
- OCR engine with structured key-value extraction and table understanding.
- Discrepancy & Deficiency Engine:
  - Cross-document validation (e.g. land area declared vs. revenue certificate vs. surveyor diagram).
  - Building carpet area vs. approved student intake ratio compliance.
- **Evidence-Linked Inspection**: Deep-linking extracted attributes to visual bounding boxes on source PDF documents for verifiable human oversight.

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
