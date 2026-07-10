import { useState } from 'react';
import { useActions, useUpdateAction, useMarkOverdue } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
import { CreatePrudentialActionDialog } from '@/components/prudential/CreatePrudentialActionDialog';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

type CloseKind = 'completed' | 'waived' | 'cancelled';

export default function ActionsList() {
  const { data = [] } = useActions();
  const update = useUpdateAction();
  const overdue = useMarkOverdue();
  const [createOpen, setCreateOpen] = useState(false);
  const [closeFor, setCloseFor] = useState<{ id: string; kind: CloseKind } | null>(null);
  const [note, setNote] = useState('');

  const submitClose = async () => {
    if (!closeFor || update.isPending) return;
    const patch = { status: closeFor.kind } as any;
    const payload: any = { id: closeFor.id, patch };
    if (closeFor.kind === 'completed') payload.completion_notes = note;
    if (closeFor.kind === 'waived') payload.waiver_reason = note;
    if (closeFor.kind === 'cancelled') payload.cancellation_reason = note;
    try {
      await update.mutateAsync(payload);
      setCloseFor(null); setNote('');
    } catch { /* toast handled in hook */ }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prudential Actions</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={overdue.isPending} onClick={() => overdue.mutate()}>
            {overdue.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {overdue.isPending ? 'Sweeping…' : 'Sweep overdue'}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />New action</Button>
        </div>
      </div>

      <Card><CardHeader><CardTitle>Actions ({data.length})</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto">
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
                      <Button size="sm" variant="outline" onClick={() => { setCloseFor({ id: a.id, kind: 'completed' }); setNote(''); }}>Complete</Button>
                      <Button size="sm" variant="outline" onClick={() => { setCloseFor({ id: a.id, kind: 'waived' }); setNote(''); }}>Waive</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setCloseFor({ id: a.id, kind: 'cancelled' }); setNote(''); }}>Cancel</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!data.length && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No actions.</TableCell></TableRow>}
          </TableBody></Table>
        </div>
      </CardContent></Card>

      <CreatePrudentialActionDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={!!closeFor} onOpenChange={(o) => !o && setCloseFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{closeFor?.kind === 'completed' ? 'Complete action' : closeFor?.kind === 'waived' ? 'Waive action' : 'Cancel action'}</DialogTitle></DialogHeader>
          <div>
            <Label>{closeFor?.kind === 'completed' ? 'Completion notes' : closeFor?.kind === 'waived' ? 'Waiver justification' : 'Cancellation reason'} <span className="text-destructive">*</span></Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={update.isPending} onClick={() => setCloseFor(null)}>Back</Button>
            <Button disabled={!note.trim() || note.trim().length < 5 || update.isPending} onClick={submitClose}>
              {update.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
}
