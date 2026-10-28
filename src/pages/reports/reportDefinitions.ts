import type { ReportDefinition } from './types';

export const REPORT_CATEGORIES = [
  'Licensing & Applications',
  'Returns & Compliance',
  'Revenue & Finance',
  'Users & Operations',
  'Complaints',
  'Audit & Governance',
  'Supervision & Enforcement',
] as const;

const RAW_REPORT_DEFINITIONS: ReportDefinition[] = [
  // Licensing & Applications
  // `sector` removed: applications has no sector_id column, this filter was
  // always a silent no-op (see the "Reports & Analytics" gap-fix migration).
  { id: 'app-status', name: 'Application Status Report', category: 'Licensing & Applications', module: 'application_management', description: 'Distribution of applications across all statuses.', source: 'applications', filters: ['dateFrom', 'dateTo', 'status'], defaultColumns: ['application_number', 'license_type', 'status', 'created_at', 'submitted_at'], defaultGroupBy: 'status', exportFormats: ['csv', 'xlsx', 'json'] },
  { id: 'app-aging', name: 'Application Aging Report', category: 'Licensing & Applications', module: 'application_management', description: 'Applications grouped by time-in-status buckets.', source: 'applications', filters: ['dateFrom', 'dateTo', 'status'], defaultColumns: ['application_number', 'status', 'created_at', 'updated_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'app-sla', name: 'Application SLA Breach Report', category: 'Licensing & Applications', module: 'application_management', description: 'Applications exceeding their SLA windows.', source: 'applications', filters: ['dateFrom', 'dateTo'], defaultColumns: ['application_number', 'status', 'created_at', 'submitted_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'lic-issuance', name: 'License Issuance Report', category: 'Licensing & Applications', module: 'license_management', description: 'Licenses issued within a chosen window.', source: 'licenses', filters: ['dateFrom', 'dateTo', 'sector'], defaultColumns: ['license_number', 'license_type', 'status', 'issued_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'lic-expiry', name: 'License Expiry / Renewal Due Report', category: 'Licensing & Applications', module: 'license_management', description: 'Licenses approaching expiry / renewal.', source: 'licenses', filters: ['dateFrom', 'dateTo'], defaultColumns: ['license_number', 'license_type', 'valid_until', 'status'], exportFormats: ['csv', 'xlsx'] },
  { id: 'lic-suspended', name: 'Suspended / Revoked License Report', category: 'Licensing & Applications', module: 'license_management', description: 'Licenses in suspended or revoked status.', source: 'licenses', filters: ['status'], defaultColumns: ['license_number', 'license_type', 'status', 'updated_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'lic-distribution', name: 'Sector-wise License Distribution', category: 'Licensing & Applications', module: 'license_management', description: 'Active licenses broken down by sector.', source: 'licenses', filters: [], defaultColumns: ['license_type', 'status'], defaultGroupBy: 'license_type', exportFormats: ['csv', 'xlsx'] },

  // Returns & Compliance
  { id: 'ret-status', name: 'Return Submission Status Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Returns by submission status across periods.', source: 'return_filings', filters: ['dateFrom', 'dateTo', 'status'], defaultColumns: ['filing_reference','entity_name','definition_code','period_label','status_label','submitted_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-overdue', name: 'Overdue Returns Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Returns past their due date and unsubmitted.', source: 'return_filings', filters: ['dateFrom', 'dateTo'], defaultColumns: ['filing_reference','entity_name','definition_code','period_end','due_date','status_label','days_late'], exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-defaulters', name: 'Defaulters Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Licensees with repeated unsubmitted returns.', source: 'return_filings', filters: ['dateFrom', 'dateTo'], defaultColumns: ['entity_name','definition_code','period_end','due_date','status_label','days_late'], defaultGroupBy: 'entity_name', exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-scorecard', name: 'Compliance Scorecard', category: 'Returns & Compliance', module: 'returns_management', description: 'On-time vs. late vs. missed return ratios.', source: 'return_filings', filters: ['dateFrom', 'dateTo'], defaultColumns: ['entity_name','definition_code','due_date','submitted_at','status_label','sla_state'], exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-latefee', name: 'Late Fee Exposure Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Estimated late-fee exposure by licensee.', source: 'return_filings', filters: ['dateFrom', 'dateTo'], defaultColumns: ['entity_name','definition_code','due_date','status_label','days_late'], exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-risk', name: 'Sector-wise Compliance Risk Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Compliance risk aggregated by sector.', source: 'return_filings', filters: ['dateFrom', 'dateTo'], defaultColumns: ['entity_name','definition_code','status_label','sla_state'], exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-repeat', name: 'Repeated Non-compliance Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Licensees with recurring non-compliance.', source: 'return_filings', filters: ['dateFrom', 'dateTo'], defaultColumns: ['entity_name','definition_code','status_label','days_late'], defaultGroupBy: 'entity_name', exportFormats: ['csv', 'xlsx'] },
  { id: 'ret-sla', name: 'Return Submission SLA Report', category: 'Returns & Compliance', module: 'returns_management', description: 'Returns measured against their due-date SLA window.', source: 'return_filings', filters: ['dateFrom', 'dateTo'], defaultColumns: ['filing_reference','entity_name','due_date','submitted_at','status_label','sla_state','days_late'], exportFormats: ['csv', 'xlsx', 'json'] },
  { id: 'prud-breach', name: 'Prudential Return Threshold Breaches', category: 'Returns & Compliance', module: 'prudential_supervision', description: 'Prudential return metrics that have breached configured thresholds.', source: 'return_threshold_breaches', filters: ['dateFrom', 'dateTo', 'riskLevel'], defaultColumns: ['metric_key', 'value', 'threshold_value', 'level', 'risk_level', 'detected_at'], defaultGroupBy: 'risk_level', exportFormats: ['csv', 'xlsx', 'json'] },

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
  { id: 'cmp-sla', name: 'Complaint SLA Compliance Report', category: 'Complaints', module: 'complaint_management', description: 'Complaints measured against their SLA window.', source: 'complaints', filters: ['dateFrom', 'dateTo'], defaultColumns: ['complaint_number', 'status', 'sla_days', 'created_at', 'sla_due_at'], exportFormats: ['csv', 'xlsx', 'json'] },

  // Audit & Governance
  { id: 'aud-trail', name: 'Audit Trail Report', category: 'Audit & Governance', module: 'settings', description: 'Full audit trail of system changes.', source: 'audit_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['user_id', 'action', 'entity_type', 'entity_id', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'aud-permissions', name: 'Permission Change Report', category: 'Audit & Governance', module: 'role_management', description: 'Role / permission change history.', source: 'audit_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['user_id', 'action', 'entity_id', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  // source/defaultColumns fixed to match the live report_logs-backed DB seed
  // (this fallback is only used if the DB metadata table is ever empty).
  { id: 'aud-export', name: 'Data Export Log', category: 'Audit & Governance', module: 'settings', description: 'Log of all report exports.', source: 'report_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['executed_by', 'action', 'export_format', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'aud-failed-login', name: 'Failed Login / Security Event Report', category: 'Audit & Governance', module: 'settings', description: 'Failed logins and security events.', source: 'audit_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['user_id', 'action', 'created_at'], exportFormats: ['csv', 'xlsx'] },
  { id: 'aud-admin', name: 'Admin Activity Report', category: 'Audit & Governance', module: 'settings', description: 'Activity performed by administrators.', source: 'audit_logs', filters: ['dateFrom', 'dateTo'], defaultColumns: ['user_id', 'action', 'entity_type', 'created_at'], exportFormats: ['csv', 'xlsx'] },

  // Supervision & Enforcement
  { id: 'sup-approved-persons', name: 'Approved Persons & Key Functionaries Register', category: 'Supervision & Enforcement', module: 'fit_proper', description: 'Directors, officers and key functionaries with regulatory approval status and tenure.', source: 'entity_appointments', filters: ['dateFrom', 'dateTo', 'status'], defaultColumns: ['entity_name', 'person_name', 'role_name', 'is_executive', 'status', 'regulatory_approval_status', 'effective_from', 'effective_to'], defaultGroupBy: 'regulatory_approval_status', exportFormats: ['csv', 'xlsx', 'json'] },
  { id: 'sup-exam-programme', name: 'Examination Programme & Fieldwork Schedule', category: 'Supervision & Enforcement', module: 'inspection_management', description: 'Examinations by type, stage, risk rating and fieldwork dates.', source: 'examinations', filters: ['dateFrom', 'dateTo', 'stage', 'riskLevel'], defaultColumns: ['reference', 'entity_name', 'title', 'examination_type', 'stage', 'risk_rating', 'fieldwork_start', 'fieldwork_end', 'closed_at'], defaultGroupBy: 'stage', exportFormats: ['csv', 'xlsx', 'json'] },
  { id: 'sup-exam-findings', name: 'Examination Findings & Remediation Tracker', category: 'Supervision & Enforcement', module: 'inspection_management', description: 'Findings by severity with target dates, overdue remediation and closure.', source: 'examination_findings', filters: ['dateFrom', 'dateTo', 'status', 'severity'], defaultColumns: ['reference', 'title', 'category', 'severity', 'status', 'target_date', 'closed_at'], defaultGroupBy: 'severity', exportFormats: ['csv', 'xlsx', 'json'] },
  { id: 'sup-enf-sanctions', name: 'Enforcement Sanctions & Penalty Recovery Ledger', category: 'Supervision & Enforcement', module: 'enforcement_management', description: 'Enforcement cases, sanctions and penalties assessed, paid, waived and outstanding.', source: 'enforcement_actions', filters: ['dateFrom', 'dateTo', 'status', 'stage'], defaultColumns: ['case_number', 'entity_name', 'enforcement_type', 'stage', 'status', 'sanction_type', 'date_opened', 'penalty_amount', 'penalty_paid_amount', 'penalty_waived_amount', 'penalty_currency', 'appeal_deadline'], defaultGroupBy: 'stage', exportFormats: ['csv', 'xlsx', 'json'] },
  { id: 'sup-prudential-soundness', name: 'Prudential Soundness Assessment Report', category: 'Supervision & Enforcement', module: 'prudential_supervision', description: 'Supervisory soundness ratings per institution and period, with assessment status and recommended response.', source: 'prudential_assessments', filters: ['dateFrom', 'dateTo', 'status', 'riskLevel'], defaultColumns: ['entity_name', 'period_start', 'period_end', 'overall_rating', 'status', 'recommended_response', 'approved_at'], defaultGroupBy: 'overall_rating', exportFormats: ['csv', 'xlsx', 'json'] },
  { id: 'sup-ownership-register', name: 'Ownership, Control & Beneficial Owners Register', category: 'Supervision & Enforcement', module: 'entity_management', description: 'Shareholders, controllers and ultimate beneficial owners with holdings and approval status.', source: 'ownership_interests', filters: ['dateFrom', 'dateTo', 'status'], defaultColumns: ['owned_entity_name', 'owner_name', 'ownership_type', 'economic_interest_percentage', 'voting_rights_percentage', 'is_direct', 'is_controller', 'is_ubo', 'approval_status', 'effective_from', 'effective_to'], exportFormats: ['csv', 'xlsx', 'json'] },
  { id: 'stat-annual-bulletin', name: 'Statutory Annual Sector Bulletin', category: 'Supervision & Enforcement', module: 'report_management', description: 'Headline statistics for the period: regulated population, authorisations, returns, supervision, enforcement, complaints and fees.', source: 'statutory_bulletin', filters: ['dateFrom', 'dateTo'], defaultColumns: ['section', 'metric', 'value', 'basis'], defaultGroupBy: 'section', exportFormats: ['csv', 'xlsx', 'json'] },
];

// Every predefined report now supports a real PDF export (see exportService.ts's
// exportToPdf) alongside whatever formats it already listed — applied here
// once rather than edited into all 37 entries above.
export const REPORT_DEFINITIONS: ReportDefinition[] = RAW_REPORT_DEFINITIONS.map((d) => ({
  ...d,
  exportFormats: d.exportFormats.includes('pdf') ? d.exportFormats : [...d.exportFormats, 'pdf'],
}));

export const COLUMN_OPTIONS_BY_SOURCE: Record<string, string[]> = {
  applications: ['application_number', 'license_type', 'status', 'created_at', 'submitted_at', 'approved_at', 'rejected_at', 'updated_at', 'regulator_id'],
  licenses: ['license_number', 'license_type', 'status', 'issued_at', 'valid_from', 'valid_until', 'sector_id', 'sub_sector_id', 'created_at', 'updated_at'],
  payments: ['amount', 'status', 'currency', 'payment_method', 'transaction_ref', 'receipt_number', 'paid_at', 'created_at'],
  // HISTORICAL ONLY — retained so pre-canonical saved runs still render.
  compliance_returns: ['license_id', 'period_start', 'period_end', 'due_date', 'status', 'submitted_at', 'reviewed_at'],
  // EPR-01 canonical Returns reporting source (v_return_filing_workflow_state).
  return_filings: ['filing_reference', 'entity_name', 'definition_code', 'definition_name', 'frequency', 'period_label', 'period_start', 'period_end', 'due_date', 'status', 'status_label', 'stage', 'stage_label', 'current_version_number', 'submitted_at', 'accepted_at', 'sla_state', 'days_late', 'is_overdue', 'owner_name', 'priority', 'waiting_on'],
  complaints: ['complaint_number', 'subject', 'status', 'complaint_type_id', 'created_at', 'updated_at', 'sla_days', 'sla_due_at'],
  users: ['email', 'full_name', 'created_at'],
  audit_logs: ['user_id', 'action', 'entity_type', 'entity_id', 'created_at'],
  return_threshold_breaches: ['metric_key', 'value', 'threshold_value', 'comparator', 'level', 'risk_level', 'detected_at', 'acknowledged_at', 'escalated_at', 'notified'],
  prudential_assessments: ['entity_name', 'period_start', 'period_end', 'overall_rating', 'status', 'conclusion', 'recommended_response', 'submitted_at', 'approved_at', 'created_at'],
  ownership_interests: ['owned_entity_name', 'owner_name', 'ownership_type', 'shares_held', 'total_shares', 'economic_interest_percentage', 'voting_rights_percentage', 'beneficial_interest_percentage', 'is_direct', 'is_controller', 'is_ubo', 'approval_status', 'effective_from', 'effective_to', 'created_at'],
  statutory_bulletin: ['section', 'metric', 'value', 'basis'],
  entity_appointments: ['entity_name', 'person_name', 'role_name', 'entity_id', 'person_party_id', 'role_type_id', 'appointment_date', 'effective_from', 'effective_to', 'is_executive', 'status', 'regulatory_approval_status', 'created_at'],
  examinations: ['reference', 'entity_name', 'title', 'entity_id', 'examination_type', 'stage', 'risk_rating', 'period_under_review_start', 'period_under_review_end', 'fieldwork_start', 'fieldwork_end', 'closed_at', 'created_at'],
  examination_findings: ['reference', 'title', 'category', 'severity', 'status', 'criteria_breached', 'root_cause', 'recommendation', 'target_date', 'closed_at', 'created_at'],
  enforcement_actions: ['case_number', 'entity_name', 'entity_id', 'enforcement_type', 'stage', 'status', 'severity', 'sanction_type', 'legal_basis', 'date_opened', 'decision_at', 'penalty_amount', 'penalty_paid_amount', 'penalty_waived_amount', 'penalty_currency', 'appeal_deadline', 'closed_at'],
};

/** Columns that should never appear in default exports. */
export const SENSITIVE_COLUMNS = new Set([
  'password', 'password_hash', 'token', 'access_token', 'refresh_token',
  'secret', 'api_key', 'private_key', 'otp', 'otp_code', 'mfa_secret',
  'encrypted_password', 'raw_user_meta_data', 'raw_app_meta_data',
  'confirmation_token', 'recovery_token', 'session_id',
]);
