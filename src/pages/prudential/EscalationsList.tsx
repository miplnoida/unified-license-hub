import { useState } from 'react';
import { useEscalations, useCreateEscalation, useUpdateEscalation, usePrudentialEntities } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';

const TYPES = ['senior_supervisor_review','enforcement_referral','board_level_concern','immediate_risk','cross_regulator'];

export default function EscalationsList() {
  const { data = [] } = useEscalations();
  const { data: entities = [] } = usePrudentialEntities();
  const create = useCreateEscalation();
  const update = useUpdateEscalation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ related_type: 'entity', escalation_type: 'senior_supervisor_review' });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prudential Escalations</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />New escalation</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New escalation</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Entity</Label>
                <Select value={form.entity_id || ''} onValueChange={(v) => setForm({ ...form, entity_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{entities.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Type</Label>
                <Select value={form.escalation_type} onValueChange={(v) => setForm({ ...form, escalation_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g,' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Reason / evidence</Label><Textarea value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button disabled={!form.entity_id} onClick={async () => { await create.mutateAsync(form); setOpen(false); setForm({ related_type: 'entity', escalation_type: 'senior_supervisor_review' }); }}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardHeader><CardTitle>Escalations ({data.length})</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow>
          <TableHead>Entity</TableHead><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Decision</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.map((es: any) => (
            <TableRow key={es.id}>
              <TableCell>{es.licensees?.name}</TableCell>
              <TableCell>{es.escalation_type}</TableCell>
              <TableCell className="max-w-md truncate">{es.reason}</TableCell>
              <TableCell><Badge variant="outline">{es.status}</Badge></TableCell>
              <TableCell>{es.decision || '—'}</TableCell>
              <TableCell className="space-x-2">
                {es.status === 'open' && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: es.id, patch: { status: 'under_review' } })}>Review</Button>}
                {['open','under_review'].includes(es.status) && (
                  <Button size="sm" onClick={() => {
                    const decision = prompt('Decision / outcome'); if (!decision) return;
                    update.mutate({ id: es.id, patch: { status: 'resolved', decision, outcome: decision } });
                  }}>Resolve</Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!data.length && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No escalations.</TableCell></TableRow>}
        </TableBody></Table>
      </CardContent></Card>
    </div>
  );
}
