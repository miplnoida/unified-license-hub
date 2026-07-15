export type ClusterDimension = 'institution' | 'product' | 'intermediary' | 'issue';
export type DuplicateSeverity = 'low' | 'medium' | 'high';
export type DuplicateStatus = 'pending' | 'confirmed' | 'dismissed' | 'merged' | 'linked';

export interface MatchedField {
  field: string;
  detail: string;
  strength: 'exact' | 'fuzzy' | 'partial';
}

export interface ComplaintRef {
  id: string;
  reference: string;
  complainantName: string;
  complainantEmail?: string;
  complainantPhone?: string;
  institution: string;
  product?: string;
  intermediary?: string;
  issue: string;
  description: string;
  severity: DuplicateSeverity;
  submittedAt: string;
  channel: 'portal' | 'email' | 'phone' | 'walk-in' | 'letter';
}

export interface SuspectedDuplicatePair {
  id: string;
  primary: ComplaintRef;
  candidate: ComplaintRef;
  similarityScore: number; // 0-100
  matched: MatchedField[];
  detectedAt: string;
  status: DuplicateStatus;
  recommendation: 'merge' | 'link' | 'review';
}

export interface DuplicateCluster {
  id: string;
  dimension: ClusterDimension;
  label: string;
  count: number;
  dateRange: { from: string; to: string };
  severityMix: { low: number; medium: number; high: number };
  trend: { week: string; count: number }[];
  complaints: ComplaintRef[];
}

export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weight: number; // 0-100
  category: 'identity' | 'content' | 'context';
}

export interface DetectionSettings {
  minSimilarity: number;
  timeWindowDays: number;
  autoLink: boolean;
  notifyReviewer: boolean;
}
