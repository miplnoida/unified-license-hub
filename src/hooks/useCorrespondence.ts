import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CorrespondenceStatus =
  | 'received' | 'classified' | 'assigned' | 'in_review' | 'approved' | 'responded' | 'closed';
export type CorrespondencePriority = 'low' | 'normal' | 'high' | 'urgent';
export type CorrespondenceChannel = 'email' | 'letter' | 'portal' | 'fax' | 'sms';

export type ThreadType =
  | 'rfi_response' | 'general_correspondence' | 'enforcement_notice'
  | 'condition_reminder' | 'supervisory_letter' | 'internal_discussion';
export type ThreadState = 'open' | 'pending_response' | 'closed';
export type MessageKind = 'system' | 'external_outbound' | 'external_inbound' | 'internal';
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'bounced';

export const THREAD_TYPE_LABELS: Record<ThreadType, string> = {
  rfi_response: 'RFI Response',
  general_correspondence: 'General Correspondence',
  enforcement_notice: 'Enforcement Notice',
  condition_reminder: 'Condition Reminder',
  supervisory_letter: 'Supervisory Letter',
  internal_discussion: 'Internal Discussion',
};

export const THREAD_STATE_LABELS: Record<ThreadState, string> = {
  open: 'Open',
  pending_response: 'Pending Response',
  closed: 'Closed',
};

export interface CorrespondenceThread {
  id: string;
  reference: string;
  subject: string;
  summary: string | null;
  category: string;
  channel: CorrespondenceChannel;
  direction: 'inbound' | 'outbound';
  priority: CorrespondencePriority;
  status: CorrespondenceStatus;
  sender_name: string;
  sender_org: string | null;
  sender_email: string | null;
  licensee_id: string | null;
  assigned_unit: string | null;
  assigned_officer: string | null;
  received_at: string;
  due_at: string | null;
  sla_days: number;
  responded_at: string | null;
  closed_at: string | null;
  retention_years: number;
  retention_expires_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  thread_type: ThreadType;
  thread_state: ThreadState;
  source_type: string | null;
  source_id: string | null;
  source_reference: string | null;
  last_message_at: string | null;
  pending_since: string | null;
  response_due_at: string | null;
  close_justification: string | null;
  is_entity_facing: boolean;
}

export interface CorrespondenceMessage {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  channel: string;
  subject: string | null;
  body: string;
  is_internal_note: boolean;
  author_id: string | null;
  author_name: string | null;
  author_role: string | null;
  sent_at: string;
  message_kind: MessageKind;
  delivery_status: DeliveryStatus;
  delivered_at: string | null;
  opened_at: string | null;
  bounce_reason: string | null;
  is_draft: boolean;
}

export interface CorrespondenceParticipant {
  id: string;
  thread_id: string;
  user_id: string | null;
  party_type: string;
  display_name: string;
  party_role: string | null;
  last_read_at: string | null;
}


export interface CorrespondenceAttachment {
  id: string;
  thread_id: string;
  file_name: string;
  storage_path: string;
  size_kb: number;
  content_type: string | null;
  version: number;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface CorrespondenceEvent {
  id: string;
  thread_id: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface ThreadFilters {
  query?: string;
  category?: string;
  status?: string;
  channel?: string;
  openOnly?: boolean;
  licenseeOnly?: boolean;
  threadType?: string;
  threadState?: string;
  sourceType?: string;
  sourceId?: string;
}

const TABLE = 'correspondence_threads';

export function useCorrespondenceThreads(filters: ThreadFilters = {}) {
  return useQuery({
    queryKey: ['correspondence-threads', filters],
    queryFn: async (): Promise<CorrespondenceThread[]> => {
      let q = (supabase as any).from(TABLE).select('*').order('received_at', { ascending: false }).limit(300);
      if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category);
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.channel && filters.channel !== 'all') q = q.eq('channel', filters.channel);
      if (filters.threadType && filters.threadType !== 'all') q = q.eq('thread_type', filters.threadType);
      if (filters.threadState && filters.threadState !== 'all') q = q.eq('thread_state', filters.threadState);
      if (filters.sourceType) q = q.eq('source_type', filters.sourceType);
      if (filters.sourceId) q = q.eq('source_id', filters.sourceId);
      if (filters.openOnly) q = q.not('status', 'in', '("closed","responded")');
      const term = (filters.query ?? '').trim();
      if (term) {
        const like = `%${term}%`;
        q = q.or(`subject.ilike.${like},reference.ilike.${like},sender_name.ilike.${like},sender_org.ilike.${like}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CorrespondenceThread[];
    },
  });
}

export function useCorrespondenceThread(id?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: ['correspondence-thread', id],
    queryFn: async () => {
      const [thread, messages, attachments, events, participants] = await Promise.all([
        (supabase as any).from(TABLE).select('*').eq('id', id).maybeSingle(),
        (supabase as any).from('correspondence_messages').select('*').eq('thread_id', id).order('sent_at', { ascending: true }),
        (supabase as any).from('correspondence_attachments').select('*').eq('thread_id', id).order('created_at', { ascending: false }),
        (supabase as any).from('correspondence_events').select('*').eq('thread_id', id).order('created_at', { ascending: false }),
        (supabase as any).from('correspondence_thread_participants').select('*').eq('thread_id', id).order('created_at', { ascending: true }),
      ]);
      if (thread.error) throw thread.error;
      if (!thread.data) throw new Error('Correspondence not found or not accessible.');
      return {
        thread: thread.data as CorrespondenceThread,
        messages: (messages.data ?? []) as CorrespondenceMessage[],
        attachments: (attachments.data ?? []) as CorrespondenceAttachment[],
        events: (events.data ?? []) as CorrespondenceEvent[],
        participants: (participants.data ?? []) as CorrespondenceParticipant[],
      };
    },
  });
}


function useInvalidate(id?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['correspondence-threads'] });
    if (id) qc.invalidateQueries({ queryKey: ['correspondence-thread', id] });
  };
}

export interface CreateThreadInput {
  subject: string;
  summary?: string;
  sender_name: string;
  sender_org?: string;
  sender_email?: string;
  channel: string;
  category: string;
  priority?: string;
  licensee_id?: string | null;
  tags?: string[];
  body?: string;
}

export function useCreateCorrespondenceThread() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: CreateThreadInput): Promise<string> => {
      const { data, error } = await (supabase as any).rpc('create_correspondence_thread', {
        _subject: input.subject,
        _summary: input.summary ?? null,
        _sender_name: input.sender_name,
        _sender_org: input.sender_org ?? null,
        _sender_email: input.sender_email ?? null,
        _channel: input.channel,
        _category: input.category,
        _priority: input.priority ?? null,
        _licensee_id: input.licensee_id ?? null,
        _tags: input.tags ?? [],
        _body: input.body ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function usePostCorrespondenceMessage(threadId?: string) {
  const invalidate = useInvalidate(threadId);
  return useMutation({
    mutationFn: async (input: {
      thread_id: string; body: string; is_internal_note?: boolean; channel?: string; subject?: string; dispatch_id?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc('post_correspondence_message', {
        _thread_id: input.thread_id,
        _body: input.body,
        _is_internal_note: input.is_internal_note ?? false,
        _channel: input.channel ?? 'portal',
        _subject: input.subject ?? null,
        _dispatch_id: input.dispatch_id ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useClassifyCorrespondence(threadId?: string) {
  const invalidate = useInvalidate(threadId);
  return useMutation({
    mutationFn: async (input: { thread_id: string; category: string; priority: string; tags?: string[] }) => {
      const { error } = await (supabase as any).rpc('classify_correspondence', {
        _thread_id: input.thread_id, _category: input.category, _priority: input.priority, _tags: input.tags ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAssignCorrespondence(threadId?: string) {
  const invalidate = useInvalidate(threadId);
  return useMutation({
    mutationFn: async (input: { thread_id: string; unit: string; officer?: string | null; officer_id?: string | null }) => {
      const { error } = await (supabase as any).rpc('assign_correspondence', {
        _thread_id: input.thread_id, _unit: input.unit, _officer: input.officer ?? null, _officer_id: input.officer_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useReviewCorrespondence(threadId?: string) {
  const invalidate = useInvalidate(threadId);
  return useMutation({
    mutationFn: async (input: { thread_id: string; decision: 'start_review' | 'approve' | 'reject'; notes?: string }) => {
      const { error } = await (supabase as any).rpc('record_correspondence_review', {
        _thread_id: input.thread_id, _decision: input.decision, _notes: input.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCloseCorrespondence(threadId?: string) {
  const invalidate = useInvalidate(threadId);
  return useMutation({
    mutationFn: async (input: { thread_id: string; notes?: string }) => {
      const { error } = await (supabase as any).rpc('close_correspondence', {
        _thread_id: input.thread_id, _notes: input.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export async function uploadCorrespondenceFile(threadId: string, file: File, messageId?: string) {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${threadId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage.from('correspondence').upload(path, file, { upsert: false });
  if (upErr) throw upErr;
  const { error } = await (supabase as any).rpc('add_correspondence_attachment', {
    _thread_id: threadId,
    _file_name: file.name,
    _storage_path: path,
    _size_kb: Math.max(1, Math.round(file.size / 1024)),
    _content_type: file.type || null,
    _message_id: messageId ?? null,
  });
  if (error) throw error;
}

export async function getCorrespondenceFileUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from('correspondence').createSignedUrl(storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
}

export interface RoutingRuleRow {
  id: string;
  name: string;
  is_active: boolean;
  match_type: string;
  match_value: string;
  assign_unit: string;
  assign_officer: string | null;
  priority: string;
  sla_days: number;
  allow_manual_override: boolean;
  sort_order: number;
}

export function useRoutingRules() {
  return useQuery({
    queryKey: ['correspondence-routing-rules'],
    queryFn: async (): Promise<RoutingRuleRow[]> => {
      const { data, error } = await (supabase as any)
        .from('correspondence_routing_rules').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoutingRuleRow[];
    },
  });
}

export function useSaveRoutingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<RoutingRuleRow>) => {
      if (rule.id) {
        const { error } = await (supabase as any).from('correspondence_routing_rules').update(rule).eq('id', rule.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('correspondence_routing_rules').insert(rule);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['correspondence-routing-rules'] }),
  });
}

export function useDeleteRoutingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('correspondence_routing_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['correspondence-routing-rules'] }),
  });
}
