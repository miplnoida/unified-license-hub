import type {
  ComplaintRef,
  DetectionRule,
  DuplicateCluster,
  SuspectedDuplicatePair,
} from './types';

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const c = (o: ComplaintRef): ComplaintRef => o;

export const seedComplaints: ComplaintRef[] = [
  c({ id: 'CMP-8801', reference: 'CMP-2026-8801', complainantName: 'Devon Clarke', complainantEmail: 'devon.clarke@mail.com', complainantPhone: '+1-876-555-0181', institution: 'FinCorp Commercial Bank Limited', product: 'Savings Account', issue: 'Unauthorized fee charge', description: 'Repeated unauthorized monthly service fees deducted without notice.', severity: 'high', submittedAt: daysAgo(2), channel: 'portal' }),
  c({ id: 'CMP-8802', reference: 'CMP-2026-8802', complainantName: 'Devon A. Clarke', complainantEmail: 'devon.clarke@mail.com', complainantPhone: '+1-876-555-0181', institution: 'FinCorp Commercial Bank Ltd.', product: 'Savings Account', issue: 'Unauthorized fees', description: 'Bank is charging fees I did not authorize on my savings.', severity: 'high', submittedAt: daysAgo(1), channel: 'email' }),
  c({ id: 'CMP-8803', reference: 'CMP-2026-8803', complainantName: 'Priya Ramnarine', complainantEmail: 'priya.r@coastal.co', institution: 'Coastal Credit Union', product: 'Auto Loan', intermediary: 'AutoDeal Brokers', issue: 'Mis-selling', description: 'Broker did not disclose full interest rate on the auto loan.', severity: 'medium', submittedAt: daysAgo(4), channel: 'portal' }),
  c({ id: 'CMP-8804', reference: 'CMP-2026-8804', complainantName: 'M. Grant', complainantEmail: 'mgrant@example.com', institution: 'Coastal Credit Union', product: 'Auto Loan', intermediary: 'AutoDeal Brokers', issue: 'Mis-selling of loan terms', description: 'AutoDeal Brokers hid the true rate on my credit union loan.', severity: 'medium', submittedAt: daysAgo(3), channel: 'portal' }),
  c({ id: 'CMP-8805', reference: 'CMP-2026-8805', complainantName: 'Anonymous', institution: 'Southern Life Assurance', product: 'Whole Life Policy', issue: 'Delayed claim payout', description: 'Claim submitted six weeks ago, no response from insurer.', severity: 'high', submittedAt: daysAgo(6), channel: 'letter' }),
  c({ id: 'CMP-8806', reference: 'CMP-2026-8806', complainantName: 'R. Thompson', complainantPhone: '+1-876-555-0244', institution: 'Southern Life Assurance', product: 'Whole Life Policy', issue: 'Delayed claim', description: 'Waiting on claim payment; multiple follow-ups ignored.', severity: 'high', submittedAt: daysAgo(5), channel: 'phone' }),
  c({ id: 'CMP-8807', reference: 'CMP-2026-8807', complainantName: 'L. Powell', institution: 'Island Insurance Co.', product: 'Motor Insurance', issue: 'Claim denied without reason', description: 'Motor claim denied with no written explanation provided.', severity: 'medium', submittedAt: daysAgo(8), channel: 'portal' }),
  c({ id: 'CMP-8808', reference: 'CMP-2026-8808', complainantName: 'K. Bailey', institution: 'FinCorp Commercial Bank Limited', product: 'Credit Card', issue: 'Fraudulent transaction', description: 'Card used abroad while I was locally present.', severity: 'high', submittedAt: daysAgo(3), channel: 'email' }),
];

const map: Record<string, ComplaintRef> = Object.fromEntries(seedComplaints.map(x => [x.id, x]));

export const seedPairs: SuspectedDuplicatePair[] = [
  {
    id: 'DUP-1',
    primary: map['CMP-8801'],
    candidate: map['CMP-8802'],
    similarityScore: 96,
    matched: [
      { field: 'Email', detail: 'Exact match: devon.clarke@mail.com', strength: 'exact' },
      { field: 'Phone', detail: 'Exact match', strength: 'exact' },
      { field: 'Institution', detail: 'Fuzzy 94% (Ltd. vs Limited)', strength: 'fuzzy' },
      { field: 'Issue keywords', detail: "Overlap: 'unauthorized', 'fee'", strength: 'partial' },
    ],
    detectedAt: daysAgo(1),
    status: 'pending',
    recommendation: 'merge',
  },
  {
    id: 'DUP-2',
    primary: map['CMP-8803'],
    candidate: map['CMP-8804'],
    similarityScore: 82,
    matched: [
      { field: 'Institution', detail: 'Exact match', strength: 'exact' },
      { field: 'Intermediary', detail: 'Exact match: AutoDeal Brokers', strength: 'exact' },
      { field: 'Product', detail: 'Exact match', strength: 'exact' },
      { field: 'Issue keywords', detail: "Overlap: 'mis-selling', 'rate'", strength: 'partial' },
    ],
    detectedAt: daysAgo(3),
    status: 'pending',
    recommendation: 'link',
  },
  {
    id: 'DUP-3',
    primary: map['CMP-8805'],
    candidate: map['CMP-8806'],
    similarityScore: 74,
    matched: [
      { field: 'Institution', detail: 'Exact match', strength: 'exact' },
      { field: 'Product', detail: 'Exact match', strength: 'exact' },
      { field: 'Issue keywords', detail: "Overlap: 'delayed', 'claim'", strength: 'partial' },
    ],
    detectedAt: daysAgo(5),
    status: 'linked',
    recommendation: 'link',
  },
];

export const seedClusters: DuplicateCluster[] = [
  {
    id: 'CL-INST-1',
    dimension: 'institution',
    label: 'FinCorp Commercial Bank Limited',
    count: 3,
    dateRange: { from: daysAgo(6), to: daysAgo(1) },
    severityMix: { low: 0, medium: 0, high: 3 },
    trend: [
      { week: 'W-3', count: 0 }, { week: 'W-2', count: 1 }, { week: 'W-1', count: 1 }, { week: 'W0', count: 1 },
    ],
    complaints: [map['CMP-8801'], map['CMP-8802'], map['CMP-8808']],
  },
  {
    id: 'CL-INTM-1',
    dimension: 'intermediary',
    label: 'AutoDeal Brokers',
    count: 2,
    dateRange: { from: daysAgo(4), to: daysAgo(3) },
    severityMix: { low: 0, medium: 2, high: 0 },
    trend: [{ week: 'W-3', count: 0 }, { week: 'W-2', count: 0 }, { week: 'W-1', count: 2 }, { week: 'W0', count: 0 }],
    complaints: [map['CMP-8803'], map['CMP-8804']],
  },
  {
    id: 'CL-PROD-1',
    dimension: 'product',
    label: 'Whole Life Policy',
    count: 2,
    dateRange: { from: daysAgo(6), to: daysAgo(5) },
    severityMix: { low: 0, medium: 0, high: 2 },
    trend: [{ week: 'W-3', count: 0 }, { week: 'W-2', count: 2 }, { week: 'W-1', count: 0 }, { week: 'W0', count: 0 }],
    complaints: [map['CMP-8805'], map['CMP-8806']],
  },
  {
    id: 'CL-ISSUE-1',
    dimension: 'issue',
    label: 'Delayed claim payout',
    count: 3,
    dateRange: { from: daysAgo(8), to: daysAgo(5) },
    severityMix: { low: 0, medium: 1, high: 2 },
    trend: [{ week: 'W-3', count: 1 }, { week: 'W-2', count: 1 }, { week: 'W-1', count: 1 }, { week: 'W0', count: 0 }],
    complaints: [map['CMP-8805'], map['CMP-8806'], map['CMP-8807']],
  },
  {
    id: 'CL-ISSUE-2',
    dimension: 'issue',
    label: 'Unauthorized fees',
    count: 2,
    dateRange: { from: daysAgo(2), to: daysAgo(1) },
    severityMix: { low: 0, medium: 0, high: 2 },
    trend: [{ week: 'W-3', count: 0 }, { week: 'W-2', count: 0 }, { week: 'W-1', count: 0 }, { week: 'W0', count: 2 }],
    complaints: [map['CMP-8801'], map['CMP-8802']],
  },
];

export const seedRules: DetectionRule[] = [
  { id: 'R1', name: 'Exact email match', description: 'Same complainant email across complaints', enabled: true, weight: 90, category: 'identity' },
  { id: 'R2', name: 'Exact phone match', description: 'Same complainant phone number', enabled: true, weight: 85, category: 'identity' },
  { id: 'R3', name: 'Fuzzy name match', description: 'Complainant name similarity ≥ 85%', enabled: true, weight: 60, category: 'identity' },
  { id: 'R4', name: 'Same institution + product', description: 'Same regulated entity and product combination', enabled: true, weight: 55, category: 'context' },
  { id: 'R5', name: 'Same intermediary', description: 'Shared broker or agent reference', enabled: true, weight: 50, category: 'context' },
  { id: 'R6', name: 'Description keyword overlap', description: 'Shared distinctive keywords in narrative', enabled: true, weight: 40, category: 'content' },
  { id: 'R7', name: 'Time-window proximity', description: 'Complaints filed within configured window', enabled: true, weight: 25, category: 'context' },
  { id: 'R8', name: 'Same issue category', description: 'Both complaints tagged with the same issue type', enabled: false, weight: 35, category: 'content' },
];
