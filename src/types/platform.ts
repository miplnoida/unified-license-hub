// Platform-wide role and type definitions

export type AppRole = 
  | 'super_admin' 
  | 'admin' 
  | 'supervisor' 
  | 'licensing_officer' 
  | 'analyst' 
  | 'applicant' 
  | 'developer';

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  supervisor: 'Supervisor',
  licensing_officer: 'Licensing Officer',
  analyst: 'Analyst',
  applicant: 'Applicant',
  developer: 'Developer',
};

export const ROLE_HIERARCHY: AppRole[] = [
  'super_admin',
  'admin',
  'supervisor',
  'licensing_officer',
  'analyst',
  'developer',
  'applicant',
];

export const INTERNAL_ROLES: AppRole[] = [
  'super_admin',
  'admin',
  'supervisor',
  'licensing_officer',
  'analyst',
  'developer',
];

export interface PlatformUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  entityName?: string;
  status: string;
}

// Application statuses
export type ApplicationStatus = 
  | 'draft' 
  | 'submitted' 
  | 'under_review' 
  | 'pending_approval' 
  | 'approved' 
  | 'rejected' 
  | 'returned';

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  returned: 'Returned for Revision',
};

// Complaint statuses
export type ComplaintStatus = 'submitted' | 'under_investigation' | 'resolved' | 'closed';

// Workflow step types
export type StepType = 'sequential' | 'parallel' | 'conditional';

// Approval action types
export type ApprovalAction = 'approve' | 'reject' | 'request_info' | 'delegate';
