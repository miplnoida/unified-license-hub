/**
 * P04 A.18 — licence verification cases.
 *
 * The checklist is a snapshot of the configured template taken at start, so a
 * later configuration change cannot rewrite a completed verification. Item
 * results and completion are validated by `license_verification_operation()`.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, ClipboardCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';
import {
  LicenseVerificationItem, useLicenseVerificationCases, useLicenseVerificationOperation,
} from '@/hooks/useLicenseP04Extensions';

const MATTER_KINDS = ['renewal', 'variation', 'reinstatement', 'surrender'];

const RESULT_STYLES: Record<string, string> = {
  satisfied: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  not_satisfied: 'bg-destructive/10 text-destructive border-destructive/20',
  not_applicable: 'bg-muted text-muted-foreground',
};

export default function LicenseVerificationPanel({ licenseId }: { licenseId: string }) {
  const { data, isLoading } = useLicenseVerificationCases(licenseId);
  const op = useLicenseVerificationOperation(licenseId);
  const [startOpen, setStartOpen] = useState(false);
  const [matterKind, setMatterKind] = useState('renewal');
  const [item, setItem] = useState<LicenseVerificationItem | null>(null);
  const [result, setResult] = useState('satisfied');
  const [note, setNote] = useState('');

  const run = async (operation: 'start' | 'record_item' | 'complete', payload: Record<string, unknown>, ok: string) => {
    try {
      await op.mutateAsync({ operation, payload });
      toast.success(ok);
      setStartOpen(false);
      setItem(null);
      setNote('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The server refused this verification step.');
    }
  };

  if (isLoading) {
    return <Card><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  const cases = data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-primary" />Verification
        </CardTitle>
        <Button data-rbac="license_management.edit" size="sm" variant="outline" onClick={() => setStartOpen(true)}>Start verification</Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {cases.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No verification case has been opened for this licence.
          </p>
        )}

        {cases.map((c) => {
          const outstanding = c.items.filter((i) => i.required && !i.result).length;
          return (
            <div key={c.case.id} className="rounded-md border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {c.case.matter_kind ?? 'Verification'} · started {formatDateTime(c.case.started_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.case.status === 'completed'
                      ? `Completed ${formatDateTime(c.case.completed_at)} — ${c.case.outcome}`
                      : `${outstanding} required item(s) outstanding`}
                  </p>
                </div>
                {c.case.status === 'in_progress' && (
                  <Button data-rbac="license_management.edit" size="sm" disabled={op.isPending}
                    onClick={() => run('complete', { case_id: c.case.id }, 'Verification case completed.')}>
                    <CheckCircle2 className="mr-1 h-4 w-4" />Complete
                  </Button>
                )}
              </div>
              <ul className="divide-y">
                {c.items.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <div>
                      <p className="text-sm">{i.label}{i.required && <span className="text-destructive"> *</span>}</p>
                      {i.note && <p className="text-xs text-muted-foreground">{i.note}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {i.result
                        ? <Badge variant="outline" className={RESULT_STYLES[i.result]}>{i.result.replace('_', ' ')}</Badge>
                        : <span className="text-xs text-muted-foreground">not recorded</span>}
                      {c.case.status === 'in_progress' && (
                        <Button data-rbac="license_management.edit" size="sm" variant="ghost" onClick={() => { setItem(i); setResult(i.result ?? 'satisfied'); setNote(i.note ?? ''); }}>
                          Record
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start verification</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Matter kind</Label>
            <Select value={matterKind} onValueChange={setMatterKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATTER_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The checklist is resolved from the configured template for this licence and matter kind.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button data-rbac="license_management.edit" disabled={op.isPending}
              onClick={() => run('start', { license_id: licenseId, matter_kind: matterKind }, 'Verification case opened.')}>
              {op.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!item} onOpenChange={(o) => !o && setItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{item?.label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Result</Label>
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="satisfied">Satisfied</SelectItem>
                  <SelectItem value="not_satisfied">Not satisfied</SelectItem>
                  <SelectItem value="not_applicable">Not applicable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="verif-note">Note</Label>
              <Input id="verif-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItem(null)}>Cancel</Button>
            <Button data-rbac="license_management.edit" disabled={op.isPending}
              onClick={() => item && run('record_item', { item_id: item.id, result, note }, 'Verification item recorded.')}>
              {op.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
