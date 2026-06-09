export type ReportSource =
  | 'applications'
  | 'licenses'
  | 'payments'
  | 'compliance_returns'
  | 'complaints'
  | 'users'
  | 'audit_logs';

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'pdf';

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export type DateRangePreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_quarter'
  | 'this_fy'
  | 'custom';

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
  riskLevel?: string;
}

export interface BuilderConfig {
  name: string;
  description: string;
  source: ReportSource;
  filters: ReportFilters;
  columns: string[];
  groupBy?: string;
  sortBy?: string;
}

export interface ReportRun {
  id: string;
  name: string;
  category: string;
  source?: ReportSource;
  filters: ReportFilters;
  rows: Record<string, unknown>[];
  rowCount: number;
  generatedBy?: string | null;
  generatedAt: string;
  status: 'ready' | 'generating' | 'failed' | 'expired';
}

export interface ReportSchedule {
  id: string;
  reportId: string;
  reportName?: string;
  frequency: ScheduleFrequency;
  recipients: string[];
  exportFormat: ExportFormat;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
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
