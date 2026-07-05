import { useState } from 'react';
import { useActions, useCreateAction, useUpdateAction, useMarkOverdue, usePrudentialEntities } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, RefreshCw } from 'lucide-react';

const TYPES = ['information_request','capital_plan','liquidity_plan','board_letter','onsite_inspection','enforcement_referral','restriction','monitoring'];

export default function ActionsList() {
  const { data = [] } = useActions();
  const { data: entities = [] } = usePrudentialEntities();
  const create = useCreateAction();
  const update = useUpdateAction();
  const overdue = useMarkOverdue();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ severity: 'medium', action_type: 'information_request', source_type: 'manual' });
  const [waiverFor, setWaiverFor] = useState<string | null>(null);
  const [waiverReason, setWaiverReason] = useState('');

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prudential Actions</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => overdue.mutate()}><RefreshCw className="h-4 w-4 mr-2" />Sweep overdue</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />New action</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New action</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Entity</Label>
                  <Select value={form.entity_id || ''} onValueChange={(v) => setForm({ ...form, entity_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{entities.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Title</Label><Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Type</Label>
                    <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g,' ')}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Severity</Label>
                    <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{['low','medium','high','critical'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Due date</Label><Input type="date" value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button disabled={!form.entity_id || !form.title} onClick={async () => { await create.mutateAsync(form); setOpen(false); setForm({ severity: 'medium', action_type: 'information_request', source_type: 'manual' }); }}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card><CardHeader><CardTitle>Actions ({data.length})</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow>
          <TableHead>Entity</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.map((a: any) => (
            <TableRow key={a.id}>
              <TableCell>{a.licensees?.name}</TableCell>
              <TableCell>{a.title}</TableCell>
              <TableCell>{a.action_type}</TableCell>
              <TableCell><Badge>{a.severity}</Badge></TableCell>
              <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
              <TableCell>{a.due_date || '—'}</TableCell>
              <TableCell className="space-x-2">
                {['open','in_progress','overdue'].includes(a.status) && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => update.mutate({ id: a.id, patch: { status: 'completed' } })}>Complete</Button>
                    <Button size="sm" variant="outline" onClick={() => { setWaiverFor(a.id); setWaiverReason(''); }}>Waive</Button>
                    <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: a.id, patch: { status: 'cancelled' } })}>Cancel</Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!data.length && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No actions.</TableCell></TableRow>}
        </TableBody></Table>
      </CardContent></Card>

      <Dialog open={!!waiverFor} onOpenChange={(o) => !o && setWaiverFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Waive action</DialogTitle></DialogHeader>
          <div><Label>Justification (required)</Label><Textarea value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)} /></div>
          <DialogFooter>
            <Button disabled={!waiverReason.trim()} onClick={async () => { await update.mutateAsync({ id: waiverFor!, patch: { status: 'waived' }, waiver_reason: waiverReason }); setWaiverFor(null); }}>Waive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
