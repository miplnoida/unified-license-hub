/**
 * EPR-05 — Current Step summary for a licensing case.
 *
 * The Current Step tab is the only lifecycle controller for P03. This card
 * states, from the server read model, which stage the case is at, what must
 * happen next, and what blocks it. The governed action panels are rendered
 * underneath by the case workspace.
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/datetime';
import { useApplicationCase, type ApplicationCaseModel } from '@/hooks/useApplicationCaseModels';

interface Props {
  applicationId: string;
  audience?: 'internal' | 'external';
  caseModel?: ApplicationCaseModel | null;
}

export function ApplicationCurrentStepSummary({ applicationId, audience = 'internal', caseModel }: Props) {
  const { data } = useApplicationCase(caseModel ? null : applicationId, audience);
  const c = caseModel ?? data;
  if (!c) return null;

  const blockers = c.blockers ?? [];
  const gates = (c.decision_gates ?? {}) as { blocking?: unknown[]; ready?: boolean };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Current step
          <Badge variant="outline">{c.stage_label}</Badge>
          {c.workflow?.current_step_name ? (
            <Badge variant="secondary">{c.workflow.current_step_name}</Badge>
          ) : null}
          {c.sla_due_at ? (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Clock className="h-3 w-3" />Due {formatDateTime(c.sla_due_at)}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Next required action: </span>
          <span className="font-medium">{c.next_action?.label ?? 'No action required'}</span>
          {c.next_action?.href ? (
            <Link to={c.next_action.href} className="ml-2 inline-flex items-center gap-1 underline hover:no-underline">
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>

        {blockers.length > 0 ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
            <div className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Prerequisites outstanding ({blockers.length})
            </div>
            <ul className="mt-1 space-y-1 pl-5">
              {blockers.map((b) => (
                <li key={b.code} className="list-disc text-muted-foreground">
                  {b.href ? (
                    <Link
                      to={`${b.href}${b.href.includes('?') ? '&' : '?'}from=current`}
                      className="underline hover:no-underline"
                    >
                      {b.label}
                    </Link>
                  ) : b.label}
                  {b.detail ? <span className="ml-1 text-xs">— {b.detail}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            No outstanding prerequisites for this step.
          </div>
        )}

        <div className="grid gap-3 border-t pt-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sufficiency</div>
            <div className="font-medium">{c.sufficiency?.status ?? 'Not evaluated'}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Open information requests</div>
            <div className="font-medium">{c.open_rfi_count ?? 0}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Decision gates</div>
            <div className="font-medium">
              {Array.isArray(gates.blocking) && gates.blocking.length > 0
                ? `${gates.blocking.length} unmet`
                : gates.ready === false ? 'Not ready' : 'Clear'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ApplicationCurrentStepSummary;
