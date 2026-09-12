/**
 * Applicant / licensee technical support centre (/support).
 *
 * Separate from regulatory complaints: this is for portal and technical issues
 * (login problems, upload failures, form errors). Tickets are worked by staff in
 * the internal support queue at /admin/support.
 *
 * Requests capture supporting context automatically (the screen the user was on,
 * their browser, and the licence/entity they were acting for) plus any related
 * reference number and screenshots, so support staff do not have to ask for it.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLicenseEntitlements } from '@/hooks/useLicenseEntitlements';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { LifeBuoy, Paperclip, Send, X } from 'lucide-react';
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
  reference_number: string | null;
  page_path: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
};

type Message = { id: string; ticket_id: string; body: string; is_internal: boolean; author_id: string; created_at: string };
type Attachment = { id: string; ticket_id: string; file_name: string; storage_path: string; created_at: string };

const CATEGORIES = [
  { value: 'technical', label: 'Technical issue / error' },
  { value: 'access', label: 'Login or access problem' },
  { value: 'forms', label: 'Forms and submissions' },
  { value: 'returns', label: 'Returns filing' },
  { value: 'payments', label: 'Payments and fees' },
  { value: 'other', label: 'Something else' },
];

const STATUS_TONE: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  awaiting_user: 'bg-purple-100 text-purple-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-muted text-muted-foreground',
};

const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function SupportCenter() {
  const { user } = useAuth();
  const { licenses } = useLicenseEntitlements();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    subject: '', description: '', category: 'technical', priority: 'medium',
    license_id: 'none', reference_number: '', page_path: '',
  });

  const load = async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { toast.error(error.message); return; }
    setTickets((data || []) as Ticket[]);
  };

  useEffect(() => { load(); }, []);

  const loadThread = async (ticketId: string) => {
    const [msgRes, attRes] = await Promise.all([
      supabase.from('support_ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at'),
      supabase.from('support_ticket_attachments').select('*').eq('ticket_id', ticketId).order('created_at'),
    ]);
    setMessages((m) => ({ ...m, [ticketId]: (msgRes.data || []) as Message[] }));
    setAttachments((a) => ({ ...a, [ticketId]: (attRes.data || []) as Attachment[] }));
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      if (files.length + accepted.length >= MAX_FILES) { toast.error(`Up to ${MAX_FILES} files.`); break; }
      if (file.size > MAX_FILE_BYTES) { toast.error(`${file.name} is larger than 10MB.`); continue; }
      accepted.push(file);
    }
    setFiles((f) => [...f, ...accepted]);
  };

  const uploadAttachments = async (ticketId: string) => {
    for (const file of files) {
      const path = `${ticketId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('support-attachments').upload(path, file);
      if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
      await supabase.from('support_ticket_attachments').insert({
        ticket_id: ticketId,
        storage_path: path,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user?.id,
      });
    }
  };

  const openAttachment = async (path: string) => {
    const { data, error } = await supabase.storage.from('support-attachments').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error('Could not open that file.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (form.subject.trim().length < 5 || form.description.trim().length < 20) {
      toast.error('Please provide a subject and a description of at least 20 characters.');
      return;
    }
    setSaving(true);
    const licence = licenses.find((l) => l.license_id === form.license_id);
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        requester_id: user.id,
        requester_email: user.email,
        requester_name: (user as { full_name?: string }).full_name || user.email,
        subject: form.subject.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
        portal_area: 'external_portal',
        license_id: licence?.license_id ?? null,
        licensee_id: licence?.licensee_id ?? null,
        sector_id: licence?.sector_id ?? null,
        reference_number: form.reference_number.trim() || null,
        page_path: form.page_path.trim() || null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
      })
      .select('id, ticket_number')
      .single();
    if (error) { setSaving(false); toast.error(error.message); return; }
    if (data?.id && files.length) await uploadAttachments(data.id);
    setSaving(false);
    toast.success(`Support request ${data?.ticket_number} created.`);
    setForm({ subject: '', description: '', category: 'technical', priority: 'medium', license_id: 'none', reference_number: '', page_path: '' });
    setFiles([]);
    load();
  };

  const sendReply = async (ticketId: string) => {
    if (!user || reply.trim().length < 2) return;
    const { error } = await supabase
      .from('support_ticket_messages')
      .insert({ ticket_id: ticketId, author_id: user.id, body: reply.trim(), is_internal: false });
    if (error) { toast.error(error.message); return; }
    setReply('');
    loadThread(ticketId);
  };

  const openTickets = useMemo(() => tickets.filter((t) => !['resolved', 'closed'].includes(t.status)), [tickets]);
  const closedTickets = useMemo(() => tickets.filter((t) => ['resolved', 'closed'].includes(t.status)), [tickets]);

  const renderTicket = (t: Ticket) => (
    <Card key={t.id} className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t.subject}</CardTitle>
            <p className="text-xs text-muted-foreground font-mono mt-1">{t.ticket_number} · raised {formatDateTime(t.created_at)}</p>
          </div>
          <Badge className={STATUS_TONE[t.status] || ''}>{t.status.replace(/_/g, ' ')}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm whitespace-pre-wrap">{t.description}</p>
        {(t.reference_number || t.page_path) && (
          <p className="text-xs text-muted-foreground">
            {t.reference_number ? `Related reference: ${t.reference_number}` : ''}
            {t.reference_number && t.page_path ? ' · ' : ''}
            {t.page_path ? `Screen: ${t.page_path}` : ''}
          </p>
        )}
        {t.resolution_notes && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Resolution</p>
            {t.resolution_notes}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const next = selected === t.id ? null : t.id;
            setSelected(next);
            if (next) loadThread(next);
          }}
        >
          {selected === t.id ? 'Hide conversation' : 'View conversation'}
        </Button>
        {selected === t.id && (
          <div className="space-y-3 border-t pt-3">
            {(attachments[t.id] || []).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Attachments</p>
                {(attachments[t.id] || []).map((a) => (
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
            {(messages[t.id] || []).map((m) => (
              <div key={m.id} className="rounded-md border p-2 text-sm">
                <p className="text-[11px] text-muted-foreground mb-1">{formatDateTime(m.created_at)}</p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
            {(messages[t.id] || []).length === 0 && (
              <p className="text-sm text-muted-foreground">No replies yet. Our support team will respond here.</p>
            )}
            {!['closed'].includes(t.status) && (
              <div className="flex gap-2">
                <Input placeholder="Add a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
                <Button size="icon" onClick={() => sendReply(t.id)}><Send className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <LifeBuoy className="h-6 w-6 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-semibold">Help &amp; technical support</h1>
          <p className="text-sm text-muted-foreground">
            Raise portal or technical issues here. For regulatory complaints about a
            licensed entity, use the complaints channel instead.
          </p>
        </div>
      </div>

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">New request</TabsTrigger>
          <TabsTrigger value="open">Open ({openTickets.length})</TabsTrigger>
          <TabsTrigger value="closed">Resolved ({closedTickets.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="pt-4">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={submitTicket} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Urgency</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High — blocking a deadline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="s-subject">Subject</Label>
                  <Input id="s-subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="s-desc">Describe the issue</Label>
                  <Textarea
                    id="s-desc" rows={7} value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What were you doing, what did you expect, and what happened? Include any error message and the screen/page."
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {licenses.length > 0 && (
                    <div>
                      <Label>Related licence / entity</Label>
                      <Select value={form.license_id} onValueChange={(v) => setForm((f) => ({ ...f, license_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Not specific to a licence" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not specific to a licence</SelectItem>
                          {licenses.map((l) => (
                            <SelectItem key={l.license_id} value={l.license_id}>
                              {l.license_number || 'Licence'}{l.licensee_name ? ` — ${l.licensee_name}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="s-ref">Related reference (optional)</Label>
                    <Input
                      id="s-ref" placeholder="Application, return or complaint reference"
                      value={form.reference_number}
                      onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="s-page">Where did it happen? (optional)</Label>
                    <Input
                      id="s-page" placeholder="e.g. /returns/new or 'Returns dashboard'"
                      value={form.page_path}
                      onChange={(e) => setForm((f) => ({ ...f, page_path: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="s-files" className="flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5" /> Screenshots or files (optional)
                    </Label>
                    <Input
                      id="s-files" type="file" multiple
                      onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ''; }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Up to {MAX_FILES} files, 10MB each.</p>
                  </div>
                </div>

                {files.length > 0 && (
                  <ul className="space-y-1">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                        <span className="truncate">{f.name} · {(f.size / 1024).toFixed(0)} KB</span>
                        <Button
                          type="button" variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => setFiles((list) => list.filter((_, idx) => idx !== i))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                <Button type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="open" className="pt-4 space-y-4">
          {openTickets.length === 0
            ? <p className="text-sm text-muted-foreground">You have no open support requests.</p>
            : openTickets.map(renderTicket)}
        </TabsContent>

        <TabsContent value="closed" className="pt-4 space-y-4">
          {closedTickets.length === 0
            ? <p className="text-sm text-muted-foreground">Nothing resolved yet.</p>
            : closedTickets.map(renderTicket)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
