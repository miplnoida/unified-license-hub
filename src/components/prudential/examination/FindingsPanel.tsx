/**
 * Findings and remediation on the examination workspace.
 *
 * Findings are raised from examination fieldwork only: the officer selects the
 * workpaper that evidences the deficiency and the canonical governed operation
 * records the finding with its full provenance. The panel therefore never
 * inserts a finding from the browser, and it lists the canonical supervisory
 * register (`supervisory_finding`) rather than a local copy. Historical
 * pre-spine records in `examination_findings` remain visible, clearly labelled,
 * so their corrective actions can still be worked and closed.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, ExternalLink, Loader2, Plus,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  useCreateRemediationAction,
  useExamination,
  useExaminationCanonicalFindings,
  useExaminationFindings,
  useExaminationScopeDimensions,
  useFindingMutations,
  useWorkpapers,
} from '@/hooks/useExaminations';
import { useCloseActionGated } from '@/hooks/usePrudentialActionLifecycle';
import { RaiseFindingDialog } from './RaiseFindingDialog';
import { StageActions, type StageActionsMode } from './ExaminationStageActions';
import { engagementPhrasing } from '@/lib/supervisoryEngagement';
import { useExaminationEngagement } from '@/hooks/useExaminationEngagement';


const CLOSED_ACTION_STATUSES = ['completed', 'waived', 'cancelled'];
const isActionClosed = (s: any) => CLOSED_ACTION_STATUSES.includes(String(s));
const actionStatusLabel = (s: any) => {
  const v = String(s);
  return v === 'completed' ? 'Completed'
    : v === 'waived' ? 'Waived'
      : v === 'cancelled' ? 'Cancelled'
        : v === 'in_progress' ? 'In progress'
          : v === 'overdue' ? 'Overdue'
            : v === 'breached' ? 'Breached'
              : 'Open';
};
const actionTone = (s: any) =>
  isActionClosed(s) ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200'
    : ['overdue', 'breached'].includes(String(s)) ? 'bg-destructive/10 text-destructive border-destructive/20'
      : 'bg-warning/10 text-warning border-warning/20';

const sevTone = (s: any) => {
  const v = String(s ?? '').toLowerCase();
  return v === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/20'
    : v === 'high' ? 'bg-warning/10 text-warning border-warning/20'
      : v === 'medium' ? 'bg-primary/10 text-primary border-primary/20'
        : 'bg-muted text-muted-foreground';
};

const humanise = (v: any) =>
  String(v ?? '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());

const isClosedFinding = (s: any) => ['closed', 'CLOSED', 'superseded', 'SUPERSEDED'].includes(String(s));

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="text-xs space-y-0.5">{children}</div>
    </div>
  );
}

export function FindingsPanel({ examinationId, readOnly, mode = 'supporting' }: { examinationId: string; readOnly?: boolean; mode?: StageActionsMode }) {
  const { data: exam } = useExamination(examinationId);
  const engagement = useExaminationEngagement(examinationId);
  const { data: canonical = [], isLoading } = useExaminationCanonicalFindings(examinationId);
  const { data: legacy = [] } = useExaminationFindings(examinationId);
  const { data: workpapers = [] } = useWorkpapers(examinationId);
  const { data: scopeDimensions = [] } = useExaminationScopeDimensions(examinationId);
  const { save } = useFindingMutations(examinationId);
  const createAction = useCreateRemediationAction(examinationId);
  const closeAction = useCloseActionGated();
  const qc = useQueryClient();

  const [raiseFrom, setRaiseFrom] = useState<any | null>(null);

  /** Fieldwork that can evidence a finding: any workpaper recorded on this examination. */
  const eligibleWorkpapers = useMemo(
    () => (workpapers as any[]).filter(w => !!w.id),
    [workpapers],
  );

  const openCount = canonical.filter(f => !isClosedFinding(f.status)).length;
  const withoutAction = canonical.filter(f => !isClosedFinding(f.status) && f.remediation.length === 0);

  const closeLegacyFinding = async (r: any) => {
    const hasOpenAction = r.action && !isActionClosed(r.action.status);
    const res = await Swal.fire({
      title: 'Close this finding?',
      text: hasOpenAction
        ? 'The linked corrective action will be completed at the same time. Add a short closure note.'
        : 'Add a short closure note for the record.',
      input: 'textarea',
      inputPlaceholder: 'Why is this finding being closed?',
      inputValidator: (v) => (!v || v.trim().length < 5 ? 'Please enter at least 5 characters' : undefined),
      showCancelButton: true,
      confirmButtonText: 'Close finding',
    });
    if (!res.isConfirmed) return;
    const note = String(res.value ?? '').trim();

    if (hasOpenAction) {
      try {
        await closeAction.mutateAsync({ action_id: r.remediation_action_id, kind: 'completed', reason: note });
      } catch {
        return; // closure gate refused — finding stays open, error already surfaced
      }
    }

    const { data: auth } = await supabase.auth.getUser();
    await save.mutateAsync({
      id: r.id, status: 'closed', closed_at: new Date().toISOString(), closed_by: auth?.user?.id ?? null,
    });
    qc.invalidateQueries({ queryKey: ['examination-findings', examinationId] });
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Findings and corrective actions</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline">{openCount} open</Badge>
              {withoutAction.length > 0 && (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                  {withoutAction.length} without remediation
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {engagementPhrasing('Findings are raised from the fieldwork that evidences them, so each one stays traceable to its', engagement)}{' '}
            workpaper, risk area and assessment.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {withoutAction.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              {withoutAction.length} finding{withoutAction.length === 1 ? '' : 's'} still require remediation
              before the examination can be reported.
            </div>
          )}

          {!readOnly && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {engagementPhrasing('Raise a finding from fieldwork', engagement)}
              </p>
              {eligibleWorkpapers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Record a workpaper first — a finding must be evidenced by the testing that identified it.
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[260px] flex-1">
                    <Select onValueChange={(v) => setRaiseFrom(eligibleWorkpapers.find(w => w.id === v) ?? null)}>
                      <SelectTrigger aria-label="Workpaper evidencing the finding">
                        <SelectValue placeholder="Select the workpaper that evidences the finding" />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleWorkpapers.map((w: any) => (
                          <SelectItem key={w.id} value={w.id}>
                            {[w.reference, w.area].filter(Boolean).join(' · ') || 'Workpaper'}
                            {w.exceptions_count ? ` — ${w.exceptions_count} exception(s)` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    data-rbac="prudential_supervision.edit"
                    size="sm"
                    disabled={!raiseFrom}
                    onClick={() => raiseFrom && setRaiseFrom({ ...raiseFrom, __open: true })}
                  >
                    <Plus className="h-4 w-4 mr-1" />Create supervisory finding
                  </Button>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : canonical.length === 0 ? (
            <div className="rounded-md border p-6 text-center space-y-1">
              <p className="text-sm font-medium">No findings have been raised from this examination</p>
              <p className="text-xs text-muted-foreground">
                Findings appear here once they are raised from a workpaper.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {canonical.map((f) => {
                const wp = (workpapers as any[]).find(w => w.id === f.workpaper_id);
                return (
                  <div key={f.id} className="rounded-md border p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {f.reference ? `${f.reference} · ` : ''}{f.title}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {humanise(f.finding_category) || 'Uncategorised'}
                          {wp ? ` · from ${[wp.reference, wp.area].filter(Boolean).join(' · ')}` : ''}
                          {f.due_date ? ` · due ${new Date(f.due_date).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={sevTone(f.severity)}>{humanise(f.severity)} severity</Badge>
                        <Badge variant="outline">{humanise(f.status)}</Badge>
                        {f.response_state && <Badge variant="outline">{humanise(f.response_state)}</Badge>}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <Block title="What did we find?">
                        {f.observation ? <p>{f.observation}</p> : <p className="text-muted-foreground">Not recorded</p>}
                      </Block>
                      <Block title="What must the entity do?">
                        {f.required_action ? <p>{f.required_action}</p> : <p className="text-muted-foreground">Not recorded</p>}
                      </Block>
                    </div>

                    {f.remediation.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2 text-xs">
                        <span className="font-medium">Remediation:</span>
                        {f.remediation.map(a => (
                          <Badge key={a.id} variant="outline" className={actionTone(a.status)}>
                            {[a.reference, actionStatusLabel(a.status)].filter(Boolean).join(' · ')}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-warning">Remediation not yet required of the entity.</p>
                    )}

                    <Button asChild size="sm" variant="outline">
                      <Link to={`/supervision/findings/${f.id}`}>
                        Open finding workspace<ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {legacy.length > 0 && (
            <div className="space-y-3 rounded-md border border-dashed p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Historical findings recorded before the supervisory finding register
                </p>
                <Badge variant="outline">{legacy.length}</Badge>
              </div>
              {(legacy as any[]).map((r: any) => (
                <div key={r.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{r.reference ? `${r.reference} · ` : ''}{r.title}</div>
                      <p className="text-xs text-muted-foreground">
                        {r.category || 'Uncategorised'}
                        {r.target_date ? ` · target ${new Date(r.target_date).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline" className={sevTone(r.severity)}>{humanise(r.severity)} severity</Badge>
                      <Badge variant="outline">{humanise(r.status)}</Badge>
                    </div>
                  </div>
                  {r.observation && <p className="text-xs">{r.observation}</p>}
                  {r.action ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2 text-xs">
                      <span><span className="font-medium">Corrective action: </span>{r.action.title}</span>
                      <Badge variant="outline" className={actionTone(r.action.status)}>{actionStatusLabel(r.action.status)}</Badge>
                      {r.action.due_date && !isActionClosed(r.action.status) && (
                        <span className="text-muted-foreground">Due {new Date(r.action.due_date).toLocaleDateString()}</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-warning">Corrective action not yet created.</p>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/supervision/findings/${r.id}`}>
                      Open finding<ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  {!readOnly && (
                    <div className="flex flex-wrap gap-2">
                      {!r.remediation_action_id && (
                        <Button data-rbac="prudential_supervision.workflow_action" size="sm" disabled={createAction.isPending}
                          onClick={() => createAction.mutate({ finding_id: r.id, due_date: r.target_date ?? null, description: r.recommendation ?? null })}>
                          <ClipboardList className="h-3.5 w-3.5 mr-1" />Create corrective action
                        </Button>
                      )}
                      {r.status !== 'closed' && (
                        <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline"
                          onClick={() => closeLegacyFinding(r)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Close finding
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ExternalLink className="h-3 w-3" />
                New findings are recorded only in the supervisory finding register above.
              </p>
            </div>
          )}

          {!readOnly && <StageActions mode={mode} />}
        </CardContent>
      </Card>

      {raiseFrom?.__open && exam && (
        <RaiseFindingDialog
          open
          onOpenChange={(o) => { if (!o) setRaiseFrom(null); }}
          examinationId={examinationId}
          examinationReference={(exam as any).reference}
          entityId={(exam as any).entity_id}
          entityName={(exam as any).licensee?.name ?? null}
          domainCode={(exam as any).domain_code ?? 'PRUDENTIAL'}
          workpaper={raiseFrom}
          scopeDimensions={scopeDimensions}
        />
      )}
    </>
  );
}
