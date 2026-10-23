# AICTE Approval Intelligence Platform (AIP)

> **Smart India Hackathon — Problem Statement 26262**  
> *Integrated AICTE Approval Workflow Automation, Compliance Monitoring and Alert Management System*

[![Backend Health](https://img.shields.io/badge/FastAPI-Healthy-success?logo=fastapi)](http://127.0.0.1:8000/api/health)
[![Frontend Status](https://img.shields.io/badge/Next.js-16%20App%20Router-black?logo=next.js)](http://localhost:3000)
[![Python Version](https://img.shields.io/badge/Python-3.13-blue?logo=python)](https://python.org)
[![Auth Security](https://img.shields.io/badge/Supabase-Auth%20%26%20RBAC-teal?logo=supabase)](https://supabase.com)
[![Status](https://img.shields.io/badge/Status-Module%204%20Complete-emerald)]()

---

## 1. Overview & Core Innovations

The **AICTE Approval Intelligence Platform (AIP)** is a high-reliability regulatory intelligence system designed to streamline, accelerate, and safeguard institutional accreditation and approval processes across technical education institutions in India.

The platform addresses core operational challenges:
1. **AI-Powered Document Intelligence & Secure Evidence Management:** Automated information extraction from institutional filings, cross-document discrepancy auditing, deficiency detection, evidence-linked bounding box verification, and secure private document management.
2. **Explainable Bottleneck Detection:** Transparent queue telemetry, processing time benchmarking, workload variance analysis, and explainable delay attribution across statutory approval stages.

---

## 2. Architecture & Monorepo Structure

```
AICTE-Approval-Intelligence/
├── frontend/                     # Next.js 16 App Router (TypeScript, Tailwind CSS, Lucide)
│   ├── src/
│   │   ├── proxy.ts              # Next.js 16 Routing Proxy for session refresh & RBAC
│   │   ├── app/
│   │   │   ├── applications/     # Module 3 Applications & Module 4 Evidence
│   │   │   │   ├── page.tsx      # Application list, metrics, search, and filters
│   │   │   │   ├── new/page.tsx  # 5-step intake wizard (New Institute, EoA, Course Addition)
│   │   │   │   └── [id]/         # Application dossier, detail disclosures & audit timeline
│   │   │   │       ├── page.tsx  # Tabbed application dossier & statutory document view
│   │   │   │       └── DocumentManagementSection.tsx # Checklist, PDF upload, and scrutiny review
│   │   │   ├── login/            # Module 2 Authentication Views
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── api/              # Applications & Documents client API
│   │   │   └── ...
│   │   └── types/                # Strict TypeScript domain interfaces
│   ├── package.json              # Client dependencies
│   └── .env.example              # Client environment variables template
│
├── backend/                      # Python 3.13 FastAPI Microservice
│   ├── app/
│   │   ├── main.py               # FastAPI entry point & CORS configuration
│   │   ├── worker.py             # CLI runner for durable storage deletion worker
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic Settings configuration
│   │   │   ├── security.py       # Cryptographic bearer token validation & RBAC
│   │   │   └── workflow.py       # Statutory workflow state machine engine (10 states)
│   │   ├── schemas/
│   │   │   ├── documents.py      # Module 4 Document models, checklist & review schemas
│   │   │   └── applications.py   # Pydantic models for application types & transitions
│   │   ├── services/
│   │   │   ├── document_service.py # PDF validation, path generation & storage coordination
│   │   │   ├── document_cleanup_worker.py # Durable storage deletion outbox worker
│   │   │   └── application_store.py # Authoritative storage, isolation & validation
│   │   └── api/v1/endpoints/
│   │       ├── documents.py      # REST API for upload, checklist, download, delete & review
│   │       ├── applications.py   # REST API for application lifecycle & transitions
│   │       └── health.py         # Public health probe (/api/health)
│   ├── tests/
│   │   ├── test_document_management_schema.py # Module 4 database & storage security tests
│   │   ├── test_document_endpoints.py         # Module 4 API endpoints & validation tests
│   │   ├── test_applications_workflow.py     # Application lifecycle & state machine tests
│   │   └── test_sql_security_ast.py          # PostgreSQL native C-parser AST security checks
│   ├── pyproject.toml            # uv Python project configuration
│   └── .env.example              # Backend environment variables template
│
├── supabase/                     # Database Migrations & Security Schemas
│   └── migrations/
│       ├── 20261022000001_auth_roles_schema.sql         # Module 2 base auth/roles schema (deployed)
│       ├── 20261023000001_core_applications_workflow.sql # Module 3 additive data model & state machine (deployed)
│       ├── 20261023000002_module_3_rls_hardening.sql    # Module 3 RLS hardening (deployed)
│       └── 20261023000003_module_4_document_management.sql # Module 4 private storage & outbox queue (deployed)
│
├── docs/                         # Engineering specifications
│   ├── ARCHITECTURE.md           # System architecture & component topology
│   ├── DEVELOPMENT.md            # Supabase setup, developer workflow & testing guide
│   └── MODULE_ROADMAP.md         # Phased 7-phase / 14-module delivery roadmap
└── README.md                     # Project documentation

```

---

## 3. Supported Regulatory Roles & Statutory State Machine

### 3.1 Five Regulated Personas
1. **`applicant_institution_representative`**: Technical college representative filing applications, saving drafts, rectifying deficiencies, and tracking review status.
2. **`regional_scrutiny_officer`**: Regional AICTE officer inspecting affidavits, issuing deficiencies, and managing regional queues.
3. **`evc_evaluator`**: Expert Visiting Committee member verifying campus facilities and physical infrastructure.
4. **`shc_member`**: Standing Hearing Committee member presiding over institutional appeal hearings.
5. **`aicte_executive_admin`**: Central AICTE administration with full statutory governance and administrative access.

### 3.2 Controlled Statutory Workflow States (10 States)
The platform models the statutory approval lifecycle defined by the AICTE Approval Process Handbook (APH):

| State | Name | Description | Authorized Transitions |
| :--- | :--- | :--- | :--- |
| `draft` | Draft Application | Under preparation by applicant | ➔ `submitted`, ➔ `withdrawn` |
| `submitted` | Submitted | Officially lodged; assigned AICTE reference | ➔ `regional_scrutiny` |
| `regional_scrutiny` | Regional Scrutiny | Officer verifying cadastral/academic data | ➔ `deficiency_resolution`, ➔ `evc_evaluation`, ➔ `sac_review`, ➔ `rejected` |
| `deficiency_resolution`| Deficiency Resolution | Returned to applicant for rectification | ➔ `regional_scrutiny` (with compliance note) |
| `evc_evaluation` | EVC Evaluation | Expert Visiting Committee inspection | ➔ `sac_review`, ➔ `deficiency_resolution` |
| `sac_review` | SAC Review | Standing Appraisal Committee review | ➔ `shc_hearing`, ➔ `approved`, ➔ `rejected` |
| `shc_hearing` | SHC Hearing | Standing Hearing Committee hearing | ➔ `approved`, ➔ `rejected` |
| `approved` | Approved / Issued | Letter of Approval (LoA) / EoA issued | *Terminal State* |
| `rejected` | Rejected | Final statutory denial | *Terminal State* |
| `withdrawn` | Withdrawn | Voluntarily withdrawn by applicant | *Terminal State* |

---

## 4. Quick Start (Windows PowerShell)

Run both the backend and frontend services in separate PowerShell terminals:

### Terminal 1: Launch Backend (FastAPI)

```powershell
Set-Location -Path "d:\AICTE-Approval-Intelligence\backend"

# Ensure environment file exists
Copy-Item -Path ".env.example" -Destination ".env"

# Sync dependencies with uv
uv sync

# Run the complete test suite (29 tests)
uv run pytest -v

# Start the FastAPI server
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Health Endpoint:** [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)
- **Application Endpoints:** [http://127.0.0.1:8000/api/applications](http://127.0.0.1:8000/api/applications)
- **Interactive Swagger Docs:** [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs)

### Terminal 2: Launch Frontend (Next.js)

```powershell
Set-Location -Path "d:\AICTE-Approval-Intelligence\frontend"

# Ensure environment file exists
Copy-Item -Path ".env.example" -Destination ".env.local"

# Run frontend role authorization tests
npx tsx src/lib/auth/roles.test.ts

# Start the Next.js development server
npm run dev
```

- **Applications Directory:** [http://localhost:3000/applications](http://localhost:3000/applications)
- **New Application Wizard:** [http://localhost:3000/applications/new](http://localhost:3000/applications/new)
- **Sign In Portal:** [http://localhost:3000/login](http://localhost:3000/login)

---

## 5. Verification & Testing Summary

| Test Suite | Scope | Result |
| :--- | :--- | :--- |
| **Workflow State Machine** (`tests/test_applications_workflow.py`) | 7 comprehensive integration tests: Anonymous blocked (401), draft creation & listing, draft update persistence, invalid payload rejection (422), valid submission with reference generation & history, applicant transition block, scrutiny officer lifecycle with deficiency resolution loop. | **7 PASSED** (100%) |
| **Backend Auth & RBAC** (`tests/test_auth_rbac.py`) | 9 unit tests: Public health, missing token (401), invalid/expired token (401), authenticated profile (200), applicant forbidden from admin (403), officer queue access (200), admin full clearance (200). | **9 PASSED** (100%) |
| **SQL Security & AST** (`tests/test_sql_security_ast.py`) | 13 static AST tests using native PostgreSQL C-parser (`pglast`): Module 2 & Module 3 migration syntax (53 statements), `search_path = ''` hardening, parameterless admin checks, append-only history triggers, and RLS enforcement. | **13 PASSED** (100%) |
| **Frontend Role Matrix** (`src/lib/auth/roles.test.ts`) | Route permission validation across all 5 roles, public access rules, and navigation menu filtering. | **ALL PASSED** |
| **TypeScript Validation** | Static compiler analysis (`npx tsc --noEmit`). | **0 Errors** |
| **Next.js Production Build** | Full application build (`npm run build`). | **20 Pages Generated** (`/applications`, `/applications/new`, `/applications/[id]` active) |

---

## 6. Manual Supabase Migration Instructions (Module 3)

The Module 2 authentication migration (`20261022000001_auth_roles_schema.sql`) has been deployed to the hosted project (`tgtksnkagptxnelyctdc`).

The Module 3 migration (`20261023000001_core_applications_workflow.sql`) is purely additive and version-controlled. To apply it to the hosted Supabase project:

1. Open your terminal in the workspace root.
2. Run:
   ```bash
   npx supabase db push
   ```
   Or paste the contents of `supabase/migrations/20261023000001_core_applications_workflow.sql` directly into the **Supabase Dashboard ➔ SQL Editor** and click **Run**.
3. Verify that the tables `institutions`, `institution_memberships`, `applications`, and `application_workflow_history` are created with RLS enabled.

---

## 7. Phased Roadmap Progress

See [docs/MODULE_ROADMAP.md](file:///d:/AICTE-Approval-Intelligence/docs/MODULE_ROADMAP.md):
- **Module 1 (Done):** Project foundation, enterprise application shell, unified mock data layer, API health endpoint.
- **Module 2 (Done):** Supabase Auth integration, Next.js 16 routing proxy (`src/proxy.ts`), 5 regulatory roles, SQL RLS policies, and protected FastAPI endpoints.
- **Module 3 (Done):** Core data model, multi-step application intake wizards, draft persistence, and statutory workflow state machine.
- **Module 4 (Next):** AI-Powered Document Intelligence & Verification Pipeline.
- **Module 5:** Explainable Bottleneck Detection & Queue Telemetry.
- **Module 6:** Continuous Compliance Auditing & Proactive Alert Dispatcher.
- **Module 7:** Statutory Audit Dossiers, RTI Exports & Hackathon Production Polish.
