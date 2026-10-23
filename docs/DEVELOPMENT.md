# Developer Setup & Local Execution Guide

This guide describes how to run, configure, and test both the **Frontend** and **Backend** services for the **AICTE Approval Intelligence Platform (AIP)**, including **Module 2 Authentication & Role-Based Access Control (RBAC)**.

---

## Prerequisites

Ensure the following tools are installed:
- **Node.js**: `v20.x` or later (Tested with `v24.22.x`)
- **npm**: `v10.x` or later (Tested with `v11.19.x`)
- **Python**: `3.13.x`
- **uv**: `0.13.x` or later
- **Git**: `2.x`

---

## 1. Supabase Project Setup (Module 2)

AIP uses Supabase Auth for identity management, session governance, and database-level Row Level Security (RLS).

### Step 1.1: Create a Supabase Project
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard) and create a new project (e.g. `aicte-approval-intelligence`).
2. Navigate to **Project Settings ➔ API** and copy:
   - **Project URL**
   - **anon / public key**
   - **JWT Secret** (optional, for ultra-fast local HMAC backend token validation)

### Step 1.2: Apply Database Schema Migration
Open the **SQL Editor** in your Supabase Dashboard and execute the SQL file:
```
supabase/migrations/20261022000001_auth_roles_schema.sql
```

This migration provisions:
- The `app_role` enum (`applicant_institution_representative`, `regional_scrutiny_officer`, `evc_evaluator`, `shc_member`, `aicte_executive_admin`).
- The `public.user_profiles` table linked to `auth.users(id)` with RLS policies.
- An automatic trigger (`handle_new_auth_user`) that ensures public registrations always default to `applicant_institution_representative`.
- An anti-tampering trigger (`protect_user_role_elevation`) preventing non-admin self-elevation.

### Step 1.3: Configure Authentication Redirect URLs
In **Authentication ➔ URL Configuration**:
- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: Add `http://localhost:3000/auth/callback`

### Step 1.4: Assigning Privileged Roles for Testing
Since public signups strictly default to the applicant representative role, use the Supabase SQL editor to promote test accounts:

```sql
-- Promote an account to Regional Scrutiny Officer
UPDATE public.user_profiles
SET role = 'regional_scrutiny_officer', regional_office = 'Southern Regional Office (SRO)'
WHERE email = 'officer@example.com';

-- Promote an account to AICTE Executive Administrator
UPDATE public.user_profiles
SET role = 'aicte_executive_admin'
WHERE email = 'admin@example.com';
```

---

## 2. Backend Service Setup (FastAPI)

The backend service is located in `backend/` and utilizes `uv` for reproducible environments.

### Step 2.1: Navigate and Configure Environment
Open a dedicated Windows PowerShell terminal:

```powershell
Set-Location -Path "d:\AICTE-Approval-Intelligence\backend"

# Ensure .env exists with your settings
Copy-Item -Path ".env.example" -Destination ".env"
```

Configure `backend/.env`:
```ini
ENVIRONMENT=development
API_V1_STR=/api
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
SUPABASE_JWT_SECRET="your-supabase-jwt-secret"
```

### Step 2.2: Install Dependencies & Run Tests
```powershell
uv sync

# Run the automated Auth & RBAC test suite
uv run pytest tests/test_auth_rbac.py -v
```

### Step 2.3: Start the Backend Development Server
```powershell
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Health Endpoint:** `http://127.0.0.1:8000/api/health`
- **Protected Endpoint (Caller Profile):** `http://127.0.0.1:8000/api/v1/auth/me`
- **Admin Only Endpoint:** `http://127.0.0.1:8000/api/v1/auth/admin-dossier`
- **Interactive Swagger Documentation:** `http://127.0.0.1:8000/api/docs`

---

## 3. Frontend Application Setup (Next.js)

The client application is located in `frontend/` and runs Next.js 16 with TypeScript and Tailwind CSS.

### Step 3.1: Navigate and Configure Environment
Open a second dedicated Windows PowerShell terminal:

```powershell
Set-Location -Path "d:\AICTE-Approval-Intelligence\frontend"

# Ensure .env.local exists
Copy-Item -Path ".env.example" -Destination ".env.local"
```

Configure `frontend/.env.local`:
```ini
NEXT_PUBLIC_APP_NAME="AICTE Approval Intelligence Platform"
NEXT_PUBLIC_APP_SHORT_NAME="AIP"
NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:8000"
NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
```

### Step 3.2: Install Frontend Dependencies & Run Tests
```powershell
npm install --legacy-peer-deps

# Run frontend role authorization tests
npx tsx src/lib/auth/roles.test.ts
```

### Step 3.3: Start the Development Server
```powershell
npm run dev
```

- **Application Web UI:** `http://localhost:3000`
- **Sign In Page:** `http://localhost:3000/login`
- **Institutional Registration:** `http://localhost:3000/register`

---

## 4. Dual Service Execution Reference

| Service | Working Directory | Command | Target URL |
| :--- | :--- | :--- | :--- |
| **Backend API** | `backend/` | `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload` | `http://127.0.0.1:8000/api/health` |
| **Frontend Web**| `frontend/`| `npm run dev` | `http://localhost:3000` |

---

## 5. Verification Checklist for Module 2

- [x] Next.js 16 routing proxy (`src/proxy.ts`) refreshes sessions and enforces route authorization.
- [x] Unauthenticated requests to protected pages redirect to `/login?redirectTo=...`.
- [x] Unauthorized role access triggers `/access-denied` (e.g. Applicant navigating to `/admin`).
- [x] Sidebar dynamically filters navigation items based on active role permissions.
- [x] Public registration defaults strictly to `applicant_institution_representative`.
- [x] SQL trigger prevents client-side role elevation.
- [x] FastAPI dependency cryptographically verifies Supabase bearer tokens.
- [x] FastAPI RBAC dependency rejects unauthorized roles with 403 Forbidden.
- [x] Public health endpoint (`/api/health`) remains unhindered.
- [x] All 9 backend pytest tests and frontend role unit tests pass.
- [x] Next.js production build (`npm run build`) completes with zero errors.

---

## 6. Module 3: Application Intake & Statutory Workflow Setup

Module 3 provisions the statutory application models and workflow state machine for technical institution approvals.

### Step 6.1: Database Migration
Execute the additive migration in the Supabase SQL Editor:
```
supabase/migrations/20261023000001_core_applications_workflow.sql
```
This adds:
- `institutions`, `institution_memberships`, `applications`, and `application_workflow_history`.
- Hardened RLS policies ensuring applicant institutional isolation and regulatory reviewer visibility.
- Triggers protecting immutable application reference numbers and enforcing append-only workflow audit logs.

### Step 6.2: Running the Module 3 Automated Test Suites
```powershell
Set-Location -Path "d:\AICTE-Approval-Intelligence\backend"

# Run the 29-test backend suite
uv run pytest -v
```

### Step 6.3: Testing the Application Intake Wizard
1. Sign in as an applicant representative at `http://localhost:3000/login`.
2. Navigate to **Applications** (`http://localhost:3000/applications`).
3. Click **New Application Intake** to launch the 5-step wizard (`http://localhost:3000/applications/new`).
4. Select category (`New Institute`, `Extension of Approval`, or `Course Addition`), input details, save draft, and submit.
5. Inspect the generated permanent reference (`AICTE-2026-APP-XXXXX`) and chronological audit timeline in the Application Dossier (`http://localhost:3000/applications/[id]`).

---

## 7. Module 4: Secure Document Management, Storage & Cleanup Worker Guide

Module 4 adds private Supabase Storage integration, PDF structural integrity validation, SHA-256 persistence, outbox-pattern durable file deletion, and regulatory scrutiny review workflows.

### Step 7.1: Backend Environment Configuration
Ensure `backend/.env` contains the required keys:

```ini
ENVIRONMENT=development
API_V1_STR=/api
SUPABASE_URL="https://tgtksnkagptxnelyctdc.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"  # REQUIRED for durable storage cleanup worker & download streaming
SUPABASE_JWT_SECRET="your-supabase-jwt-secret"
```

> [!CAUTION]
> `SUPABASE_SERVICE_ROLE_KEY` must **NEVER** be placed in `frontend/.env`, client bundles, or frontend environment variables! It is strictly backend-only.

### Step 7.2: Running the Automated Test Suites
Run the dedicated Module 4 tests and full backend regression suite from Windows PowerShell:

```powershell
Set-Location -Path "d:\AICTE-Approval-Intelligence\backend"

# 1. Run database schema & AST security audit tests (44 tests)
uv run pytest tests/test_document_management_schema.py -v

# 2. Run API endpoints & workflow state protection tests (15 tests)
uv run pytest tests/test_document_endpoints.py -v

# 3. Run full backend regression suite (116 passed tests)
uv run pytest tests/ -v
```

### Step 7.3: Running the Durable Storage Cleanup Worker Locally
The cleanup worker operates asynchronously on the durable PostgreSQL outbox queue (`public.document_storage_deletion_queue`) without executing direct SQL `DELETE` on Supabase `storage.objects`.

```powershell
Set-Location -Path "d:\AICTE-Approval-Intelligence\backend"

# Display CLI options and usage
uv run python -m app.worker --help

# Process currently pending deletion items once and exit (ideal for cron or test verification)
uv run python -m app.worker --once

# Continuous polling daemon mode (polling every 30 seconds with 5-minute crash-recovery leases)
uv run python -m app.worker --interval 30 --batch-size 50 --lease-seconds 300
```

### Step 7.4: Production Scheduler & Worker Deployment
In production, run the worker as an isolated scheduled task or daemon rather than embedding an unmanaged thread in each FastAPI web worker:

1. **Systemd Service (Linux/Ubuntu VM):**
   ```ini
   [Unit]
   Description=AICTE Document Storage Deletion Worker
   After=network.target

   [Service]
   Type=simple
   User=aicte
   WorkingDirectory=/opt/aicte/backend
   ExecStart=/root/.cargo/bin/uv run python -m app.worker --interval 30 --batch-size 50
   Restart=on-failure
   RestartSec=10
   EnvironmentFile=/opt/aicte/backend/.env

   [Install]
   WantedBy=multi-user.target
   ```

2. **Cron Execution (Every 5 minutes):**
   ```bash
   */5 * * * * cd /opt/aicte/backend && /root/.cargo/bin/uv run python -m app.worker --once >> /var/log/aicte-worker.log 2>&1
   ```

3. **Cloud Run / Container Job:**
   Invoke the container entry point: `python -m app.worker --once`.

### Step 7.5: Frontend Production Build & UI Verification
```powershell
Set-Location -Path "d:\AICTE-Approval-Intelligence\frontend"

# Compile Next.js 16 production build
npm run build
```

### Step 7.6: Manual Walkthrough Procedure
1. **Applicant Document Upload & Checklist:**
   - Log in as an applicant representative.
   - Navigate to `/applications/[id]` and click the **Statutory Documents & Scrutiny** tab.
   - View the AICTE APH Statutory Document Checklist card showing required vs missing items.
   - Click **Upload Document**, pick category (e.g. `Registered Land Deed`), select a valid PDF file, and submit.
   - Verify that the table updates with safe display filename, size, and SHA-256 hash.
   - Click the **Download** action to verify streaming retrieval.

2. **Uploader Document Deletion:**
   - In draft state, click the **Trash** icon to delete the uploaded document.
   - Confirm that the row is removed from metadata and enqueued into `document_storage_deletion_queue`.
   - Run `uv run python -m app.worker --once` to process the binary deletion.

3. **Reviewer Document Scrutiny:**
   - Log in as a Regulatory Scrutiny Officer (`regional_scrutiny_officer`).
   - Navigate to `/applications/[id]`, switch to the **Statutory Documents & Scrutiny** tab.
   - Click the **Shield** icon next to any document to launch the scrutiny modal.
   - Select `Verified Valid`, `Deficiency Flagged`, or `Rejected`.
   - For deficiencies or rejections, enter official statutory remarks and submit.
   - Confirm that the status badge updates and non-repudiation stamps the officer's ID and timestamp.


