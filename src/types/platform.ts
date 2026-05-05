// Platform-wide role and type definitions

export type AppRole = 
  | 'super_admin' 
  | 'admin' 
  | 'supervisor' 
  | 'licensing_officer' 
  | 'analyst' 
  | 'applicant' 
  | 'developer'
  | 'pre_licensee'
  | 'licensee_primary'
  | 'licensee_secondary';

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  supervisor: 'Supervisor',
  licensing_officer: 'Licensing Officer',
  analyst: 'Analyst',
  applicant: 'Applicant',
  developer: 'Developer',
  pre_licensee: 'Pre-Licensee Applicant',
  licensee_primary: 'Primary User',
  licensee_secondary: 'Secondary User',
};

export const ROLE_HIERARCHY: AppRole[] = [
  'super_admin',
  'admin',
  'supervisor',
  'licensing_officer',
  'analyst',
  'developer',
  'licensee_primary',
  'licensee_secondary',
  'pre_licensee',
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

export const LICENSEE_ROLES: AppRole[] = [
  'licensee_primary',
  'licensee_secondary',
];

export const PRE_LICENSEE_ROLES: AppRole[] = ['pre_licensee'];

export interface PlatformUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  entityName?: string;
  status: string;
  licenseeId?: string;
  isPreLicensee: boolean;
  forcePasswordChange?: boolean;
  /** Display name of the assigned dynamic role (from roles.name), if any. */
  dynamicRoleName?: string;
  /** Original role from user_roles, before delegation override. */
  baseRole?: AppRole;
  /** When this user is currently acting under a delegation, the delegated role. */
  delegatedRole?: AppRole;
  /** Display name of the user who delegated their role. */
  delegatedFromName?: string;
  /** ISO timestamp when the active delegation expires (end-of-day inclusive). */
  delegationUntil?: string;
  /** ISO timestamp when the active delegation became effective. */
  delegationFrom?: string;
  avatarUrl?: string;
  phone?: string;
  department?: string;
  bio?: string;
  twoFactorEnabled?: boolean;
}

// Application statuses - simplified lifecycle
export type ApplicationStatus = 
  | 'draft' 
  | 'submitted' 
  | 'in_progress'
  | 'approved' 
  | 'rejected'
  | 'cancelled'
  | 'resubmission_requested'
  | 'query_raised';

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_progress: 'In Progress',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  resubmission_requested: 'To Be Resubmitted',
  query_raised: 'To Be Resubmitted',
};

export const APPLICATION_STATUS_FLOW: ApplicationStatus[] = [
  'draft', 'submitted', 'in_progress', 'approved',
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
export type ReturnStatus = 'pending' | 'draft' | 'submitted' | 'accepted' | 'rejected' | 'overdue' | 'resubmission_requested';

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  pending: 'Pending',
  draft: 'Draft',
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  overdue: 'Overdue',
  resubmission_requested: 'To Be Resubmitted',
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
