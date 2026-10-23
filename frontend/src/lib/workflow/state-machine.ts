/**
 * Statutory Workflow State Machine Client Definitions (AIP Module 3).
 * Mirrors backend rules with UI presentation metadata and stepper logic.
 */

import { ApplicationType, WorkflowStatus, WorkflowStatusMetadata } from '@/types/applications';
import { AppRole } from '@/types/auth';

export const WORKFLOW_STATUS_METADATA: Record<WorkflowStatus, WorkflowStatusMetadata> = {
  draft: {
    status: 'draft',
    label: 'Draft Application',
    description: 'Intake draft in progress. Under preparation by institution applicant.',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    stageGroup: 'intake',
  },
  submitted: {
    status: 'submitted',
    label: 'Submitted to AICTE',
    description: 'Officially submitted with reference number. Awaiting officer allocation.',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    stageGroup: 'intake',
  },
  regional_scrutiny: {
    status: 'regional_scrutiny',
    label: 'Regional Scrutiny',
    description: 'Under active scrutiny by Regional Office officers for regulatory compliance.',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    stageGroup: 'scrutiny',
  },
  deficiency_resolution: {
    status: 'deficiency_resolution',
    label: 'Deficiency Resolution',
    description: 'Returned to applicant for deficiency rectification and compliance submission.',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
    stageGroup: 'scrutiny',
  },
  evc_evaluation: {
    status: 'evc_evaluation',
    label: 'EVC Evaluation',
    description: 'Referred to Expert Visiting Committee for physical or virtual campus inspection.',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
    stageGroup: 'evaluation',
  },
  sac_review: {
    status: 'sac_review',
    label: 'SAC Review',
    description: 'Appraisal by Standing Appraisal Committee for final executive review.',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
    stageGroup: 'evaluation',
  },
  shc_hearing: {
    status: 'shc_hearing',
    label: 'SHC Hearing',
    description: 'Scheduled for personal appearance before the Standing Hearing Committee.',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
    stageGroup: 'hearing',
  },
  approved: {
    status: 'approved',
    label: 'Approved / Issued',
    description: 'Statutory Letter of Approval / EoA issued by AICTE Executive Administration.',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    stageGroup: 'final',
  },
  rejected: {
    status: 'rejected',
    label: 'Rejected',
    description: 'Final rejection order issued due to unresolved statutory non-compliances.',
    badgeClass: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    stageGroup: 'final',
  },
  withdrawn: {
    status: 'withdrawn',
    label: 'Withdrawn',
    description: 'Voluntarily withdrawn by the applicant institution.',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    stageGroup: 'final',
  },
};

export const APPLICATION_TYPE_METADATA: Record<
  ApplicationType,
  { title: string; badge: string; description: string; tag: string }
> = {
  new_institute: {
    title: 'Establishment of New Technical Institute',
    badge: 'New Institute (LoA)',
    description: 'For newly registered societies, trusts, or companies establishing a greenfield technical campus.',
    tag: 'LOA-2026',
  },
  extension_of_approval: {
    title: 'Extension of Approval (EoA)',
    badge: 'Extension of Approval',
    description: 'Annual mandatory renewal for existing approved technical institutions across India.',
    tag: 'EOA-2026',
  },
  course_addition: {
    title: 'Introduction of New Course / Program',
    badge: 'Course Addition',
    description: 'Add new undergraduate, postgraduate, or diploma programs to an existing sanctioned campus.',
    tag: 'CRS-2026',
  },
};

/**
 * Standard sequential stages for timeline presentation.
 */
export const STATUTORY_STEPPER_STAGES: Array<{ status: WorkflowStatus; label: string }> = [
  { status: 'draft', label: '1. Draft' },
  { status: 'submitted', label: '2. Submitted' },
  { status: 'regional_scrutiny', label: '3. Regional Scrutiny' },
  { status: 'evc_evaluation', label: '4. EVC Inspection' },
  { status: 'sac_review', label: '5. SAC Appraisal' },
  { status: 'approved', label: '6. Final Decision' },
];

export function canEditApplication(status: WorkflowStatus, role: AppRole): boolean {
  if (role === 'applicant_institution_representative' || role === 'aicte_executive_admin') {
    return status === 'draft' || status === 'deficiency_resolution';
  }
  return false;
}

export function canSubmitApplication(status: WorkflowStatus, role: AppRole): boolean {
  if (role === 'applicant_institution_representative' || role === 'aicte_executive_admin') {
    return status === 'draft';
  }
  return false;
}
