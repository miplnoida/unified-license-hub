import type { ReportDefinition } from './types';

export const REPORT_CATEGORIES = [
  'Licensing & Applications',
  'Returns & Compliance',
  'Revenue & Finance',
  'Users & Operations',
  'Complaints',
  'Audit & Governance',
] as const;

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  // Licensing & Applications
  { id: 'app-status', name: 'Application Status Report', category: 'Licensing & Applications', module: 'application_management', description: 'Distribution of applications across all statuses.', source: 'applications', filters: ['dateFrom', 'dateTo', 'status', 'sector'], defaultColumns: ['application_number', 'license_type', 'status', 'created_at', 'submitted_at'], defaultGroupBy: 'status', exportFormats: ['csv', 'xlsx', 'json'] },
  { id: 'app-aging', name: 'Application Aging Report', category: 'Licensing & Applications', module: 'application_management', description: 'Applications grouped by time-in-status buckets.', source: 'applications', filters: ['dateFrom', 'dateTo', 'status'], defaultColumns: ['application_number', 'status', 'created_at', 'updated_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'app-sla', name: 'Application SLA Breach Report', category: 'Licensing & Applications', module: 'application_management', description: 'Applications exceeding their SLA windows.', source: 'applications', filters: ['dateFrom', 'dateTo'], defaultColumns: ['application_number', 'status', 'created_at', 'submitted_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'lic-issuance', name: 'License Issuance Report', category: 'Licensing & Applications', module: 'license_management', description: 'Licenses issued within a chosen window.', source: 'licenses', filters: ['dateFrom', 'dateTo', 'sector'], defaultColumns: ['license_number', 'license_type', 'status', 'issued_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'lic-expiry', name: 'License Expiry / Renewal Due Report', category: 'Licensing & Applications', module: 'license_management', description: 'Licenses approaching expiry / renewal.', source: 'licenses', filters: ['dateFrom', 'dateTo'], defaultColumns: ['license_number', 'license_type', 'valid_until', 'status'], exportFormats: ['csv', 'xlsx'] },
  { id: 'lic-suspended', name: 'Suspended / Revoked License Report', category: 'Licensing & Applications', module: 'license_management', description: 'Licenses in suspended or revoked status.', source: 'licenses', filters: ['status'], defaultColumns: ['license_number', 'license_type', 'status', 'updated_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'lic-distribution', name: 'Sector-wise License Distribution', category: 'Licensing & Applications', module: 'license_management', description: 'Active licenses broken down by sector.', source: 'licenses', filters: [], defaultColumns: ['license_type', 'status'], defaultGroupBy: 'license_type', exportFormats: ['csv', 'xlsx'] },

  // Returns & Compliance
  { id: 'ret-status', name: 'Return Submission Status Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Returns by submission status across periods.', source: 'compliance_returns', filters: ['dateFrom', 'dateTo', 'status'], defaultColumns: ['license_id', 'period_start', 'period_end', 'status', 'submitted_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-overdue', name: 'Overdue Returns Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Returns past their due date and unsubmitted.', source: 'compliance_returns', filters: ['dateFrom', 'dateTo'], defaultColumns: ['license_id', 'period_end', 'due_date', 'status'], exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-defaulters', name: 'Defaulters Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Licensees with repeated unsubmitted returns.', source: 'compliance_returns', filters: ['dateFrom', 'dateTo'], defaultColumns: ['license_id', 'period_end', 'status'], defaultGroupBy: 'license_id', exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-scorecard', name: 'Compliance Scorecard', category: 'Returns & Compliance', module: 'returns_management', description: 'On-time vs. late vs. missed return ratios.', source: 'compliance_returns', filters: ['dateFrom', 'dateTo'], defaultColumns: ['license_id', 'status', 'due_date', 'submitted_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-latefee', name: 'Late Fee Exposure Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Estimated late-fee exposure by licensee.', source: 'compliance_returns', filters: ['dateFrom', 'dateTo'], defaultColumns: ['license_id', 'due_date', 'status'], exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-risk', name: 'Sector-wise Compliance Risk Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Compliance risk aggregated by sector.', source: 'compliance_returns', filters: ['dateFrom', 'dateTo'], defaultColumns: ['license_id', 'status'], exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-repeat', name: 'Repeated Non-compliance Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Licensees with recurring non-compliance.', source: 'compliance_returns', filters: ['dateFrom', 'dateTo'], defaultColumns: ['license_id', 'status'], defaultGroupBy: 'license_id', exportFormats: ['csv', 'xlsx'] },

  // Revenue & Finance
  { id: 'fee-collection', name: 'Fee Collection Report', category: 'Revenue & Finance', module: 'fee_management', description: 'Collected fees over time.', source: 'payments', filters: ['dateFrom', 'dateTo', 'paymentStatus'], defaultColumns: ['amount', 'status', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'fee-outstanding', name: 'Outstanding Dues Report', category: 'Revenue & Finance', module: 'fee_management', description: 'Unpaid and pending dues.', source: 'payments', filters: ['dateFrom', 'dateTo'], defaultColumns: ['amount', 'status', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'fee-failed', name: 'Payment Failure Report', category: 'Revenue & Finance', module: 'fee_management', description: 'Failed payment attempts.', source: 'payments', filters: ['dateFrom', 'dateTo'], defaultColumns: ['amount', 'status', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'fee-refund', name: 'Refund / Adjustment Report', category: 'Revenue & Finance', module: 'fee_management', description: 'Refund and adjustment activity.', source: 'payments', filters: ['dateFrom', 'dateTo'], defaultColumns: ['amount', 'status', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'fee-sector', name: 'Revenue by Sector / Service / Regulator', category: 'Revenue & Finance', module: 'fee_management', description: 'Revenue grouped by sector/service/regulator.', source: 'payments', filters: ['dateFrom', 'dateTo'], defaultColumns: ['amount', 'status'], exportFormats: ['csv', 'xlsx'] },
  { id: 'fee-trend', name: 'Monthly and Quarterly Collection Trend', category: 'Revenue & Finance', module: 'fee_management', description: 'Collections trended monthly / quarterly.', source: 'payments', filters: ['dateFrom', 'dateTo'], defaultColumns: ['amount', 'created_at'], exportFormats: ['csv', 'xlsx'] },

  // Users & Operations
  { id: 'op-workload', name: 'Officer Workload Report', category: 'Users & Operations', module: 'workflow_management', description: 'Open tasks per officer.', source: 'applications', filters: ['dateFrom', 'dateTo'], defaultColumns: ['application_number', 'status', 'current_step_id'], exportFormats: ['csv', 'xlsx'] },
  { id: 'op-productivity', name: 'Officer Productivity Report', category: 'Users & Operations', module: 'workflow_management', description: 'Throughput per officer.', source: 'applications', filters: ['dateFrom', 'dateTo'], defaultColumns: ['application_number', 'status', 'approved_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'op-process-time', name: 'Average Processing Time Report', category: 'Users & Operations', module: 'workflow_management', description: 'Average processing time per stage.', source: 'applications', filters: ['dateFrom', 'dateTo'], defaultColumns: ['application_number', 'created_at', 'approved_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'op-ratio', name: 'Approval / Rejection Ratio Report', category: 'Users & Operations', module: 'workflow_management', description: 'Approval vs. rejection ratios.', source: 'applications', filters: ['dateFrom', 'dateTo'], defaultColumns: ['status'], defaultGroupBy: 'status', exportFormats: ['csv', 'xlsx'] },
  { id: 'op-pending', name: 'Pending Task Aging Report', category: 'Users & Operations', module: 'workflow_management', description: 'Pending tasks bucketed by age.', source: 'applications', filters: [], defaultColumns: ['application_number', 'status', 'updated_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'op-login', name: 'Login / Activity Report', category: 'Users & Operations', module: 'user_management', description: 'User login and activity trail.', source: 'audit_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['user_id', 'action', 'created_at'], exportFormats: ['csv', 'xlsx'] },

  // Complaints
  { id: 'cmp-volume', name: 'Complaint Volume Report', category: 'Complaints', module: 'complaint_management', description: 'Complaint volume over time.', source: 'complaints', filters: ['dateFrom', 'dateTo'], defaultColumns: ['complaint_number', 'status', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'cmp-resolution', name: 'Complaint Resolution Time Report', category: 'Complaints', module: 'complaint_management', description: 'Time-to-resolution per complaint.', source: 'complaints', filters: ['dateFrom', 'dateTo'], defaultColumns: ['complaint_number', 'status', 'created_at', 'updated_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'cmp-pending', name: 'Pending Complaints Report', category: 'Complaints', module: 'complaint_management', description: 'Open and unresolved complaints.', source: 'complaints', filters: ['status'], defaultColumns: ['complaint_number', 'status', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'cmp-category', name: 'Complaint Category Trend Report', category: 'Complaints', module: 'complaint_management', description: 'Trending complaint categories.', source: 'complaints', filters: ['dateFrom', 'dateTo'], defaultColumns: ['complaint_number', 'complaint_type_id'], defaultGroupBy: 'complaint_type_id', exportFormats: ['csv', 'xlsx'] },
  { id: 'cmp-escalated', name: 'Escalated Complaints Report', category: 'Complaints', module: 'complaint_management', description: 'Complaints currently escalated.', source: 'complaints', filters: ['dateFrom', 'dateTo'], defaultColumns: ['complaint_number', 'status'], exportFormats: ['csv', 'xlsx'] },

  // Audit & Governance
  { id: 'aud-trail', name: 'Audit Trail Report', category: 'Audit & Governance', module: 'settings', description: 'Full audit trail of system changes.', source: 'audit_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['user_id', 'action', 'entity_type', 'entity_id', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'aud-permissions', name: 'Permission Change Report', category: 'Audit & Governance', module: 'role_management', description: 'Role / permission change history.', source: 'audit_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['user_id', 'action', 'entity_id', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'aud-export', name: 'Data Export Log', category: 'Audit & Governance', module: 'settings', description: 'Log of all report exports.', source: 'audit_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['user_id', 'action', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'aud-failed-login', name: 'Failed Login / Security Event Report', category: 'Audit & Governance', module: 'settings', description: 'Failed logins and security events.', source: 'audit_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['user_id', 'action', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'aud-admin', name: 'Admin Activity Report', category: 'Audit & Governance', module: 'settings', description: 'Activity performed by administrators.', source: 'audit_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['user_id', 'action', 'entity_type', 'created_at'], exportFormats: ['csv', 'xlsx'] },
];

export const COLUMN_OPTIONS_BY_SOURCE: Record<string, string[]> = {
  applications: ['application_number', 'license_type', 'status', 'created_at', 'submitted_at', 'approved_at', 'rejected_at', 'updated_at', 'regulator_id'],
  licenses: ['license_number', 'license_type', 'status', 'issued_at', 'valid_from', 'valid_until', 'sector_id', 'sub_sector_id', 'created_at', 'updated_at'],
  payments: ['amount', 'status', 'currency', 'payment_method', 'transaction_ref', 'receipt_number', 'paid_at', 'created_at'],
  compliance_returns: ['license_id', 'period_start', 'period_end', 'due_date', 'status', 'submitted_at', 'reviewed_at'],
  complaints: ['complaint_number', 'subject', 'status', 'complaint_type_id', 'created_at', 'updated_at'],
  users: ['email', 'full_name', 'created_at'],
  audit_logs: ['user_id', 'action', 'entity_type', 'entity_id', 'created_at'],
};

/** Columns that should never appear in default exports. */
export const SENSITIVE_COLUMNS = new Set([
  'password', 'password_hash', 'token', 'access_token', 'refresh_token',
  'secret', 'api_key', 'private_key', 'otp', 'otp_code', 'mfa_secret',
  'encrypted_password', 'raw_user_meta_data', 'raw_app_meta_data',
  'confirmation_token', 'recovery_token', 'session_id',
]);
