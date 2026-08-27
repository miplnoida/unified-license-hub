/**
 * P04 A.14 — appeals lodged against a specific licence decision.
 *
 * Appealability, the appeal window, one-live-appeal-per-decision and
 * maker/checker separation on determination are all enforced by
 * `license_decision_appeal_operation()`.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Gavel, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import {
  LicenseDecisionAppealRecord, useLicenseAppealableDecisions, useLicenseDecisionAppealOperation,
  useLicenseDecisionAppeals,
} from '@/hooks/useLicenseP04Extensions';

const STATUS_STYLES: Record<string, string> = {
  lodged: 'bg-warning/10 text-warning border-warning/20',
  under_review: 'bg-primary/10 text-primary border-primary/20',
  determined: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  withdrawn: 'bg-muted text-muted-foreground',
};

export default function LicenseDecisionAppealsPanel({ licenseId }: { licenseId: string }) {
  const { data: appeals, isLoading } = useLicenseDecisionAppeals(licenseId);
  const { data: appealable } = useLicenseAppealableDecisions(licenseId);
  const op = useLicenseDecisionAppealOperation(licenseId);

  const [lodgeOpen, setLodgeOpen] = useState(false);
  const [decisionId, setDecisionId] = useState('');
  const [grounds, setGrounds] = useState('');
  const [relief, setRelief] = useState('');

  const [determine, setDetermine] = useState<LicenseDecisionAppealRecord | null>(null);
  const [outcome, setOutcome] = useState('dismissed');
  const [rationale, setRationale] = useState('');

  const run = async (
    operation: 'lodge' | 'acknowledge' | 'determine' | 'withdraw',
    payload: Record<string, unknown>,
    ok: string,
  ) => {
    try {
      await op.mutateAsync({ operation, payload });
      toast.success(ok);
      setLodgeOpen(false); setGrounds(''); setRelief(''); setDecisionId('');
      setDetermine(null); setRationale('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The server refused this appeal step.');
    }
  };

  if (isLoading) {
    return <Card><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  const rows = appeals ?? [];
  const options = appealable ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gavel className="h-4 w-4 text-primary" />Appeals against licence decisions
        </CardTitle>
        <Button size="sm" variant="outline" disabled={options.length === 0} onClick={() => setLodgeOpen(true)}>
          Lodge appeal
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {options.length === 0 && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No appealable decision is currently within its appeal window for this licence.
          </p>
        )}

        {rows.map((r) => (
          <div key={r.appeal.id} className="rounded-md border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-sm font-medium text-primary">{r.appeal.appeal_reference}</p>
                <p className="text-xs text-muted-foreground">
                  Against {r.decision.decision_type} decision {r.decision.reference ?? ''} ·{' '}
                  {r.decision.decision} · decided {formatDateTime(r.decision.decided_at)} ·
                  deadline {formatDateOnly(r.appeal.appeal_deadline)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={STATUS_STYLES[r.appeal.status]}>
                  {r.appeal.status.replace(/_/g, ' ')}
                </Badge>
                {r.appeal.status === 'lodged' && (
                  <Button data-rbac="license_management.edit" size="sm" variant="outline" disabled={op.isPending}
                    onClick={() => run('acknowledge', { appeal_id: r.appeal.id }, 'Appeal acknowledged.')}>
                    Acknowledge
                  </Button>
                )}
                {['lodged', 'under_review'].includes(r.appeal.status) && (
                  <Button data-rbac="license_management.edit" size="sm" onClick={() => setDetermine(r)}>Determine</Button>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm"><span className="text-muted-foreground">Grounds: </span>{r.appeal.grounds}</p>
            {r.appeal.relief_sought && (
              <p className="mt-1 text-sm"><span className="text-muted-foreground">Relief sought: </span>{r.appeal.relief_sought}</p>
            )}
            {r.appeal.outcome && (
              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">Outcome: </span>{r.appeal.outcome} — {r.appeal.outcome_rationale}
              </p>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog open={lodgeOpen} onOpenChange={setLodgeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lodge appeal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Decision under appeal</Label>
              <Select value={decisionId} onValueChange={setDecisionId}>
                <SelectTrigger><SelectValue placeholder="Select a decision" /></SelectTrigger>
                <SelectContent>
                  {options.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.decision_type} · {d.decision} · {formatDateOnly(d.decided_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-grounds">Grounds of appeal</Label>
              <Textarea id="ap-grounds" rows={4} value={grounds} onChange={(e) => setGrounds(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-relief">Relief sought</Label>
              <Textarea id="ap-relief" rows={2} value={relief} onChange={(e) => setRelief(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLodgeOpen(false)}>Cancel</Button>
            <Button data-rbac="license_management.edit" disabled={op.isPending || !decisionId}
              onClick={() => run('lodge', { decision_id: decisionId, grounds, relief_sought: relief }, 'Appeal lodged.')}>
              {op.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lodge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!determine} onOpenChange={(o) => !o && setDetermine(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Determine appeal {determine?.appeal.appeal_reference}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upheld">Upheld</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                  <SelectItem value="varied">Varied</SelectItem>
                  <SelectItem value="remitted">Remitted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-rationale">Determination rationale</Label>
              <Textarea id="ap-rationale" rows={4} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetermine(null)}>Cancel</Button>
            <Button data-rbac="license_management.edit" disabled={op.isPending}
              onClick={() => determine && run('determine',
                { appeal_id: determine.appeal.id, outcome, rationale }, 'Appeal determined.')}>
              {op.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record determination
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
