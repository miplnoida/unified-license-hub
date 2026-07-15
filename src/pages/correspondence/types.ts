export type CorrespondenceStatus =
  | 'received'
  | 'classified'
  | 'assigned'
  | 'in_review'
  | 'approved'
  | 'responded'
  | 'closed';

export type CorrespondenceChannel = 'email' | 'letter' | 'portal' | 'fax' | 'sms';
export type CorrespondencePriority = 'low' | 'normal' | 'high' | 'urgent';
export type CorrespondenceDirection = 'inbound' | 'outbound';

export interface CorrespondenceAttachment {
  id: string;
  fileName: string;
  version: number;
  sizeKb: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface CorrespondenceAuditEntry {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: string;
  detail?: string;
}

export interface CorrespondenceCase {
  id: string;
  reference: string;
  subject: string;
  senderName: string;
  senderOrg?: string;
  channel: CorrespondenceChannel;
  direction: CorrespondenceDirection;
  category: string;
  priority: CorrespondencePriority;
  status: CorrespondenceStatus;
  assignedUnit: string;
  assignedOfficer: string;
  receivedAt: string;
  dueAt: string;
  respondedAt?: string;
  closedAt?: string;
  slaDays: number;
  retentionYears: number;
  retentionExpiresAt: string;
  tags: string[];
  summary: string;
  attachments: CorrespondenceAttachment[];
  audit: CorrespondenceAuditEntry[];
}

export interface RoutingRule {
  id: string;
  name: string;
  active: boolean;
  matchType: 'category' | 'institution' | 'subject' | 'priority' | 'channel';
  matchValue: string;
  assignUnit: string;
  assignOfficer?: string;
  priority: CorrespondencePriority;
  allowManualOverride: boolean;
  order: number;
}
