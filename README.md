# AICTE Approval Intelligence Platform (AIP)

> **Smart India Hackathon — Problem Statement 26262**  
> *Integrated AICTE Approval Workflow Automation, Compliance Monitoring and Alert Management System*

[![Backend Health](https://img.shields.io/badge/FastAPI-Healthy-success?logo=fastapi)](http://127.0.0.1:8000/api/health)
[![Frontend Status](https://img.shields.io/badge/Next.js-16%20App%20Router-black?logo=next.js)](http://localhost:3000)
[![Python Version](https://img.shields.io/badge/Python-3.13-blue?logo=python)](https://python.org)
[![Auth Security](https://img.shields.io/badge/Supabase-Auth%20%26%20RBAC-teal?logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/Status-Module%202%20Verified-emerald)]()

---

## 1. Overview & Core Innovations

The **AICTE Approval Intelligence Platform (AIP)** is a high-reliability regulatory intelligence system designed to streamline, accelerate, and safeguard institutional accreditation and approval processes across technical education institutions in India.

The platform addresses two fundamental operational challenges:
1. **AI-Powered Document Intelligence:** Automated information extraction from institutional filings, cross-document discrepancy auditing, deficiency detection, and evidence-linked bounding box verification.
2. **Explainable Bottleneck Detection:** Transparent queue telemetry, processing time benchmarking, workload variance analysis, and explainable delay attribution across statutory approval stages.

---

## 2. Architecture & Monorepo Structure

```
AICTE-Approval-Intelligence/
├── frontend/                     # Next.js 16 App Router (TypeScript, Tailwind CSS, Lucide)
│   ├── src/
│   │   ├── proxy.ts              # Next.js 16 Routing Proxy for session refresh & RBAC
│   │   ├── app/                  # Route handlers & auth views (/login, /register, etc.)
│   │   ├── components/           # AppShell, Sidebar, TopNavbar, Dashboard widgets
│   │   ├── lib/
│   │   │   ├── auth/             # AuthContext, role definitions, permissions matrix
│   │   │   ├── supabase/         # SSR client, server client, proxy session helper
│   │   │   └── mock-data.ts      # Unified demo data source of truth
│   │   └── types/                # Strict TypeScript domain interfaces
│   ├── package.json              # Client dependencies
│   └── .env.example              # Client environment variables template
│
├── backend/                      # Python 3.13 FastAPI Microservice
│   ├── app/
│   │   ├── main.py               # FastAPI entry point & CORS configuration
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic Settings configuration
│   │   │   └── security.py       # Cryptographic bearer token validation & RBAC
│   │   ├── api/v1/api.py         # API router registration
│   │   └── api/v1/endpoints/     # Public health & protected demonstration endpoints
│   ├── tests/
│   │   └── test_auth_rbac.py     # Automated pytest suite (9 tests passing)
│   ├── pyproject.toml            # uv Python project configuration
│   └── .env.example              # Backend environment variables template
│
├── supabase/                     # Database Migrations & Security Schemas
│   └── migrations/
│       └── 20261022000001_auth_roles_schema.sql # RLS & role anti-tampering triggers
│
├── docs/                         # Engineering specifications
│   ├── ARCHITECTURE.md           # System architecture & component topology
│   ├── DEVELOPMENT.md            # Supabase setup, developer workflow & testing guide
│   └── MODULE_ROADMAP.md         # Phased 7-phase / 14-module delivery roadmap
├── .editorconfig                 # Shared code formatting standards
├── .gitignore                    # Git tracking exclusions
└── README.md                     # Project documentation (this file)
```

---

## 3. Supported Regulatory Roles & Navigation Intentions

Module 2 introduces five standardized regulatory roles matching the AICTE Approval Process Handbook (APH):

1. **`applicant_institution_representative`**: Technical college representative filing applications, rectifying deficiencies, and tracking review status. Access: `/`, `/applications`, `/documents`, `/alerts`.
2. **`regional_scrutiny_officer`**: Regional AICTE officer inspecting affidavits, issuing deficiencies, and managing regional queues. Access: `/`, `/applications`, `/documents`, `/bottlenecks`, `/compliance`, `/alerts`, `/reports`.
3. **`evc_evaluator`**: Expert Visiting Committee member verifying campus facilities and physical infrastructure. Access: `/`, `/applications`, `/documents`.
4. **`shc_member`**: Standing Hearing Committee member presiding over institutional appeal hearings. Access: `/`, `/applications`, `/documents`.
5. **`aicte_executive_admin`**: Central AICTE administration with full statutory governance and administrative access. Access: **All platform sections**, including `/admin`.

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

# Run the automated Auth & RBAC test suite
uv run pytest tests/test_auth_rbac.py -v

# Start the FastAPI server
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Health Endpoint:** [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)
- **Protected Endpoint (User Profile):** [http://127.0.0.1:8000/api/v1/auth/me](http://127.0.0.1:8000/api/v1/auth/me)
- **Admin-Restricted Endpoint:** [http://127.0.0.1:8000/api/v1/auth/admin-dossier](http://127.0.0.1:8000/api/v1/auth/admin-dossier)
- **Interactive Swagger Docs:** [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs)

### Terminal 2: Launch Frontend (Next.js)

```powershell
Set-Location -Path "d:\AICTE-Approval-Intelligence\frontend"

# Ensure environment file exists
Copy-Item -Path ".env.example" -Destination ".env.local"

# Install frontend dependencies
npm install --legacy-peer-deps

# Run frontend role authorization tests
npx tsx src/lib/auth/roles.test.ts

# Start the Next.js development server
npm run dev
```

- **Application Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Sign In Portal:** [http://localhost:3000/login](http://localhost:3000/login)
- **Representative Registration:** [http://localhost:3000/register](http://localhost:3000/register)

---

## 5. Verification & Testing Summary

| Test Suite | Scope | Result |
| :--- | :--- | :--- |
| **Backend Pytest** (`tests/test_auth_rbac.py`) | 9 unit tests: Public health, missing token (401), invalid/expired token (401), authenticated profile (200), applicant forbidden from admin (403), officer queue access (200), admin full clearance (200). | **9 PASSED** (100%) |
| **Frontend Role Matrix** (`src/lib/auth/roles.test.ts`) | Route permission validation across all 5 roles, public access rules, and navigation menu filtering. | **ALL PASSED** |
| **TypeScript Validation** | Static compiler analysis (`npx tsc --noEmit`). | **0 Errors** |
| **Frontend Linting** | ESLint static analysis (`npm run lint`). | **0 Errors, 0 Warnings** |
| **Next.js Production Build** | Full application build (`npm run build`). | **18 Pages Statically Generated** with `ƒ Proxy (Middleware)` active |

---

## 6. Phased Roadmap Progress

See [docs/MODULE_ROADMAP.md](file:///d:/AICTE-Approval-Intelligence/docs/MODULE_ROADMAP.md) for the cross-mapping of our 7 phases and 14 detailed modules:
- **Module 1 (Done):** Project foundation, enterprise application shell, unified mock data layer, API health endpoint.
- **Module 2 (Done):** Supabase Auth integration, Next.js 16 routing proxy (`src/proxy.ts`), 5 regulatory roles, SQL RLS policies, and protected FastAPI endpoints.
- **Module 3 (Next Recommended):** Application Intake Wizards & Statutory Approval State Machine.
- **Module 4:** AI-Powered Document Intelligence & Verification Pipeline.
- **Module 5:** Explainable Bottleneck Detection & Queue Telemetry.
- **Module 6:** Continuous Compliance Auditing & Proactive Alert Dispatcher.
- **Module 7:** Statutory Audit Dossiers, RTI Exports & Hackathon Production Polish.
