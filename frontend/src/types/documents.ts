/**
 * Document Intelligence & Statutory Evidence Type Definitions (AIP Module 4 Phase 1)
 */

export type DocumentType =
  | 'land_ownership_deed'
  | 'land_use_certificate'
  | 'building_plan_approval'
  | 'fire_safety_certificate'
  | 'structural_stability_certificate'
  | 'architect_certificate'
  | 'fdr_guarantee'
  | 'aicte_affidavit'
  | 'society_trust_deed'
  | 'other_statutory';

export type DocumentVerificationStatus =
  | 'pending_review'
  | 'verified_valid'
  | 'deficiency_flagged'
  | 'rejected';

export interface ApplicationDocument {
  id: string;
  application_id: string;
  document_type: DocumentType;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  file_hash_sha256?: string;
  uploaded_by: string;
  uploaded_at: string;
  verification_status: DocumentVerificationStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  review_comments?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentUploadPayload {
  application_id: string;
  document_type: DocumentType;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  file_hash_sha256?: string;
}

export interface DocumentReviewPayload {
  verification_status: Exclude<DocumentVerificationStatus, 'pending_review'>;
  review_comments?: string;
}

export interface DocumentChecklistItem {
  document_type: DocumentType;
  title: string;
  description: string;
  is_mandatory: boolean;
  status: string; // 'missing' | 'pending_review' | 'verified_valid' | 'deficiency_flagged' | 'rejected'
  document?: ApplicationDocument | null;
}

export interface DocumentChecklistResponse {
  application_id: string;
  application_type: string;
  is_complete: boolean;
  mandatory_count: number;
  uploaded_mandatory_count: number;
  items: DocumentChecklistItem[];
}

export interface DocumentDeleteResponse {
  message: string;
  document_id: string;
  storage_path: string;
  queued_for_cleanup: boolean;
}


export const DOCUMENT_TYPE_LABELS: Record<DocumentType, { title: string; description: string; requiredFor: string[] }> = {
  land_ownership_deed: {
    title: 'Registered Land Deed / Ownership Title',
    description: 'Registered Sale Deed, Gift Deed, or Government Allotment Order showing unencumbered possession.',
    requiredFor: ['new_institute'],
  },
  land_use_certificate: {
    title: 'Land Use Certificate / Conversion Order',
    description: 'Statutory certificate from Competent Revenue Authority permitting educational institutional use.',
    requiredFor: ['new_institute'],
  },
  building_plan_approval: {
    title: 'Approved Building Plan Blueprint',
    description: 'Sanctioned master building plan and floor diagrams endorsed by Municipal/Town Planning authority.',
    requiredFor: ['new_institute', 'course_addition'],
  },
  fire_safety_certificate: {
    title: 'Fire Safety NOC / Certificate',
    description: 'Valid compliance certificate from State Fire Services Department.',
    requiredFor: ['new_institute', 'extension_of_approval', 'course_addition'],
  },
  structural_stability_certificate: {
    title: 'Structural Stability Certificate',
    description: 'Certification issued by registered structural engineer confirming earthquake and load compliance.',
    requiredFor: ['new_institute'],
  },
  architect_certificate: {
    title: 'Architect Completion & Area Certificate',
    description: 'Affirmed carpet area, barrier-free access, and disabled-friendly provisions certificate.',
    requiredFor: ['new_institute', 'course_addition'],
  },
  fdr_guarantee: {
    title: 'Fixed Deposit Receipt / Joint Guarantee',
    description: 'Joint FDR pledged with Regional Officer AICTE towards corpus security fund.',
    requiredFor: ['new_institute'],
  },
  aicte_affidavit: {
    title: 'AICTE Mandatory Statutory Affidavit',
    description: 'Notarized affidavit on non-judicial stamp paper strictly following APH prescribed format.',
    requiredFor: ['new_institute', 'extension_of_approval', 'course_addition'],
  },
  society_trust_deed: {
    title: 'Society / Trust Registration Deed',
    description: 'Certificate of registration and memorandum of association of the promoting trust/society.',
    requiredFor: ['new_institute'],
  },
  other_statutory: {
    title: 'Supplementary Statutory Proof',
    description: 'Any additional government order, university affiliation, or regulatory approval order.',
    requiredFor: [],
  },
};
