export type ReportSource =
  | 'applications'
  | 'licenses'
  | 'payments'
  | 'compliance_returns' // HISTORICAL ONLY (pre-canonical store)
  | 'return_filings'   // EPR-01 canonical Regulatory Returns read model
  | 'complaints'
  | 'users'
  | 'audit_logs'
  | 'report_logs'
  | 'return_threshold_breaches'
  | 'entity_appointments'
  | 'examinations'
  | 'examination_findings'
  | 'enforcement_actions';

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'pdf';
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';
export type SortDirection = 'asc' | 'desc';

export type DateRangePreset =
  | 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_fy' | 'custom';

export interface ReportDefinition {
  id: string;
  name: string;
  category: string;
  module: string;
  description: string;
  source: ReportSource;
  filters: string[];
  defaultColumns: string[];
  defaultGroupBy?: string;
  exportFormats: ExportFormat[];
}

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  preset?: DateRangePreset;
  regulator?: string;
  sector?: string;
  subSector?: string;
  service?: string;
  licensee?: string;
  officer?: string;
  status?: string;
  slaStatus?: string;
  paymentStatus?: string;
  returnStatus?: string;
  complaintStatus?: string;
  riskLevel?: string;
  // Dynamic, metadata-driven filter keys are allowed.
  [key: string]: any;
}

export interface BuilderConfig {
  name: string;
  description: string;
  source: ReportSource;
  filters: ReportFilters;
  columns: string[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: SortDirection;
}

export interface ReportSummary {
  total?: number;
  groups?: Record<string, number>;
  [key: string]: unknown;
}

export interface ReportRun {
  id: string;
  name: string;
  category: string;
  source?: ReportSource;
  slug?: string;
  filters: ReportFilters;
  selectedColumns?: string[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: SortDirection;
  summary?: ReportSummary;
  rows: Record<string, unknown>[];
  rowCount: number;
  generatedBy?: string | null;
  generatedAt: string;
  durationMs?: number | null;
  errorMessage?: string | null;
  status: 'ready' | 'generating' | 'failed' | 'expired' | 'queued';
}

export interface ReportRunRow {
  id: string;
  reportRunId: string;
  rowIndex: number;
  rowData: Record<string, unknown>;
}

export interface ReportSchedule {
  id: string;
  reportId: string | null;
  reportSlug?: string | null;
  reportName?: string;
  source?: string;
  frequency: ScheduleFrequency;
  recipients: string[];
  recipientRoles?: string[];
  exportFormat: ExportFormat;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus?: string | null;
  lastError?: string | null;
  retryCount?: number;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  source: ReportSource;
  filters: ReportFilters;
  selectedColumns: string[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: SortDirection;
  visibility: 'private' | 'shared';
  createdBy?: string | null;
  createdAt: string;
}

export interface ReportFavorite {
  reportSlug: string;
  createdAt: string;
}

export interface ReportMetrics {
  totalApplications: number;
  pendingApplications: number;
  activeLicenses: number;
  totalRevenue: number;
  outstandingDues: number;
  overdueReturns: number;
  complianceRate: number;
  complaintBacklog: number;
  appsByMonth: Array<{ month: string; count: number }>;
  appsByStatus: Array<{ name: string; value: number }>;
  revenueByMonth: Array<{ month: string; amount: number }>;
  complianceStats: Array<{ name: string; value: number }>;
  licenseExpiryTrend: Array<{ month: string; expiring: number }>;
  complaintsByStatus: Array<{ name: string; value: number }>;
}
