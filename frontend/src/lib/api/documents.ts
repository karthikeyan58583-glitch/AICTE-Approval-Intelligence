/**
 * Document Intelligence & Statutory Evidence API Service for Frontend (AIP Module 4).
 * Communicates with backend endpoints for uploading, listing, checklist checking,
 * downloading, deleting, and regulatory review of application documents.
 */

import {
  ApplicationDocument,
  DocumentType,
  DocumentReviewPayload,
  DocumentChecklistResponse,
  DocumentDeleteResponse,
} from '@/types/documents';
import { createClient } from '@/lib/supabase/client';

import { getApiBaseUrl } from './applications';

const API_BASE = getApiBaseUrl();

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return {
        Authorization: `Bearer ${session.access_token}`,
      };
    }
  } catch {
    // Session retrieval fallback
  }
  return {};
}

/**
 * Lists all authorized statutory documents uploaded for an application.
 */
export async function fetchApplicationDocuments(applicationId: string): Promise<ApplicationDocument[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/applications/${applicationId}/documents`, {
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch documents (HTTP ${res.status})`);
  }

  const data = await res.json();
  return data.items || [];
}

/**
 * Retrieves the statutory document compliance checklist for an application.
 */
export async function fetchDocumentChecklist(applicationId: string): Promise<DocumentChecklistResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/applications/${applicationId}/documents/checklist`, {
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch document checklist (HTTP ${res.status})`);
  }

  return await res.json();
}

/**
 * Uploads a statutory PDF document with server-side validation and metadata registration.
 */
export async function uploadApplicationDocument(
  applicationId: string,
  documentType: DocumentType,
  file: File,
): Promise<ApplicationDocument> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('document_type', documentType);
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/v1/applications/${applicationId}/documents`, {
    method: 'POST',
    headers: {
      ...headers,
      // Note: Browser automatically sets Content-Type to multipart/form-data with boundary
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to upload document (HTTP ${res.status})`);
  }

  return await res.json();
}

/**
 * Deletes a document metadata row and enqueues storage binary cleanup.
 */
export async function deleteApplicationDocument(documentId: string): Promise<DocumentDeleteResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/documents/${documentId}`, {
    method: 'DELETE',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to delete document (HTTP ${res.status})`);
  }

  return await res.json();
}

/**
 * Records a regulatory scrutiny evaluation determination (verify, flag deficiency, reject).
 */
export async function reviewApplicationDocument(
  documentId: string,
  payload: DocumentReviewPayload,
): Promise<ApplicationDocument> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/documents/${documentId}/review`, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to record review determination (HTTP ${res.status})`);
  }

  return await res.json();
}

/**
 * Downloads or opens the authorized document binary via authenticated backend streaming.
 */
export async function downloadApplicationDocument(documentId: string, filename: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/v1/documents/${documentId}/download`, {
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to download document (HTTP ${res.status})`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'document.pdf';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
