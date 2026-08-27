/**
 * EPR-02 — Prudential Assessment Case Workspace.
 *
 * Single workspace for a prudential (CAMELS) assessment case. The authoritative
 * source for everything process-shaped — stage, status, SLA, owner, blockers,
 * next action, permitted transitions, rating policy and the canonical evidence
 * filing — is `prudential_assessment_case()`. The browser only formats it.
 *
 * Rules honoured here:
 *  - exactly one lifecycle controller: the **Current step** tab. Supporting tabs
 *    save their own content and never change the stage;
 *  - no client-side supervisory rating policy. The rating suggestion is whatever
 *    the server's `rating_guidance` says (today: NO AUTOMATED RATING SUGGESTION);
 *  - no raw return-filing-id editing. Evidence is the canonical EPR-01 filing
 *    resolved server-side;
 *  - stress/engine re-evaluation lives at /admin/prudential/operations only.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowUpRight, Check, Circle, Info, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { CaseHeader } from '@/components/cases/CaseHeader';
import { CamelsComponentsPanel } from '@/components/prudential/CamelsComponentsPanel';
import { CreatePrudentialActionDialog } from '@/components/prudential/CreatePrudentialActionDialog';
import { PermissionGate } from '@/components/auth/PermissionGate';
import {
  useAssessment,
  useAssessmentPrefill,
  useTransitionAssessment,
  useUpsertAssessment,
} from '@/hooks/usePrudentialSupervision';
import { usePrudentialAssessmentCase, type CaseAction } from '@/hooks/usePrudentialProcess';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { isAssessmentEditable } from '@/lib/prudentialPhase2';

const RATINGS = ['1 - Strong', '2 - Satisfactory', '3 - Fair', '4 - Marginal', '5 - Unsatisfactory'];

type SectionKey = 'current' | 'assessment' | 'evidence' | 'actions' | 'related';

const SECTION_LABEL: Record<SectionKey, string> = {
  current: 'Current step',
  assessment: 'Risk assessment',
  evidence: 'Evidence',
  actions: 'Supervisory actions',
  related: 'Related cases',
};

export default function AssessmentWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const section = (params.get('section') as SectionKey) || 'current';
  const detour = params.get('from') === 'current' && section !== 'current';

  const caseQuery = usePrudentialAssessmentCase(id);
  const { data: assessment } = useAssessment(id);
  const upsert = useUpsertAssessment();
  const transition = useTransitionAssessment();

  const kase = caseQuery.data;
  const header = kase?.header;
  const blockers = kase?.blockers ?? [];
  const guidance = kase?.rating_guidance;
  const filing = kase?.filing ?? null;

  const { data: prefill } = useAssessmentPrefill(filing?.return_filing_id ?? null);

  const [form, setForm] = useState<any>({});
  const [reason, setReason] = useState('');
  const [pendingAction, setPendingAction] = useState<CaseAction | null>(null);
  const [createAction, setCreateAction] = useState<any>(null);

  useEffect(() => { if (assessment) setForm(assessment); }, [assessment]);

  const canEdit = isAssessmentEditable(header?.status ?? assessment?.status);

  const setSection = (next: SectionKey, from?: 'current') => {
    const p = new URLSearchParams(params);
    p.set('section', next);
    if (from) p.set('from', from); else p.delete('from');
    setParams(p, { replace: true });
  };

  const busy = upsert.isPending || transition.isPending;

  const saveContent = async () => {
    if (busy) return;
    try {
      await upsert.mutateAsync({
        id,
        entity_id: form.entity_id,
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        overall_rating: form.overall_rating || null,
        ratings: form.ratings || {},
        rationale: form.rationale || null,
        conclusion: form.conclusion || null,
        recommended_response: form.recommended_response || null,
        status: form.status,
        // Evidence stays canonical: it is never re-keyed from the browser.
        return_filing_id: form.return_filing_id ?? null,
        return_filing_version_id: form.return_filing_version_id ?? null,
      } as any);
      await caseQuery.refetch();
    } catch { /* toast raised by the hook */ }
  };

  const runAction = async (action: CaseAction) => {
    if (busy || !id) return;
    if (action.requires_reason && !reason.trim()) return;
    try {
      if (canEdit) await saveContent();
      await transition.mutateAsync({ id, to: action.to_status as any, reason: reason.trim() || undefined });
      setReason('');
      setPendingAction(null);
      await caseQuery.refetch();
      setSection('current');
    } catch { /* toast raised by the hook */ }
  };

  const completed = kase?.completed_steps ?? [];
  const nextAction = kase?.next_action;
  const actions = useMemo(() => kase?.available_actions ?? [], [kase?.available_actions]);

  if (caseQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading assessment case…
        </div>
      </DashboardLayout>
    );
  }

  if (!kase?.found || !header) {
    return (
      <DashboardLayout>
        <Card><CardContent className="space-y-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">This assessment is not available to you.</p>
          <Button variant="outline" asChild><Link to="/prudential/work">Back to prudential work</Link></Button>
        </CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" asChild>
            <Link to="/prudential/work"><ArrowLeft className="mr-1 h-4 w-4" />Prudential work</Link>
          </Button>
          <HistoryButton entityType="prudential_assessment" entityId={id!} />
        </div>

        <CaseHeader
          reference={header.reference}
          subject={header.subject}
          subjectHref={header.entity_href}
          caseType={header.assessment_type}
          stageLabel={header.stage_label}
          statusLabel={header.status_label}
          ownerName={header.owner_name}
          team={header.team}
          priority={header.priority}
          slaDueAt={header.sla_due_at}
          slaState={header.sla_state}
          waitingOn={header.waiting_on}
          nextActionLabel={nextAction?.label ?? null}
          blockers={blockers}
          lastActivityAt={header.last_activity_at}
          actions={header.overall_rating ? <Badge variant="outline">Rating {header.overall_rating}</Badge> : null}
        />

        {detour ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span>You are resolving a prerequisite. The stage is only advanced from the current step.</span>
              <Button size="sm" variant="outline" onClick={() => setSection('current')}>Return to current step</Button>
            </CardContent>
          </Card>
        ) : null}

        <Tabs value={section} onValueChange={(v) => setSection(v as SectionKey)}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            {(Object.keys(SECTION_LABEL) as SectionKey[]).map((k) => (
              <TabsTrigger key={k} value={k}>{SECTION_LABEL[k]}</TabsTrigger>
            ))}
          </TabsList>

          {/* ---------------------------------------------- current step */}
          <TabsContent value="current" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{header.stage_label}</CardTitle>
                <CardDescription>
                  {nextAction?.label ?? 'No further action required'}
                  {header.period_start && header.period_end
                    ? ` · Assessment period ${formatDateOnly(header.period_start)} → ${formatDateOnly(header.period_end)}`
                    : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {blockers.length ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                    <div className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Before you can {(actions[0]?.label ?? 'progress').toLowerCase()}:
                    </div>
                    <ul className="mt-2 space-y-1">
                      {blockers.map((b) => (
                        <li key={b.code + b.label} className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">{b.label}</span>
                          <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" className="h-6 px-2 text-xs"
                            onClick={() => setSection('assessment', 'current')}>Resolve</Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {actions.length ? (
                  <div className="space-y-3">
                    {actions.some((a) => a.requires_reason) ? (
                      <div>
                        <Label>Decision rationale <span className="text-destructive">*</span></Label>
                        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                          placeholder="Record the supervisory reasoning for this decision." />
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {actions.map((a) => (
                        <PermissionGate key={a.code}
                          module={(a.permission ?? 'prudential_supervision.workflow_action').split('.')[0]}
                          action={(a.permission ?? 'prudential_supervision.workflow_action').split('.')[1]}>
                          <Button
                            variant={a.code === 'return' ? 'outline' : 'default'}
                            disabled={busy || a.enabled === false || (a.requires_reason && !reason.trim())}
                            onClick={() => runAction(a)}
                          >
                            {busy && pendingAction?.code === a.code
                              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Working…</>
                              : a.label}
                          </Button>
                        </PermissionGate>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">This case is closed. No stage action is available.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Progress</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {completed.map((s) => (
                  <div key={s.label} className="flex items-center justify-between border-b pb-1">
                    <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" />{s.label}</span>
                    <span className="text-xs text-muted-foreground">{s.at ? formatDateTime(s.at) : '—'}</span>
                  </div>
                ))}
                {nextAction && nextAction.code !== 'none' ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Circle className="h-3.5 w-3.5" />{nextAction.label}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------- risk assessment */}
          <TabsContent value="assessment" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Overall rating and rationale</CardTitle>
                <CardDescription>
                  The overall rating is a human-governed supervisory determination. Saving here never changes the stage.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {guidance ? (
                  <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                    <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{guidance.message}</div>
                      {guidance.detail ? <div className="text-muted-foreground">{guidance.detail}</div> : null}
                    </div>
                  </div>
                ) : null}
                <div className="max-w-sm">
                  <Label>Overall rating</Label>
                  <Select disabled={!canEdit} value={form.overall_rating || ''}
                    onValueChange={(v) => setForm({ ...form, overall_rating: v })}>
                    <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                    <SelectContent>{RATINGS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Rationale</Label>
                  <Textarea disabled={!canEdit} rows={3} value={form.rationale || ''}
                    onChange={(e) => setForm({ ...form, rationale: e.target.value })} /></div>
                <div><Label>Conclusion</Label>
                  <Textarea disabled={!canEdit} rows={3} value={form.conclusion || ''}
                    onChange={(e) => setForm({ ...form, conclusion: e.target.value })} /></div>
                <div><Label>Recommended supervisory response</Label>
                  <Textarea disabled={!canEdit} rows={3} value={form.recommended_response || ''}
                    onChange={(e) => setForm({ ...form, recommended_response: e.target.value })} /></div>
                {canEdit ? (
                  <PermissionGate module="prudential_supervision" action="edit">
                    <Button disabled={busy} onClick={saveContent}>
                      {upsert.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save assessment'}
                    </Button>
                  </PermissionGate>
                ) : (
                  <p className="text-sm text-muted-foreground">Read-only at this stage.</p>
                )}
              </CardContent>
            </Card>

            <CamelsComponentsPanel
              assessmentId={id!}
              sectorId={(assessment?.licensees as any)?.sector_id ?? null}
              status={header.status}
            />
          </TabsContent>

          {/* ---------------------------------------------- evidence */}
          <TabsContent value="evidence" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Canonical filing evidence</CardTitle>
                <CardDescription>Resolved server-side from the accepted return filing. Not editable here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {filing ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={filing.href} className="font-medium hover:underline">
                        {filing.filing_reference ?? 'Return filing'} <ArrowUpRight className="inline h-3.5 w-3.5" />
                      </Link>
                      <Badge variant="outline">{filing.status ?? '—'}</Badge>
                      {filing.accepted_version_number != null
                        ? <Badge variant="outline">Accepted v{filing.accepted_version_number}</Badge> : null}
                    </div>
                    <div className="text-muted-foreground">
                      Period {filing.period_label ?? (filing.period_end ? formatDateOnly(filing.period_end) : '—')}
                      {filing.accepted_at ? ` · accepted ${formatDateTime(filing.accepted_at)}` : ''}
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    No canonical filing is linked to this assessment, so no metric evidence can be shown.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Metric facts ({prefill?.ratios?.length ?? 0})</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {(prefill?.ratios ?? []).slice(0, 12).map((r: any) => (
                    <div key={r.id} className="flex justify-between border-b py-1">
                      <span className="truncate">{r.label}</span>
                      <span className="tabular-nums">{r.value ?? '—'}</span>
                    </div>
                  ))}
                  {!(prefill?.ratios ?? []).length ? <span className="text-muted-foreground">None</span> : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Breaches ({prefill?.breaches?.length ?? 0})</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {(prefill?.breaches ?? []).slice(0, 12).map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 border-b py-1">
                      <span className="truncate">{b.metric_key ?? b.ratio_key}</span>
                      <span className="flex items-center gap-1">
                        <Badge>{b.severity}</Badge>
                        <PermissionGate module="prudential_supervision" action="create">
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setCreateAction({
                            entity_id: header.entity_id, source_type: 'assessment', source_id: id,
                            title: `Address breach: ${b.metric_key ?? b.ratio_key}`, severity: b.severity,
                          })}>Raise action</Button>
                        </PermissionGate>
                      </span>
                    </div>
                  ))}
                  {!(prefill?.breaches ?? []).length ? <span className="text-muted-foreground">None</span> : null}
                </CardContent>
              </Card>
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Stress events ({prefill?.stress_events?.length ?? 0})</CardTitle>
                  <CardDescription>
                    Stress evaluation is an engine operation and is run from Admin · Prudential operations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  {(prefill?.stress_events ?? []).slice(0, 10).map((s: any) => (
                    <div key={s.id} className="flex justify-between border-b py-1">
                      <span className="truncate">{s.prudential_stress_indicators?.label ?? s.indicator_id}</span>
                      <Badge>{s.prudential_stress_indicators?.severity ?? '—'}</Badge>
                    </div>
                  ))}
                  {!(prefill?.stress_events ?? []).length ? <span className="text-muted-foreground">None</span> : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ---------------------------------------------- actions */}
          <TabsContent value="actions" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Supervisory actions from this assessment</CardTitle>
                  <CardDescription>Consequences raised on this case. Tracked in the prudential work queue.</CardDescription>
                </div>
                <PermissionGate module="prudential_supervision" action="create">
                  <Button size="sm" variant="outline" onClick={() => setCreateAction({
                    entity_id: header.entity_id, source_type: 'assessment', source_id: id,
                    title: 'Follow-up on assessment recommendation',
                    description: form.recommended_response || null,
                  })}>Raise action</Button>
                </PermissionGate>
              </CardHeader>
              <CardContent className="text-sm">
                {(kase.linked_actions ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 border-b py-2">
                    <Link to={a.href} className="min-w-0 truncate hover:underline">
                      <span className="font-mono text-xs text-muted-foreground">{a.reference}</span> {a.title}
                    </Link>
                    <span className="flex items-center gap-2 text-xs">
                      {a.severity ? <Badge variant="outline">{a.severity}</Badge> : null}
                      <Badge variant="outline">{a.status}</Badge>
                      <span className="text-muted-foreground">{a.due_date ? formatDateOnly(a.due_date) : '—'}</span>
                    </span>
                  </div>
                ))}
                {!(kase.linked_actions ?? []).length ? <span className="text-muted-foreground">No actions raised.</span> : null}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------- related */}
          <TabsContent value="related">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related regulatory cases</CardTitle>
                <CardDescription>Canonical links only — every object opens in its own workspace.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                {(kase.related_cases ?? []).map((r) => (
                  <div key={r.kind + r.href} className="flex items-center justify-between gap-2 border-b py-2">
                    <Link to={r.href} className="min-w-0 truncate hover:underline">{r.label}</Link>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.detail ?? ''}<Badge variant="outline">{r.kind.replace(/_/g, ' ')}</Badge>
                    </span>
                  </div>
                ))}
                {!(kase.related_cases ?? []).length ? <span className="text-muted-foreground">None.</span> : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <CreatePrudentialActionDialog
          open={!!createAction}
          onOpenChange={(o) => { if (!o) { setCreateAction(null); caseQuery.refetch(); } }}
          defaults={createAction}
        />
      </div>
    </DashboardLayout>
  );
}
