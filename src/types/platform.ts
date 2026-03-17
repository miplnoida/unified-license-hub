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
export type FeeType = 'application' | 'processing' | 'license' | 'renewal' | 'service' | 'penalty';

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  application: 'Application Fee',
  processing: 'Processing Fee',
  license: 'License Fee',
  renewal: 'Renewal Fee',
  service: 'Service Fee',
  penalty: 'Penalty',
};

// Fee calculation types
export type CalculationType = 'fixed' | 'percentage' | 'formula';

export const CALCULATION_TYPE_LABELS: Record<CalculationType, string> = {
  fixed: 'Fixed Amount',
  percentage: 'Percentage',
  formula: 'Formula-based',
};

// Fee rule types
export type FeeRuleType = 'calculation' | 'exemption' | 'discount';

export const FEE_RULE_TYPE_LABELS: Record<FeeRuleType, string> = {
  calculation: 'Calculation Rule',
  exemption: 'Exemption Rule',
  discount: 'Discount Rule',
};

// Refund statuses
export type RefundStatus = 'pending' | 'approved' | 'processed' | 'rejected';

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  processed: 'Processed',
  rejected: 'Rejected',
};

// Payment methods
export const PAYMENT_METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'net_banking', label: 'Net Banking' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
] as const;

// Complaint statuses
export type ComplaintStatus = 'submitted' | 'under_investigation' | 'resolved' | 'closed';

// Workflow step types
export type StepType = 'sequential' | 'parallel' | 'conditional';

// Approval action types
export type ApprovalAction = 'approve' | 'reject' | 'request_info' | 'delegate';
