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

// Application statuses - extended lifecycle
export type ApplicationStatus = 
  | 'draft' 
  | 'submitted' 
  | 'scrutiny'
  | 'query_raised'
  | 'resubmitted'
  | 'technical_review'
  | 'pending_approval' 
  | 'approved' 
  | 'rejected' 
  | 'license_issued';

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  scrutiny: 'Under Scrutiny',
  query_raised: 'Query Raised',
  resubmitted: 'Resubmitted',
  technical_review: 'Technical Review',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  license_issued: 'License Issued',
};

export const APPLICATION_STATUS_FLOW: ApplicationStatus[] = [
  'draft', 'submitted', 'scrutiny', 'query_raised', 'resubmitted',
  'technical_review', 'pending_approval', 'approved', 'license_issued',
];

// License statuses
export type LicenseStatus = 'active' | 'suspended' | 'revoked' | 'expired' | 'cancelled';

export const LICENSE_STATUS_LABELS: Record<LicenseStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  revoked: 'Revoked',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

// Compliance return statuses
export type ReturnStatus = 'pending' | 'draft' | 'submitted' | 'accepted' | 'rejected' | 'overdue';

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  pending: 'Pending',
  draft: 'Draft',
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  overdue: 'Overdue',
};

// Fee types
export type FeeType = 'application' | 'processing' | 'license' | 'renewal' | 'service';

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  application: 'Application Fee',
  processing: 'Processing Fee',
  license: 'License Fee',
  renewal: 'Renewal Fee',
  service: 'Service Fee',
};

// Complaint statuses
export type ComplaintStatus = 'submitted' | 'under_investigation' | 'resolved' | 'closed';

// Workflow step types
export type StepType = 'sequential' | 'parallel' | 'conditional';

// Approval action types
export type ApprovalAction = 'approve' | 'reject' | 'request_info' | 'delegate';
