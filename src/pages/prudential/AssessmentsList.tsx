import { useState } from 'react';
import { useAssessments, useUpsertAssessment, usePrudentialEntities } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function AssessmentsList() {
  const [params] = useSearchParams();
  const entityFilter = params.get('entity') || undefined;
  const returnParam = params.get('return') || undefined;
  const { data = [] } = useAssessments(entityFilter ? { entity_id: entityFilter } : undefined);
  const { data: entities = [] } = usePrudentialEntities();
  const upsert = useUpsertAssessment();
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState(entityFilter || '');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [returnId, setReturnId] = useState(returnParam || '');

  return (
    <DashboardLayout>
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Supervisory Assessments</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />New assessment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New assessment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Entity</Label>
                <Select value={entityId} onValueChange={setEntityId}>
                  <SelectTrigger><SelectValue placeholder="Choose entity" /></SelectTrigger>
                  <SelectContent>{entities.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Period start</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
                <div><Label>Period end</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
              </div>
              <div><Label>Linked return id (optional)</Label>
                <Input value={returnId} onChange={(e) => setReturnId(e.target.value)} placeholder="Prefills signals from this return" /></div>
            </div>
            <DialogFooter>
              <Button disabled={!entityId || upsert.isPending} onClick={async () => {
                if (upsert.isPending) return;
                try {
                  const r = await upsert.mutateAsync({ entity_id: entityId, return_id: returnId || null, period_start: periodStart || null, period_end: periodEnd || null, status: 'draft' } as any);
                  setOpen(false);
                  if (r?.id) window.location.href = `/prudential/assessments/${r.id}`;
                } catch { /* toast from hook */ }
              }}>
                {upsert.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>) : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardHeader><CardTitle>Assessments ({data.length})</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow>
          <TableHead>Entity</TableHead><TableHead>Period</TableHead><TableHead>Rating</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.map((a: any) => (
            <TableRow key={a.id}>
              <TableCell>{a.licensees?.name || a.entity_id.slice(0,8)}</TableCell>
              <TableCell>{a.period_start} → {a.period_end}</TableCell>
              <TableCell><Badge>{a.overall_rating || '—'}</Badge></TableCell>
              <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
              <TableCell>{new Date(a.updated_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right"><Link className="text-primary underline" to={`/prudential/assessments/${a.id}`}>Open</Link></TableCell>
            </TableRow>
          ))}
          {!data.length && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No assessments.</TableCell></TableRow>}
        </TableBody></Table>
      </CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
