/**
 * OS-02D — Monitoring row → supervisory action panel.
 *
 * Presentation only. The panel never decides what may be done: the action list,
 * the allowed/blocked state and the reason text all come from
 * `supervisory_monitoring_action_capabilities`, and the provenance list comes
 * from `supervisory_monitoring_provenance`. The two write paths call governed
 * commands that delegate to the canonical attention and reassessment contracts,
 * so nothing is created here and no monitoring object exists.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUpRight, Ban, CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useMonitoringActionCapabilities,
  useMonitoringProvenance,
  useRaiseSupervisoryAttention,
  useRequireReassessment,
  type MonitoringAction,
} from '@/hooks/useSupervisoryMonitoringActions';
import { formatDate, humanize } from '@/hooks/useSupervisoryMonitoring';

const MIN_NARRATIVE = 20;

export interface MonitoringActionPanelProps {
  entityId: string | null;
  entityName?: string | null;
  domainCode: string | null;
  entityRoute?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ActionRow({
  action, onRun, busy,
}: {
  action: MonitoringAction;
  onRun: (a: MonitoringAction) => void;
  busy: boolean;
}) {
  const navigate = useNavigate();
  const target = action.target;
  const canNavigate = action.kind !== 'COMMAND' && Boolean(target?.route);

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{action.label}</span>
            {action.allowed ? (
              <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                Available
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <Ban className="mr-1 h-3 w-3" aria-hidden />
                Not available
              </Badge>
            )}
          </div>
          {target?.reference ? (
            <div className="font-mono text-[11px] text-muted-foreground">
              {target.reference}
              {target.status ? ` · ${humanize(target.status)}` : ''}
              {target.stage ? ` · ${humanize(target.stage)}` : ''}
            </div>
          ) : null}
          {action.reason ? (
            <p className="text-xs text-muted-foreground">{action.reason}</p>
          ) : null}
          {action.allowed && action.requires ? (
            <p className="text-xs text-muted-foreground">{action.requires}</p>
          ) : null}
          {target?.note ? (
            <p className="text-[11px] text-muted-foreground">{target.note}</p>
          ) : null}
        </div>
        <div className="shrink-0">
          {action.kind === 'COMMAND' ? (
            <Button size="sm" data-rbac="supervisory_spine.workflow_action" disabled={!action.allowed || busy} onClick={() => onRun(action)}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : null}
              Record
            </Button>
          ) : canNavigate ? (
            <Button size="sm" variant="outline" onClick={() => navigate(target!.route!)}>
              <ArrowUpRight className="mr-1 h-4 w-4" aria-hidden />
              Open
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MonitoringActionPanel({
  entityId, entityName, domainCode, entityRoute, open, onOpenChange,
}: MonitoringActionPanelProps) {
  const navigate = useNavigate();
  const [narrative, setNarrative] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const caps = useMonitoringActionCapabilities(open ? entityId : null, open ? domainCode : null);
  const prov = useMonitoringProvenance(open ? entityId : null, open ? domainCode : null, open);
  const raiseAttention = useRaiseSupervisoryAttention();
  const requireReassessment = useRequireReassessment();

  const busy = raiseAttention.isPending || requireReassessment.isPending;

  const run = async (action: MonitoringAction) => {
    if (!entityId || !domainCode) return;
    const text = narrative.trim();
    if (text.length < MIN_NARRATIVE) {
      setPending(action.code);
      toast.error(`Record the supervisory reason first (at least ${MIN_NARRATIVE} characters).`);
      return;
    }
    const origin = (action.origin ?? {}) as Record<string, string | undefined>;
    try {
      if (action.code === 'RAISE_ATTENTION') {
        const res = await raiseAttention.mutateAsync({
          entityId, domainCode, supervisoryBasis: text,
          signalId: origin.signal_id ?? null,
          assessmentId: origin.assessment_id ?? null,
        });
        toast.success(res.deduplicated
          ? 'This condition was already open — the recurrence was recorded on the existing item.'
          : `Supervisory attention opened${res.reference ? ` (${res.reference})` : ''}.`);
        setNarrative('');
        if (res.route) navigate(res.route);
        onOpenChange(false);
        return;
      }
      if (action.code === 'REQUIRE_REASSESSMENT') {
        const res = await requireReassessment.mutateAsync({
          entityId, domainCode, triggerRationale: text,
          signalId: origin.signal_id ?? null,
        });
        toast.success(res.deduplicated
          ? 'A reassessment was already required for this condition; nothing was duplicated.'
          : 'Reassessment required. The recorded risk rating stays as it is until a new assessment is approved.');
        setNarrative('');
        return;
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const actions = caps.data?.actions ?? [];
  const commands = actions.filter((a) => a.kind === 'COMMAND');
  const gated = actions.filter((a) => a.kind === 'GATED');
  const navigations = actions.filter((a) => a.kind === 'NAVIGATE');
  const needsNarrative = commands.some((a) => a.allowed);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{entityName ?? 'Monitored entity'}</SheetTitle>
          <SheetDescription>
            {domainCode ? humanize(domainCode) : ''} — what can be done next, and why.
          </SheetDescription>
        </SheetHeader>

        {caps.isLoading ? (
          <Skeleton className="mt-6 h-64 w-full" />
        ) : caps.error ? (
          <p className="mt-6 text-sm text-destructive">{(caps.error as Error).message}</p>
        ) : caps.data && !caps.data.readable ? (
          <p className="mt-6 text-sm text-muted-foreground">{caps.data.reason}</p>
        ) : (
          <div className="mt-6 space-y-5">
            {caps.data?.lifecycle ? (
              <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                {caps.data.lifecycle}
              </p>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Record a supervisory step</h3>
              {needsNarrative ? (
                <div className="space-y-1">
                  <Label htmlFor="monitoring-narrative" className="text-xs">
                    Supervisory reason (recorded against the canonical record)
                  </Label>
                  <Textarea
                    id="monitoring-narrative"
                    rows={3}
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    placeholder="What was observed, why it matters and what is expected next."
                    aria-invalid={pending !== null && narrative.trim().length < MIN_NARRATIVE}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    At least {MIN_NARRATIVE} characters. This is stored on the supervisory record, not on the monitoring screen.
                  </p>
                </div>
              ) : null}
              {commands.map((a) => (
                <ActionRow key={a.code} action={a} onRun={run} busy={busy} />
              ))}
              {gated.map((a) => (
                <ActionRow key={a.code} action={a} onRun={run} busy={busy} />
              ))}
            </section>

            <Separator />

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Canonical records behind this row</h3>
              {navigations.map((a) => (
                <ActionRow key={a.code} action={a} onRun={run} busy={busy} />
              ))}
            </section>

            <Separator />

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Where each state comes from</h3>
              {prov.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !prov.data?.readable ? (
                <p className="text-xs text-muted-foreground">{prov.data?.reason}</p>
              ) : prov.data.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No canonical record exists yet for this entity in this supervisory area.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {prov.data.items.map((i, idx) => (
                    <li key={`${i.state}-${i.source_id ?? idx}`} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-success" aria-hidden />
                      <span className="min-w-0">
                        <span className="font-medium">{humanize(i.state)}</span>
                        {i.reference ? <span className="font-mono"> · {i.reference}</span> : null}
                        {i.value ? <span> · {humanize(i.value)}</span> : null}
                        {i.status ? <span> · {humanize(i.status)}</span> : null}
                        <span className="text-muted-foreground"> · {i.source_table}</span>
                        {i.as_of ? <span className="text-muted-foreground"> · {formatDate(i.as_of)}</span> : null}
                        {i.note ? <span className="block text-muted-foreground">{i.note}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {prov.data?.note ? (
                <p className="text-[11px] text-muted-foreground">{prov.data.note}</p>
              ) : null}
            </section>

            {entityRoute ? (
              <Button variant="outline" className="w-full" onClick={() => navigate(entityRoute)}>
                <ArrowUpRight className="mr-1 h-4 w-4" aria-hidden />
                Open the full entity record
              </Button>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
