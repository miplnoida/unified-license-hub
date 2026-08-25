/**
 * Internal technical support queue (/admin/support).
 *
 * Staff-only workspace for applicant / licensee help requests. Visibility and
 * every action are authorised in the database by `support_is_staff` and
 * `support_has_action`, which read the `support_management` permission module —
 * there are no hardcoded role names on this screen, and every status,
 * assignment and priority change is recorded in `support_ticket_audit` by
 * database triggers.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Paperclip, Send } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  portal_area: string;
  requester_name: string | null;
  requester_email: string | null;
  assigned_to: string | null;
  assigned_team: string | null;
  license_id: string | null;
  licensee_id: string | null;
  sector_id: string | null;
  reference_number: string | null;
  page_path: string | null;
  user_agent: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
};

type Message = { id: string; ticket_id: string; body: string; is_internal: boolean; author_id: string; created_at: string };
type Attachment = { id: string; ticket_id: string; file_name: string; storage_path: string; created_at: string };
type AuditRow = { id: string; ticket_id: string; action: string; details: Record<string, unknown>; actor_id: string | null; created_at: string };
type StaffOption = { id: string; full_name: string | null; email: string | null };

const STATUSES = ['open', 'in_progress', 'awaiting_user', 'resolved', 'closed'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const STATUS_TONE: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  awaiting_user: 'bg-purple-100 text-purple-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-muted text-muted-foreground',
};

const PRIORITY_TONE: Record<string, string> = {
  urgent: 'bg-destructive/10 text-destructive',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-muted text-muted-foreground',
  low: 'bg-muted text-muted-foreground',
};

function ageInDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function SupportQueue() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'mine' | 'resolved' | 'all'>('active');
  const [filters, setFilters] = useState({ q: '', category: 'all', priority: 'all', status: 'all' });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [thread, setThread] = useState<Record<string, Message[]>>({});
  const [files, setFiles] = useState<Record<string, Attachment[]>>({});
  const [audit, setAudit] = useState<Record<string, AuditRow[]>>({});
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [resolution, setResolution] = useState('');

  const load = async () => {
    setLoading(true);
    const [ticketRes, staffRes] = await Promise.all([
      supabase.from('support_tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').order('full_name').limit(300),
    ]);
    if (ticketRes.error) toast.error(ticketRes.error.message);
    setTickets((ticketRes.data || []) as Ticket[]);
    setStaff((staffRes.data || []) as StaffOption[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadDetail = async (id: string) => {
    const [msgRes, attRes, audRes] = await Promise.all([
      supabase.from('support_ticket_messages').select('*').eq('ticket_id', id).order('created_at'),
      supabase.from('support_ticket_attachments').select('*').eq('ticket_id', id).order('created_at'),
      supabase.from('support_ticket_audit').select('*').eq('ticket_id', id).order('created_at', { ascending: false }),
    ]);
    setThread((t) => ({ ...t, [id]: (msgRes.data || []) as Message[] }));
    setFiles((f) => ({ ...f, [id]: (attRes.data || []) as Attachment[] }));
    setAudit((a) => ({ ...a, [id]: (audRes.data || []) as AuditRow[] }));
  };

  const patch = async (id: string, values: Partial<Ticket>) => {
    const { error } = await supabase.from('support_tickets').update(values).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Ticket updated.');
    load();
    if (expanded === id) loadDetail(id);
  };

  const sendReply = async (id: string) => {
    if (!user || reply.trim().length < 2) return;
    const { error } = await supabase
      .from('support_ticket_messages')
      .insert({ ticket_id: id, author_id: user.id, body: reply.trim(), is_internal: internalNote });
    if (error) { toast.error(error.message); return; }
    setReply('');
    loadDetail(id);
    if (!internalNote) toast.success('Reply sent to the requester.');
  };

  const openAttachment = async (path: string) => {
    const { data, error } = await supabase.storage.from('support-attachments').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error('Could not open that file.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const staffName = (id: string | null) => {
    if (!id) return 'Unassigned';
    const s = staff.find((p) => p.id === id);
    return s?.full_name || s?.email || 'Assigned staff';
  };

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return tickets.filter((t) => {
      if (tab === 'active' && ['resolved', 'closed'].includes(t.status)) return false;
      if (tab === 'resolved' && !['resolved', 'closed'].includes(t.status)) return false;
      if (tab === 'mine' && t.assigned_to !== user?.id) return false;
      if (filters.category !== 'all' && t.category !== filters.category) return false;
      if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
      if (filters.status !== 'all' && t.status !== filters.status) return false;
      if (!q) return true;
      return [t.ticket_number, t.subject, t.requester_email, t.requester_name, t.reference_number]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [tickets, tab, filters, user?.id]);

  const categories = useMemo(
    () => Array.from(new Set(tickets.map((t) => t.category))).sort(),
    [tickets],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support Queue"
        description="Technical help requests from applicants and licensees, with assignment, priority and full audit history."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="mine">Assigned to me</TabsTrigger>
          <TabsTrigger value="resolved">Resolved / closed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6 grid gap-3 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Search</Label>
            <Input
              placeholder="Ticket, subject, requester, reference"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={filters.category} onValueChange={(v) => setFilters((f) => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={filters.priority} onValueChange={(v) => setFilters((f) => ({ ...f, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any priority</SelectItem>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading support requests…</p>}
      {!loading && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">No support requests match these filters.</p>
      )}

      <div className="space-y-4">
        {visible.map((t) => (
          <Card key={t.id}>
            <CardContent className="pt-6 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                    <Badge className={STATUS_TONE[t.status] || ''}>{t.status.replace(/_/g, ' ')}</Badge>
                    <Badge variant="outline" className={PRIORITY_TONE[t.priority] || ''}>{t.priority}</Badge>
                    <Badge variant="outline">{t.category.replace(/_/g, ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">{ageInDays(t.created_at)}d old</span>
                  </div>
                  <p className="font-semibold mt-1">{t.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.requester_name || 'Requester'} · {t.requester_email} · raised {formatDateTime(t.created_at)} · {staffName(t.assigned_to)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {t.assigned_to !== user?.id && (
                    <Button variant="outline" size="sm" onClick={() => patch(t.id, { assigned_to: user?.id })}>
                      Assign to me
                    </Button>
                  )}
                  <Select value={t.assigned_to ?? 'none'} onValueChange={(v) => patch(t.id, { assigned_to: v === 'none' ? null : v })}>
                    <SelectTrigger className="w-[190px]"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={t.priority} onValueChange={(v) => patch(t.id, { priority: v })}>
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={t.status} onValueChange={(v) => patch(t.id, { status: v })}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-sm whitespace-pre-wrap">{t.description}</p>

              <div className="grid gap-2 sm:grid-cols-3 rounded-md border bg-muted/30 p-3 text-xs">
                <div><span className="text-muted-foreground">Portal area: </span>{t.portal_area}</div>
                <div><span className="text-muted-foreground">Reference: </span>{t.reference_number || '—'}</div>
                <div><span className="text-muted-foreground">Screen: </span>{t.page_path || '—'}</div>
                <div><span className="text-muted-foreground">Licence: </span>{t.license_id ? t.license_id.slice(0, 8) : '—'}</div>
                <div><span className="text-muted-foreground">Team: </span>{t.assigned_team || '—'}</div>
                <div className="truncate" title={t.user_agent || ''}>
                  <span className="text-muted-foreground">Browser: </span>{t.user_agent || '—'}
                </div>
              </div>

              <Button
                variant="outline" size="sm"
                onClick={() => {
                  const next = expanded === t.id ? null : t.id;
                  setExpanded(next);
                  setResolution(t.resolution_notes ?? '');
                  if (next) loadDetail(next);
                }}
              >
                {expanded === t.id ? 'Hide detail' : 'Conversation, files & history'}
              </Button>

              {expanded === t.id && (
                <div className="space-y-4 border-t pt-4">
                  {(files[t.id] || []).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Attachments</p>
                      {(files[t.id] || []).map((a) => (
                        <button
                          key={a.id} type="button"
                          className="flex items-center gap-2 text-xs text-primary hover:underline"
                          onClick={() => openAttachment(a.storage_path)}
                        >
                          <Paperclip className="h-3 w-3" />{a.file_name}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Conversation</p>
                    {(thread[t.id] || []).map((m) => (
                      <div key={m.id} className={`rounded-md border p-2 text-sm ${m.is_internal ? 'bg-amber-50 border-amber-200' : ''}`}>
                        <p className="text-[11px] text-muted-foreground mb-1">
                          {formatDateTime(m.created_at)}{m.is_internal ? ' · internal note' : ''}
                        </p>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))}
                    {(thread[t.id] || []).length === 0 && (
                      <p className="text-sm text-muted-foreground">No messages yet.</p>
                    )}
                    <div className="flex gap-2">
                      <Input placeholder="Reply to requester…" value={reply} onChange={(e) => setReply(e.target.value)} />
                      <Button size="icon" onClick={() => sendReply(t.id)}><Send className="h-4 w-4" /></Button>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} />
                      Internal note (not visible to the requester)
                    </label>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Resolution notes</Label>
                    <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => patch(t.id, { resolution_notes: resolution })}>
                        Save notes
                      </Button>
                      {t.status !== 'resolved' && (
                        <Button size="sm" onClick={() => patch(t.id, { status: 'resolved', resolution_notes: resolution })}>
                          Mark resolved
                        </Button>
                      )}
                      {t.status !== 'closed' && (
                        <Button size="sm" variant="secondary" onClick={() => patch(t.id, { status: 'closed', resolution_notes: resolution })}>
                          Close ticket
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">History</p>
                    {(audit[t.id] || []).map((a) => (
                      <p key={a.id} className="text-xs text-muted-foreground">
                        {formatDateTime(a.created_at)} · {a.action.replace(/_/g, ' ')} · {staffName(a.actor_id)}
                        {a.details && Object.keys(a.details).length > 0
                          ? ` · ${JSON.stringify(a.details)}`
                          : ''}
                      </p>
                    ))}
                    {(audit[t.id] || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No recorded changes yet.</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
