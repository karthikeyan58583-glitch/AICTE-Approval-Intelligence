/**
 * Statutory Application Intake & Workflow State Machine Types (AIP Module 3).
 * Governs New Institute, Extension of Approval (EoA), and Course Addition lifecycles.
 */

export type ApplicationType =
  | 'new_institute'
  | 'extension_of_approval'
  | 'course_addition';

export type WorkflowStatus =
  | 'draft'
  | 'submitted'
  | 'regional_scrutiny'
  | 'deficiency_resolution'
  | 'evc_evaluation'
  | 'sac_review'
  | 'shc_hearing'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

export type InstitutionType =
  | 'engineering_technology'
  | 'management'
  | 'pharmacy'
  | 'architecture_planning'
  | 'applied_arts_crafts'
  | 'hotel_management_catering';

export interface ProgramCourseItem {
  course_name: string;
  level: string;
  intake_capacity: number;
  duration_years: number;
  faculty_count: number;
}

export interface InfrastructureDetails {
  land_area_acres: number;
  built_up_area_sqm: number;
  instructional_area_sqm: number;
  administrative_area_sqm: number;
  amenities_area_sqm: number;
  title_deed_number?: string;
}

export interface EoADetails {
  permanent_id: string;
  nba_accredited: boolean;
  naac_score?: number;
  faculty_cadre_ratio: string;
  compliance_declaration: boolean;
}

export interface CourseAdditionDetails {
  permanent_id: string;
  new_course_name: string;
  level: string;
  proposed_intake: number;
  labs_ready: boolean;
  faculty_recruited: number;
}

export interface ApplicationFormData {
  academic_year: string;
  institution_name: string;
  institution_type: InstitutionType;
  state: string;
  district: string;
  address: string;
  pincode: string;
  head_of_institution: string;
  contact_email: string;
  contact_phone: string;

  // Canonical Institution PID
  permanent_id?: string;

  // Type specific details
  programs_courses?: ProgramCourseItem[];
  infrastructure?: InfrastructureDetails;
  eoa_details?: EoADetails;
  course_addition_details?: CourseAdditionDetails;
  declaration_confirmed?: boolean;
}

export interface ApplicationRecord {
  id: string;
  application_number: string | null;
  institution_id: string;
  institution_name?: string | null;
  application_type: ApplicationType;
  academic_year: string;
  current_status: WorkflowStatus;
  form_data: Partial<ApplicationFormData>;
  created_by: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  allowed_transitions?: WorkflowStatus[];
}

export interface WorkflowHistoryRecord {
  id: string;
  application_id: string;
  previous_status: WorkflowStatus | null;
  new_status: WorkflowStatus;
  action: string;
  transition_notes: string | null;
  actor_id: string;
  actor_role?: string | null;
  actor_name?: string | null;
  created_at: string;
}

export interface WorkflowStatusMetadata {
  status: WorkflowStatus;
  label: string;
  description: string;
  badgeClass: string;
  stageGroup: 'intake' | 'scrutiny' | 'evaluation' | 'hearing' | 'final';
}
