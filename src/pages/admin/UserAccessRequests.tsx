/**
 * Regulator queue for entity portal-user access requests and Primary User
 * changes. Review (maker) and decision (checker, different officer) are
 * enforced by the database commands.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateOnly } from '@/lib/datetime';
import {
  AccessRequest, REQUEST_TYPE_LABEL, STATUS_LABEL, listAccessRequests, openAccessFile, reviewAccessRequest, decideAccessRequest,
} from '@/lib/entityAccessRequests';

export default function UserAccessRequests() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState('open');
  const [active, setActive] = useState<AccessRequest | null>(null);

  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ['admin-access-requests'], queryFn: () => listAccessRequests() });
  const { data: names = {} } = useQuery({
    queryKey: ['admin-access-requests-names', rows.map((r) => r.entity_id).join(',')],
    enabled: rows.length > 0,
    queryFn: async () => {
      const ids = [...new Set(rows.map((r) => r.entity_id))];
      const { data } = await supabase.from('licensees').select('id,name').in('id', ids);
      return Object.fromEntries((data ?? []).map((l: any) => [l.id, l.name])) as Record<string, string>;
    },
  });

  const filtered = useMemo(() => rows.filter((r) =>
    tab === 'open' ? ['SUBMITTED', 'UNDER_REVIEW'].includes(r.status) : !['SUBMITTED', 'UNDER_REVIEW'].includes(r.status)), [rows, tab]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Entity User Access Requests" description="Institution requests to add, change or remove portal users, and Primary User changes" />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList><TabsTrigger value="open">Open</TabsTrigger><TabsTrigger value="closed">Decided</TabsTrigger></TabsList>
        </Tabs>
        <Card><CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Reference</TableHead><TableHead>Institution</TableHead><TableHead>Request</TableHead>
              <TableHead>User</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-destructive">{(error as Error).message}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No requests</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                  <TableCell>{names[r.entity_id] ?? '—'}</TableCell>
                  <TableCell>{REQUEST_TYPE_LABEL[r.request_type]}</TableCell>
                  <TableCell>{r.subject_full_name || '—'}<div className="text-xs text-muted-foreground">{r.subject_email}</div></TableCell>
                  <TableCell><Badge variant={r.status.startsWith('APPROVED') ? 'approved' : 'outline'}>{STATUS_LABEL[r.status] ?? r.status}</Badge></TableCell>
                  <TableCell>{formatDateOnly(r.submitted_at)}</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setActive(r)}>Open</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
      {active && (
        <DecisionDialog req={active} entityName={names[active.entity_id]} userId={user?.id}
          onClose={() => setActive(null)} onDone={() => { setActive(null); qc.invalidateQueries({ queryKey: ['admin-access-requests'] }); }} />
      )}
    </DashboardLayout>
  );
}

function DecisionDialog({ req, entityName, userId, onClose, onDone }: {
  req: AccessRequest; entityName?: string; userId?: string; onClose: () => void; onDone: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const canReview = req.status === 'SUBMITTED';
  const canDecide = req.status === 'UNDER_REVIEW' && req.reviewed_by !== userId;

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    if (!notes.trim()) return toast.error('Notes are required');
    setBusy(true);
    try { const res = await fn(); toast.success(typeof res === 'string' ? `${msg}: ${STATUS_LABEL[res] ?? res}` : msg); onDone(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const row = (k: string, v?: string | null) => (
    <div className="grid grid-cols-3 gap-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="col-span-2">{v || '—'}</span></div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{req.reference} · {REQUEST_TYPE_LABEL[req.request_type]}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {row('Institution', entityName)}
          {row('Status', STATUS_LABEL[req.status] ?? req.status)}
          {row('User', [req.subject_full_name, req.subject_email].filter(Boolean).join(' · '))}
          {row('Position', req.subject_position)}
          {row('Effective date', req.effective_date ? formatDateOnly(req.effective_date) : null)}
          {row('Reason', req.reason)}
          {req.review_notes && row(`Review (${req.review_recommendation})`, req.review_notes)}
          {req.decision_notes && row('Decision', req.decision_notes)}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => openAccessFile(req.letter_path).catch((e) => toast.error(e.message))}><FileText className="mr-1 h-4 w-4" />Authorisation letter</Button>
            {req.supporting_paths.map((p, i) => (
              <Button key={p} size="sm" variant="ghost" onClick={() => openAccessFile(p).catch((e) => toast.error(e.message))}>Document {i + 1}</Button>
            ))}
          </div>
          {req.status === 'UNDER_REVIEW' && req.reviewed_by === userId && (
            <p className="text-xs text-muted-foreground">You reviewed this request; a different officer must make the final decision.</p>
          )}
          {(canReview || canDecide) && (
            <div className="pt-2"><Label>{canReview ? 'Review notes' : 'Decision notes'}</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          {canReview && <>
            <Button variant="outline" disabled={busy} onClick={() => run(() => reviewAccessRequest(req.id, 'REJECT', notes), 'Recommended rejection')}>Recommend reject</Button>
            <Button disabled={busy} onClick={() => run(() => reviewAccessRequest(req.id, 'APPROVE', notes), 'Recommended approval')}>Recommend approve</Button>
          </>}
          {canDecide && <>
            <Button variant="destructive" disabled={busy} onClick={() => run(() => decideAccessRequest(req.id, false, notes), 'Decision recorded')}>Reject</Button>
            <Button disabled={busy} onClick={() => run(() => decideAccessRequest(req.id, true, notes), 'Decision recorded')}>Approve</Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
