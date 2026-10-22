/**
 * Standardized AICTE Regulatory Roles for Module 2 RBAC.
 */
export type AppRole =
  | 'applicant_institution_representative'
  | 'regional_scrutiny_officer'
  | 'evc_evaluator'
  | 'shc_member'
  | 'aicte_executive_admin';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  institutionName?: string | null;
  regionalOffice?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  supabaseConfigured: boolean;
}

export interface RoleMetadata {
  title: string;
  badgeLabel: string;
  colorClass: string;
  description: string;
  defaultRedirectPath: string;
}
