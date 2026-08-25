/**
 * Internal support queue (/admin/support).
 *
 * Staff triage, assign, respond to and resolve applicant / licensee technical
 * support requests raised in the external Help & Support centre.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { LifeBuoy } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  requester_name: string | null;
  requester_email: string | null;
  assigned_to: string | null;
  resolution_notes: string | null;
  created_at: string;
};

type Message = { id: string; ticket_id: string; body: string; is_internal: boolean; created_at: string };

const STATUSES = ['open', 'in_progress', 'awaiting_user', 'resolved', 'closed'];
const STATUS_TONE: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  awaiting_user: 'bg-purple-100 text-purple-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-muted text-muted-foreground',
};

export default function SupportQueue() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [resolution, setResolution] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) { toast.error(error.message); return; }
    setTickets((data || []) as Ticket[]);
  };

  useEffect(() => { load(); }, []);

  const loadMessages = async (id: string) => {
    const { data } = await supabase
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at');
    setMessages((m) => ({ ...m, [id]: (data || []) as Message[] }));
  };

  const patch = async (id: string, values: Record<string, unknown>) => {
    const { error } = await supabase.from('support_tickets').update(values).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Ticket updated');
    load();
  };

  const send = async (id: string) => {
    if (!user || reply.trim().length < 2) return;
    const { error } = await supabase
      .from('support_ticket_messages')
      .insert({ ticket_id: id, author_id: user.id, body: reply.trim(), is_internal: internalNote });
    if (error) { toast.error(error.message); return; }
    setReply('');
    loadMessages(id);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) =>
      [t.ticket_number, t.subject, t.requester_email, t.requester_name]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [tickets, search]);

  const buckets = {
    active: filtered.filter((t) => ['open', 'in_progress', 'awaiting_user'].includes(t.status)),
    resolved: filtered.filter((t) => t.status === 'resolved'),
    closed: filtered.filter((t) => t.status === 'closed'),
  };

  const renderTicket = (t: Ticket) => (
    <Card key={t.id}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t.subject}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-mono">{t.ticket_number}</span> · {t.requester_name || 'Unknown'} ({t.requester_email || 'no email'}) · {formatDateTime(t.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{t.category}</Badge>
            <Badge variant="outline">{t.priority}</Badge>
            <Badge className={STATUS_TONE[t.status] || ''}>{t.status.replace(/_/g, ' ')}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm whitespace-pre-wrap">{t.description}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={t.status} onValueChange={(v) => patch(t.id, {
            status: v,
            resolved_at: v === 'resolved' ? new Date().toISOString() : null,
            closed_at: v === 'closed' ? new Date().toISOString() : null,
          })}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          {!t.assigned_to && (
            <Button variant="outline" size="sm" onClick={() => patch(t.id, { assigned_to: user?.id })}>Assign to me</Button>
          )}
          {t.assigned_to === user?.id && (
            <Button variant="ghost" size="sm" onClick={() => patch(t.id, { assigned_to: null })}>Unassign</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => {
            const next = openId === t.id ? null : t.id;
            setOpenId(next);
            setResolution(t.resolution_notes || '');
            if (next) loadMessages(next);
          }}>
            {openId === t.id ? 'Close panel' : 'Work ticket'}
          </Button>
        </div>

        {openId === t.id && (
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              {(messages[t.id] || []).map((m) => (
                <div key={m.id} className={`rounded-md border p-2 text-sm ${m.is_internal ? 'bg-amber-50 border-amber-200' : ''}`}>
                  <p className="text-[11px] text-muted-foreground mb-1">
                    {formatDateTime(m.created_at)}{m.is_internal ? ' · internal note' : ''}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
              {(messages[t.id] || []).length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
            </div>

            <div className="space-y-2">
              <Textarea rows={3} placeholder="Reply to the requester…" value={reply} onChange={(e) => setReply(e.target.value)} />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={internalNote} onCheckedChange={(v) => setInternalNote(!!v)} />
                  Internal note (not visible to the requester)
                </label>
                <Button size="sm" onClick={() => send(t.id)}>Send</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Resolution summary</Label>
              <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
              <Button size="sm" variant="outline" onClick={() => patch(t.id, { resolution_notes: resolution })}>
                Save resolution
              </Button>
            </div>
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
          <h1 className="text-2xl font-semibold">Support queue</h1>
          <p className="text-sm text-muted-foreground">Technical help requests raised by applicants and licensees.</p>
        </div>
      </div>

      <Input className="max-w-md" placeholder="Search reference, subject or requester…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({buckets.active.length})</TabsTrigger>
          <TabsTrigger value="resolved">Resolved ({buckets.resolved.length})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({buckets.closed.length})</TabsTrigger>
        </TabsList>
        {(['active', 'resolved', 'closed'] as const).map((k) => (
          <TabsContent key={k} value={k} className="pt-4 space-y-4">
            {buckets[k].length === 0
              ? <p className="text-sm text-muted-foreground">No tickets in this bucket.</p>
              : buckets[k].map(renderTicket)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
