/**
 * EPR-01 — Current Step control for the canonical return filing workspace.
 *
 * Follows the ExaminationWorkspace pattern: the browser never asks "what status
 * should this filing become?". It renders the server-supplied current step,
 * what has already been completed, what blocks progression and only the actions
 * the server says this officer may perform. The server remains authoritative —
 * hiding an action here is UX only.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/presentation/StatusBadge';
import { formatDateTime } from '@/lib/datetime';
import { CheckCircle2, Circle, AlertTriangle, ArrowRight } from 'lucide-react';
import type { FilingAvailableAction, FilingWorkflowState } from '@/hooks/useWaveC';

const VARIANT: Record<string, 'default' | 'outline' | 'destructive'> = {
  primary: 'default',
  outline: 'outline',
  destructive: 'destructive',
};

function Completed({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {done
        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className={done ? '' : 'text-muted-foreground'}>{label}</span>
    </li>
  );
}

export function FilingCurrentStepPanel({
  state, busy, onAction,
}: {
  state: FilingWorkflowState;
  busy?: boolean;
  onAction: (action: FilingAvailableAction) => void;
}) {
  const c = state.completed;
  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Current step — {state.stage_label}</CardTitle>
          <StatusBadge code={state.status} label={state.status_label} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Next required action</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-medium">
            <ArrowRight className="h-4 w-4 text-primary" />
            {state.next_action_label}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {state.priority_reason}
            {state.sla_due_at ? ` — service level due ${formatDateTime(state.sla_due_at)}` : ''}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Completed so far</p>
            <ul className="space-y-1.5">
              <Completed done={c.required_forms_complete} label="All required forms complete" />
              <Completed
                done={!!c.declaration_accepted_at}
                label={c.declaration_accepted_at ? `Filer declaration accepted ${formatDateTime(c.declaration_accepted_at)}` : 'Filer declaration accepted'}
              />
              <Completed
                done={!!c.submitted_at}
                label={c.submitted_at ? `Submitted ${formatDateTime(c.submitted_at)}` : 'Submitted to the regulator'}
              />
              <Completed
                done={state.status === 'UNDER_REVIEW' || !!c.accepted_at || !!c.rejected_at}
                label="Regulatory review started"
              />
              <Completed
                done={!!c.accepted_at || !!c.rejected_at}
                label={c.accepted_at ? `Accepted ${formatDateTime(c.accepted_at)}`
                  : c.rejected_at ? `Rejected ${formatDateTime(c.rejected_at)}`
                  : 'Regulatory decision recorded'}
              />
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Blocking conditions ({state.blockers.length})
            </p>
            {state.blockers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing is blocking progression at this step.
              </p>
            ) : (
              <ul className="space-y-2">
                {state.blockers.map((b) => (
                  <li key={b.code} className="flex items-start gap-2 text-sm">
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 shrink-0 ${b.severity === 'critical' ? 'text-destructive' : 'text-warning'}`}
                    />
                    <span>
                      <span className="font-medium">{b.label}</span>
                      <span className="block text-xs text-muted-foreground">{b.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Actions available to you</p>
          {state.available_actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no action at this step — the filing is
              {state.waiting_on === 'ENTITY' ? ' waiting on the regulated entity.' : ' closed or outside your authority.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {state.available_actions.map((a) => (
                <Button
                  key={a.code}
                  size="sm"
                  variant={VARIANT[a.variant] ?? 'outline'}
                  disabled={busy}
                  onClick={() => onAction(a)}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
