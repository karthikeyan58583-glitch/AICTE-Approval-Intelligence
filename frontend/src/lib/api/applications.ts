/**
 * Application Intake and Statutory Workflow API Service for Frontend (AIP Module 3).
 * Interacts with backend API and provides client-side resilience and draft recovery.
 */

import { ApplicationRecord, ApplicationType, ApplicationFormData, WorkflowStatus, WorkflowHistoryRecord } from '@/types/applications';
import { createClient } from '@/lib/supabase/client';

export function getApiBaseUrl(): string {
  const envUrl = (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'http://127.0.0.1:8000'
  ).trim().replace(/\/+$/, '');

  // Strip trailing /v1 if already present so `${API_BASE}/v1/...` produces canonical /api/v1/...
  if (envUrl.endsWith('/api/v1')) {
    return envUrl.slice(0, -3);
  }
  // If the base URL ends with /api, use as is
  if (envUrl.endsWith('/api')) {
    return envUrl;
  }
  // Otherwise append /api so `${API_BASE}/v1/...` builds canonical /api/v1/...
  return `${envUrl}/api`;
}

const API_BASE = getApiBaseUrl();

function formatApiError(err: any, fallback: string): string {
  if (
    err?.name === 'TypeError' ||
    err?.message?.toLowerCase().includes('failed to fetch') ||
    err?.message?.toLowerCase().includes('networkerror')
  ) {
    return `Unable to connect to backend service at ${API_BASE}. Please verify that the backend server is running and accessible (check CORS and network connectivity).`;
  }
  return err?.message || fallback;
}

function parseResponseError(errorData: any, fallback: string): string {
  if (typeof errorData?.detail === 'string') {
    return errorData.detail;
  }
  if (Array.isArray(errorData?.detail)) {
    return errorData.detail
      .map((item: any) => `${item?.loc ? item.loc[item.loc.length - 1] : 'Field'}: ${item?.msg || 'invalid'}`)
      .join('; ');
  }
  if (errorData?.message && typeof errorData.message === 'string') {
    return errorData.message;
  }
  return fallback;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    let { data: { session }, error } = await supabase.auth.getSession();
    if (!session?.access_token || error) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session;
    }
    if (session?.access_token) {
      return {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };
    }
  } catch {
    // Session retrieval fallback
  }
  return { 'Content-Type': 'application/json' };
}

// Local draft storage key
const DRAFT_STORAGE_PREFIX = 'aicte_app_draft_v3_';

export function saveLocalDraft(appType: ApplicationType, data: Partial<ApplicationFormData>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${appType}`, JSON.stringify({
      data,
      timestamp: new Date().toISOString(),
    }));
  } catch {
    // Storage quota or error safe guard
  }
}

export function getLocalDraft(appType: ApplicationType): { data: Partial<ApplicationFormData>; timestamp: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${appType}`);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(appType: ApplicationType) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${appType}`);
  } catch {
    // Ignore error
  }
}

/**
 * Sanitizes form payload based on statutory application category:
 * - Omit unused modular sub-schemas (e.g. empty eoa_details during course_addition).
 * - Propagates canonical permanent_id to the active type sub-schema.
 */
export function sanitizeApplicationPayload(
  appType: ApplicationType,
  data: Partial<ApplicationFormData>,
): Partial<ApplicationFormData> {
  const pid = (
    data.permanent_id ||
    (appType === 'extension_of_approval'
      ? data.eoa_details?.permanent_id
      : data.course_addition_details?.permanent_id) ||
    ''
  ).trim();

  const payload: Partial<ApplicationFormData> = {
    academic_year: data.academic_year || '2026-2027',
    institution_name: data.institution_name,
    institution_type: data.institution_type,
    state: data.state,
    district: data.district,
    address: data.address,
    pincode: data.pincode,
    head_of_institution: data.head_of_institution,
    contact_email: data.contact_email,
    contact_phone: data.contact_phone,
    declaration_confirmed: data.declaration_confirmed,
  };

  if (pid) {
    payload.permanent_id = pid;
  }

  if (appType === 'new_institute') {
    payload.programs_courses = data.programs_courses || [];
    payload.infrastructure = data.infrastructure;
  } else if (appType === 'extension_of_approval') {
    payload.eoa_details = {
      permanent_id: pid,
      nba_accredited: data.eoa_details?.nba_accredited || false,
      naac_score: data.eoa_details?.naac_score,
      faculty_cadre_ratio: data.eoa_details?.faculty_cadre_ratio || '1:2:6',
      compliance_declaration: data.eoa_details?.compliance_declaration !== false,
    };
  } else if (appType === 'course_addition') {
    payload.course_addition_details = {
      permanent_id: pid,
      new_course_name: data.course_addition_details?.new_course_name || '',
      level: data.course_addition_details?.level || 'UG',
      proposed_intake: data.course_addition_details?.proposed_intake || 60,
      labs_ready: data.course_addition_details?.labs_ready !== false,
      faculty_recruited: data.course_addition_details?.faculty_recruited || 1,
    };
  }

  return payload;
}

export async function fetchApplications(): Promise<ApplicationRecord[]> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/v1/applications`, { headers });
    if (res.ok) {
      const data = await res.json();
      return data.items || [];
    }
  } catch {
    // Network or offline fallback
  }

  // Fallback: check Supabase directly if available
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('applications')
      .select('*, institutions(name)')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      return data.map((item: any) => ({
        id: item.id,
        application_number: item.application_number,
        institution_id: item.institution_id,
        institution_name: item.institutions?.name || 'Institution',
        application_type: item.application_type,
        academic_year: item.academic_year,
        current_status: item.current_status,
        form_data: item.form_data || {},
        created_by: item.created_by,
        submitted_at: item.submitted_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));
    }
  } catch {
    // Ignore fallback failure
  }

  return [];
}

export async function fetchApplicationById(id: string): Promise<ApplicationRecord | null> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/v1/applications/${id}`, { headers });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fallback
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('applications')
      .select('*, institutions(name)')
      .eq('id', id)
      .single();

    if (!error && data) {
      return {
        id: data.id,
        application_number: data.application_number,
        institution_id: data.institution_id,
        institution_name: data.institutions?.name || 'Institution',
        application_type: data.application_type,
        academic_year: data.academic_year,
        current_status: data.current_status,
        form_data: data.form_data || {},
        created_by: data.created_by,
        submitted_at: data.submitted_at,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    }
  } catch {
    // Ignore
  }

  return null;
}

export async function createApplicationDraft(
  application_type: ApplicationType,
  institution_name?: string,
  form_data?: Partial<ApplicationFormData>,
): Promise<ApplicationRecord> {
  const headers = await getAuthHeader();
  if (!headers.Authorization) {
    throw new Error('Authentication session not active. Please sign in to save your application draft.');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/applications/draft`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        application_type,
        academic_year: '2026-2027',
        institution_name,
        form_data: form_data || {},
      }),
    });
  } catch (err: any) {
    throw new Error(formatApiError(err, 'Failed to connect to backend to initialize application draft.'));
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}: ${res.statusText || 'Server Error'}` }));
    throw new Error(parseResponseError(errorData, 'Failed to create draft'));
  }

  return await res.json();
}

export async function updateApplicationDraft(
  id: string,
  form_data: Partial<ApplicationFormData>,
): Promise<ApplicationRecord> {
  const headers = await getAuthHeader();
  if (!headers.Authorization) {
    throw new Error('Authentication session not active. Please sign in to update your application draft.');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/applications/${id}/draft`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ form_data }),
    });
  } catch (err: any) {
    throw new Error(formatApiError(err, 'Failed to connect to backend to update application draft.'));
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}: ${res.statusText || 'Server Error'}` }));
    throw new Error(parseResponseError(errorData, 'Failed to update draft'));
  }

  return await res.json();
}

export async function submitApplication(
  id: string,
  form_data: Partial<ApplicationFormData>,
): Promise<ApplicationRecord> {
  const headers = await getAuthHeader();
  if (!headers.Authorization) {
    throw new Error('Authentication session not active. Please sign in to submit your statutory application.');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/applications/${id}/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        form_data,
        declaration_confirmed: true,
      }),
    });
  } catch (err: any) {
    throw new Error(formatApiError(err, 'Failed to connect to backend to submit application.'));
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}: ${res.statusText || 'Server Error'}` }));
    throw new Error(parseResponseError(errorData, 'Submission validation failed'));
  }

  return await res.json();
}

export async function transitionApplication(
  id: string,
  target_status: WorkflowStatus,
  action: string,
  transition_notes?: string,
): Promise<ApplicationRecord> {
  const headers = await getAuthHeader();
  if (!headers.Authorization) {
    throw new Error('Authentication session not active. Please sign in to transition application status.');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/applications/${id}/transition`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        target_status,
        action,
        transition_notes,
      }),
    });
  } catch (err: any) {
    throw new Error(formatApiError(err, 'Failed to connect to backend to transition application.'));
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}: ${res.statusText || 'Server Error'}` }));
    throw new Error(parseResponseError(errorData, 'State transition rejected'));
  }

  return await res.json();
}

export async function fetchWorkflowTimeline(id: string): Promise<WorkflowHistoryRecord[]> {
  const headers = await getAuthHeader();
  try {
    const res = await fetch(`${API_BASE}/v1/applications/${id}/history`, { headers });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fallback
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('application_workflow_history')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      return data;
    }
  } catch {
    // Ignore
  }

  return [];
}
