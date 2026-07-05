import { useState } from 'react';
import { useEscalations, useUpdateEscalation } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { CreatePrudentialEscalationDialog } from '@/components/prudential/CreatePrudentialEscalationDialog';

export default function EscalationsList() {
  const { data = [] } = useEscalations();
  const update = useUpdateEscalation();
  const [createOpen, setCreateOpen] = useState(false);
  const [resolveFor, setResolveFor] = useState<string | null>(null);
  const [decision, setDecision] = useState('');
  const [outcome, setOutcome] = useState('');

  const submitResolve = async () => {
    if (!resolveFor) return;
    try {
      await update.mutateAsync({ id: resolveFor, patch: { status: 'resolved', decision, outcome } });
      setResolveFor(null); setDecision(''); setOutcome('');
    } catch { /* toast from hook */ }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prudential Escalations</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />New escalation</Button>
      </div>

      <Card><CardHeader><CardTitle>Escalations ({data.length})</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto">
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
                <TableCell className="max-w-xs truncate">{es.decision || '—'}</TableCell>
                <TableCell className="space-x-2">
                  {es.status === 'open' && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: es.id, patch: { status: 'under_review' } })}>Review</Button>}
                  {['open','under_review'].includes(es.status) && (
                    <Button size="sm" onClick={() => { setResolveFor(es.id); setDecision(''); setOutcome(''); }}>Resolve</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!data.length && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No escalations.</TableCell></TableRow>}
          </TableBody></Table>
        </div>
      </CardContent></Card>

      <CreatePrudentialEscalationDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={!!resolveFor} onOpenChange={(o) => !o && setResolveFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve escalation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Decision <span className="text-destructive">*</span></Label>
              <Textarea rows={3} value={decision} onChange={(e) => setDecision(e.target.value)} /></div>
            <div><Label>Outcome <span className="text-destructive">*</span></Label>
              <Textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveFor(null)}>Back</Button>
            <Button disabled={!decision.trim() || !outcome.trim()} onClick={submitResolve}>Confirm resolution</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
