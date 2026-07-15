export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Tier = 'supervisor' | 'head_of_unit' | 'executive' | 'enforcement';
export type RuleKey = 'consumer_harm' | 'age' | 'risk_rating' | 'volume' | 'recurrence';
export type CaseStatus = 'pending' | 'acknowledged' | 'escalated' | 'dismissed' | 'snoozed';

export interface EscalationRule {
  key: RuleKey;
  label: string;
  description: string;
  enabled: boolean;
  tier: Tier;
  notify: string[];
  // Thresholds vary by rule; kept as loose bag for UI-only:
  thresholds: Record<string, number | string>;
}

export interface MockComplaint {
  id: string;
  number: string;
  subject: string;
  complainant: string;
  institution: string;
  product: string;
  ageDays: number;
  harm: Severity;
  institutionRisk: Severity;
  institutionVolume30d: number;
  recurrenceCount: number;
  status: string;
}

export interface EscalationCase {
  id: string;
  complaintId: string;
  ruleKey: RuleKey;
  ruleLabel: string;
  severity: Severity;
  targetTier: Tier;
  triggerReason: string;
  triggeredAt: string;
  status: CaseStatus;
  assignedTo?: string;
}

export interface TriggerLogEntry {
  id: string;
  ruleKey: RuleKey;
  ruleLabel: string;
  complaintNumber: string;
  institution: string;
  triggeredAt: string;
  severity: Severity;
  outcome: 'escalated' | 'pending' | 'dismissed' | 'auto_notified';
  note?: string;
}

export const TIER_LABEL: Record<Tier, string> = {
  supervisor: 'Supervisor',
  head_of_unit: 'Head of Unit',
  executive: 'Executive',
  enforcement: 'Enforcement',
};
