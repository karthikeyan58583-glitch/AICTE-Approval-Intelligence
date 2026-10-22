export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export type ApplicationStage =
  | 'Stage 1: Initial Scrutiny'
  | 'Stage 2: Deficiency Resolution'
  | 'Stage 3: Expert Committee Evaluation'
  | 'Stage 4: Standing Hearing Committee'
  | 'Stage 5: Final EC Approval';

export type ApplicationStatus =
  | 'In Scrutiny'
  | 'Deficiencies Communicated'
  | 'Inspection Scheduled'
  | 'Under Review'
  | 'Approved'
  | 'At Risk';

export interface SummaryMetric {
  id: string;
  title: string;
  value: number;
  formattedValue: string;
  changeLabel: string;
  trend: 'up' | 'down' | 'neutral';
  tone: 'neutral' | 'warning' | 'critical' | 'success';
  description: string;
  iconName: string;
}

export interface StageDistribution {
  stageNumber: number;
  stageName: string;
  shortName: string;
  count: number;
  percentage: number;
  avgDurationDays: number;
  benchmarkDays: number;
  riskStatus: 'normal' | 'moderate' | 'high_bottleneck';
}

export interface ApplicationActivity {
  id: string;
  applicationNumber: string;
  institutionName: string;
  programme: string;
  state: string;
  region: string;
  currentStage: ApplicationStage;
  status: ApplicationStatus;
  submittedDate: string;
  lastUpdated: string;
  daysInCurrentStage: number;
  flaggedDiscrepancies: number;
}

export interface ActionRequiredItem {
  id: string;
  applicationNumber: string;
  institutionName: string;
  title: string;
  reason: string;
  urgency: UrgencyLevel;
  dueDate: string;
  actionType: 'document_mismatch' | 'deadline_escalation' | 'inspection_delay' | 'scrutiny_backlog';
}

export interface InnovationHighlight {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  benefits: string[];
  status: string;
  targetModule: string;
  iconName: string;
}

export interface DashboardDataset {
  lastUpdatedTimestamp: string;
  academicYear: string;
  metrics: SummaryMetric[];
  stages: StageDistribution[];
  recentApplications: ApplicationActivity[];
  actionRequiredItems: ActionRequiredItem[];
  innovations: InnovationHighlight[];
}
