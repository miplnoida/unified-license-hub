/**
 * Closure readiness and finding lifecycle.
 *
 * Readiness is computed from EVERY required corrective action, mirroring the
 * database guards; blockers are always named on screen rather than hidden in a
 * failed toast. The database remains the final authority — this panel only
 * refuses to offer an action the platform would reject.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  closureReadiness, useFindingLifecycle, type SupervisoryFindingModel,
} from '@/hooks/useSupervisoryFinding';
import { AMBER, EMERALD, RED, titleCase } from '@/lib/amlLabels';

/** Mirrors the governed transition table in `supervisory_finding_lifecycle`. */
const NEXT_STATUSES: Record<string, string[]> = {
  DRAFT: ['REVIEW', 'WITHDRAWN'],
  REVIEW: ['ISSUED', 'DRAFT', 'WITHDRAWN'],
  ISSUED: ['MANAGEMENT_RESPONSE', 'REMEDIATION_REQUIRED', 'WITHDRAWN', 'SUPERSEDED'],
  MANAGEMENT_RESPONSE: ['REMEDIATION_REQUIRED', 'CLOSED', 'WITHDRAWN'],
  REMEDIATION_REQUIRED: ['VALIDATION', 'CLOSED'],
  VALIDATION: ['CLOSED', 'REMEDIATION_REQUIRED'],
  REOPENED: ['REMEDIATION_REQUIRED', 'VALIDATION'],
};

const LABEL: Record<string, string> = {
  REVIEW: 'Send for review',
  ISSUED: 'Issue to the entity',
  DRAFT: 'Return to draft',
  MANAGEMENT_RESPONSE: 'Await management response',
  REMEDIATION_REQUIRED: 'Require remediation',
  VALIDATION: 'Move to validation',
  CLOSED: 'Close finding',
  WITHDRAWN: 'Withdraw finding',
  SUPERSEDED: 'Supersede finding',
};

export function FindingClosurePanel({ model, canManage }: { model: SupervisoryFindingModel; canManage: boolean }) {
  const findingId = model.finding.id as string;
  const status = String(model.finding.status ?? '').toUpperCase();
  const lifecycle = useFindingLifecycle(findingId);
  const readiness = closureReadiness(model);

  const [target, setTarget] = useState<string | null>(null);
  const [rationale, setRationale] = useState('');

  const options = (NEXT_STATUSES[status] ?? []).filter((s) => s !== 'CLOSED' || readiness.eligible);

  const submit = async () => {
    if (!target) return;
    try {
      await lifecycle.mutateAsync({ toStatus: target, rationale });
      toast.success(`Finding moved to ${titleCase(target)}`);
      setTarget(null); setRationale('');
    } catch (e: any) {
      toast.error(e?.message ?? 'The platform refused this transition');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Closure readiness</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm">
          {readiness.checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              {c.ok
                ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
              <span>
                {c.label}
                {c.detail ? <span className="block text-xs text-muted-foreground">{c.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>

        {['CLOSED', 'WITHDRAWN', 'SUPERSEDED'].includes(status) ? (
          <Badge variant="outline" className={EMERALD}>{titleCase(status)}</Badge>
        ) : readiness.eligible ? (
          <Badge variant="outline" className={EMERALD}>This finding may now be closed</Badge>
        ) : (
          <div className={`rounded-md border p-3 text-sm ${AMBER}`}>
            <p className="font-semibold">Cannot close finding</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {readiness.blockers.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        )}

        {canManage && options.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {options.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'CLOSED' ? 'default' : s === 'WITHDRAWN' || s === 'SUPERSEDED' ? 'outline' : 'secondary'}
                onClick={() => { setTarget(s); setRationale(''); }}
              >
                {s === 'WITHDRAWN' || s === 'SUPERSEDED' ? <X className="mr-1.5 h-3.5 w-3.5" /> : null}
                {LABEL[s] ?? titleCase(s)}
              </Button>
            ))}
          </div>
        ) : null}

        {!readiness.eligible && canManage && (NEXT_STATUSES[status] ?? []).includes('CLOSED') ? (
          <p className={`rounded-md border p-2 text-xs ${RED}`}>
            Close finding is unavailable until the outstanding conditions above are satisfied.
          </p>
        ) : null}

        <Dialog open={!!target} onOpenChange={(o) => (o ? null : setTarget(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{target ? LABEL[target] ?? titleCase(target) : ''}</DialogTitle>
              <DialogDescription>
                Regulatory history is preserved: findings are withdrawn, superseded, closed or reopened — never deleted.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label>Decision rationale</Label>
              <Textarea rows={4} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                At least 10 characters are required for issue, closure, withdrawal, supersession and reopening.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
              <Button disabled={rationale.trim().length < 10 || lifecycle.isPending} onClick={submit}>Record decision</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
