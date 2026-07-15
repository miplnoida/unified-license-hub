import type { EscalationRule, MockComplaint, EscalationCase, TriggerLogEntry } from './types';

export const MOCK_RULES: EscalationRule[] = [
  {
    key: 'consumer_harm',
    label: 'Consumer Harm',
    description: 'Escalate complaints marked as high or critical consumer harm.',
    enabled: true,
    tier: 'head_of_unit',
    notify: ['Head of Market Conduct', 'Assigned Supervisor'],
    thresholds: { minSeverity: 'high' },
  },
  {
    key: 'age',
    label: 'Complaint Age',
    description: 'Escalate when a complaint remains open beyond the configured age.',
    enabled: true,
    tier: 'supervisor',
    notify: ['Assigned Officer', 'Supervisor'],
    thresholds: { maxAgeDays: 14 },
  },
  {
    key: 'risk_rating',
    label: 'Institution Risk Rating',
    description: 'Escalate complaints filed against high-risk institutions.',
    enabled: true,
    tier: 'executive',
    notify: ['Chief Risk Officer', 'Head of Market Conduct'],
    thresholds: { minRisk: 'high' },
  },
  {
    key: 'volume',
    label: 'Volume Threshold',
    description: 'Escalate when an institution receives many complaints in a rolling window.',
    enabled: true,
    tier: 'executive',
    notify: ['Head of Market Conduct'],
    thresholds: { windowDays: 30, minCount: 10 },
  },
  {
    key: 'recurrence',
    label: 'Complaint Recurrence',
    description: 'Escalate when the same complainant or issue recurs.',
    enabled: false,
    tier: 'supervisor',
    notify: ['Assigned Officer'],
    thresholds: { minRepeats: 3 },
  },
];

export const MOCK_COMPLAINTS: MockComplaint[] = [
  { id: 'c1', number: 'CMP-2026-0142', subject: 'Unauthorised loan deduction', complainant: 'A. Brown', institution: 'FinCorp Commercial Bank', product: 'Personal Loan', ageDays: 21, harm: 'high', institutionRisk: 'high', institutionVolume30d: 14, recurrenceCount: 2, status: 'Under Review' },
  { id: 'c2', number: 'CMP-2026-0155', subject: 'Denied claim without explanation', complainant: 'M. Grant', institution: 'Island Life Insurance', product: 'Life Policy', ageDays: 9, harm: 'critical', institutionRisk: 'medium', institutionVolume30d: 6, recurrenceCount: 1, status: 'Assigned' },
  { id: 'c3', number: 'CMP-2026-0161', subject: 'Excessive fees on savings account', complainant: 'K. Reid', institution: 'National Building Society', product: 'Savings', ageDays: 18, harm: 'medium', institutionRisk: 'low', institutionVolume30d: 3, recurrenceCount: 4, status: 'Assigned' },
  { id: 'c4', number: 'CMP-2026-0163', subject: 'Mis-sold investment product', complainant: 'D. Chen', institution: 'FinCorp Commercial Bank', product: 'Unit Trust', ageDays: 4, harm: 'high', institutionRisk: 'high', institutionVolume30d: 14, recurrenceCount: 1, status: 'New' },
  { id: 'c5', number: 'CMP-2026-0170', subject: 'ATM cash shortfall unresolved', complainant: 'P. Singh', institution: 'Meridian Credit Union', product: 'ATM Services', ageDays: 30, harm: 'medium', institutionRisk: 'medium', institutionVolume30d: 2, recurrenceCount: 1, status: 'Under Review' },
  { id: 'c6', number: 'CMP-2026-0181', subject: 'Repeated billing errors', complainant: 'A. Brown', institution: 'FinCorp Commercial Bank', product: 'Credit Card', ageDays: 7, harm: 'medium', institutionRisk: 'high', institutionVolume30d: 14, recurrenceCount: 3, status: 'New' },
  { id: 'c7', number: 'CMP-2026-0189', subject: 'Policy lapse without notice', complainant: 'S. Powell', institution: 'Island Life Insurance', product: 'Health Policy', ageDays: 12, harm: 'high', institutionRisk: 'medium', institutionVolume30d: 6, recurrenceCount: 1, status: 'Assigned' },
  { id: 'c8', number: 'CMP-2026-0192', subject: 'Broker withheld premium payment', complainant: 'R. Clarke', institution: 'BlueSky Brokers', product: 'General Insurance', ageDays: 22, harm: 'critical', institutionRisk: 'high', institutionVolume30d: 8, recurrenceCount: 2, status: 'Under Review' },
];

const now = new Date();
const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();

export const MOCK_CASES: EscalationCase[] = [
  { id: 'ec1', complaintId: 'c1', ruleKey: 'age', ruleLabel: 'Complaint Age', severity: 'high', targetTier: 'supervisor', triggerReason: 'Open 21 days (threshold 14)', triggeredAt: iso(1), status: 'pending' },
  { id: 'ec2', complaintId: 'c2', ruleKey: 'consumer_harm', ruleLabel: 'Consumer Harm', severity: 'critical', targetTier: 'head_of_unit', triggerReason: 'Consumer harm marked Critical', triggeredAt: iso(2), status: 'acknowledged', assignedTo: 'J. Whitfield' },
  { id: 'ec3', complaintId: 'c4', ruleKey: 'risk_rating', ruleLabel: 'Institution Risk Rating', severity: 'high', targetTier: 'executive', triggerReason: 'FinCorp rated High risk', triggeredAt: iso(0), status: 'pending' },
  { id: 'ec4', complaintId: 'c1', ruleKey: 'volume', ruleLabel: 'Volume Threshold', severity: 'high', targetTier: 'executive', triggerReason: 'FinCorp: 14 complaints in 30 days (threshold 10)', triggeredAt: iso(0), status: 'pending' },
  { id: 'ec5', complaintId: 'c8', ruleKey: 'consumer_harm', ruleLabel: 'Consumer Harm', severity: 'critical', targetTier: 'head_of_unit', triggerReason: 'Consumer harm marked Critical', triggeredAt: iso(3), status: 'escalated', assignedTo: 'M. Thompson' },
  { id: 'ec6', complaintId: 'c3', ruleKey: 'recurrence', ruleLabel: 'Complaint Recurrence', severity: 'medium', targetTier: 'supervisor', triggerReason: 'Issue recurred 4 times (threshold 3)', triggeredAt: iso(4), status: 'snoozed' },
  { id: 'ec7', complaintId: 'c5', ruleKey: 'age', ruleLabel: 'Complaint Age', severity: 'high', targetTier: 'supervisor', triggerReason: 'Open 30 days (threshold 14)', triggeredAt: iso(2), status: 'pending' },
];

export const MOCK_TRIGGERS: TriggerLogEntry[] = [
  { id: 't1', ruleKey: 'consumer_harm', ruleLabel: 'Consumer Harm', complaintNumber: 'CMP-2026-0155', institution: 'Island Life Insurance', triggeredAt: iso(2), severity: 'critical', outcome: 'auto_notified', note: 'Head of Unit notified' },
  { id: 't2', ruleKey: 'age', ruleLabel: 'Complaint Age', complaintNumber: 'CMP-2026-0142', institution: 'FinCorp Commercial Bank', triggeredAt: iso(1), severity: 'high', outcome: 'pending' },
  { id: 't3', ruleKey: 'volume', ruleLabel: 'Volume Threshold', complaintNumber: 'CMP-2026-0163', institution: 'FinCorp Commercial Bank', triggeredAt: iso(0), severity: 'high', outcome: 'pending', note: '14 complaints in 30d' },
  { id: 't4', ruleKey: 'risk_rating', ruleLabel: 'Institution Risk Rating', complaintNumber: 'CMP-2026-0163', institution: 'FinCorp Commercial Bank', triggeredAt: iso(0), severity: 'high', outcome: 'pending' },
  { id: 't5', ruleKey: 'consumer_harm', ruleLabel: 'Consumer Harm', complaintNumber: 'CMP-2026-0192', institution: 'BlueSky Brokers', triggeredAt: iso(3), severity: 'critical', outcome: 'escalated', note: 'Escalated to Enforcement' },
  { id: 't6', ruleKey: 'recurrence', ruleLabel: 'Complaint Recurrence', complaintNumber: 'CMP-2026-0161', institution: 'National Building Society', triggeredAt: iso(4), severity: 'medium', outcome: 'dismissed', note: 'Duplicate cluster already open' },
  { id: 't7', ruleKey: 'age', ruleLabel: 'Complaint Age', complaintNumber: 'CMP-2026-0170', institution: 'Meridian Credit Union', triggeredAt: iso(2), severity: 'high', outcome: 'pending' },
];
