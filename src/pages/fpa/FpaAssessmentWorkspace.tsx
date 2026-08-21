/**
 * EPR-04 / P05 — canonical Fit & Proper Assessment Case workspace.
 *
 * One assessment id = one case. Everything shown here is scoped to that
 * assessment by the server read model `fp_assessment_case()`; nothing is
 * resolved from the individual's "latest" assessment.
 *
 * Rules honoured here:
 *  - exactly one lifecycle controller: the **Current step** tab. Supporting
 *    tabs never change the assessment status and there is no status dropdown;
 *  - stage progression uses the governed operation `fp_assessment_set_status`;
 *  - blocker "Resolve" links carry `?from=current` and show a detour banner.
 */
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowUpRight, Check, Circle, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CaseHeader } from '@/components/cases/CaseHeader';
import { FpScreeningPanel } from '@/components/fit-and-proper/FpScreeningPanel';
import { SubmittedDeclarationView } from '@/components/fit-and-proper/SubmittedDeclarationView';
import { RequestDeclarationDialog } from '@/components/fit-and-proper/RequestDeclarationDialog';
import { FpPqAmendmentDialog } from '@/components/fit-and-proper/FpPqAmendmentDialog';
import { supabase } from '@/integrations/supabase/client';
import { useFpAssessmentCase, type FpCaseAction } from '@/hooks/useFpProcess';
import { fpAssessmentAssignCommittee, fpAssessmentSetStatus } from '@/lib/fpGovernedOps';
import { useUserDisplayNames } from '@/hooks/useUserDisplayNames';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { canRequestDeclaration } from '@/lib/fpaAssessmentStatus';
import { toast } from 'sonner';

type SectionKey =
  | 'current' | 'overview' | 'declaration' | 'screening' | 'findings' | 'committee'
  | 'determination' | 'conditions' | 'monitoring' | 'appeal' | 'communications'
  | 'related' | 'history';

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'current', label: 'Current step' },
  { key: 'overview', label: 'Overview' },
  { key: 'declaration', label: 'Declaration' },
  { key: 'screening', label: 'Screening' },
  { key: 'findings', label: 'Findings' },
  { key: 'committee', label: 'Committee' },
  { key: 'determination', label: 'Determination' },
  { key: 'conditions', label: 'Conditions' },
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'appeal', label: 'Appeal' },
  { key: 'communications', label: 'Communications' },
  { key: 'related', label: 'Related cases' },
  { key: 'history', label: 'History' },
];

const STEP_ORDER: Array<{ status: string; label: string }> = [
  { status: 'draft', label: 'Declaration requested' },
  { status: 'submitted', label: 'Declaration received' },
  { status: 'screening', label: 'Screening & findings' },
  { status: 'awaiting_committee', label: 'Committee decision' },
  { status: 'determined', label: 'Determination issued' },
  { status: 'closed', label: 'Closed' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{children ?? '—'}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

export default function FpaAssessmentWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const section = (params.get('section') as SectionKey) || 'current';
  const detour = params.get('from') === 'current' && section !== 'current';

  const caseQuery = useFpAssessmentCase(id);
  const kase = caseQuery.data;
  const header = kase?.header;
  const blockers = kase?.blockers ?? [];
  const actions = useMemo(() => kase?.available_actions ?? [], [kase?.available_actions]);

  const [reason, setReason] = useState('');
  const [pendingAction, setPendingAction] = useState<FpCaseAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [committeeChoice, setCommitteeChoice] = useState('');
  const [declarationOpen, setDeclarationOpen] = useState(false);

  const ownerIds = useMemo(
    () => [header?.owner_user_id].filter(Boolean) as string[],
    [header?.owner_user_id],
  );
  const { data: names } = useUserDisplayNames(ownerIds);

  const committeesQ = useQuery({
    queryKey: ['fp_committees_assignable'],
    enabled: section === 'committee' || section === 'current',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_committees')
        .select('id, name, quorum, approval_threshold_pct')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Declaration payload is only needed for the read-only submitted view.
  const declarationQ = useQuery({
    queryKey: ['fp_assessment_declaration_data', id],
    enabled: !!id && section === 'declaration',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('declaration_data')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data?.declaration_data ?? null) as Record<string, any> | null;
    },
  });

  const setSection = (next: SectionKey, from?: 'current') => {
    const p = new URLSearchParams(params);
    p.set('section', next);
    if (from) p.set('from', from); else p.delete('from');
    setParams(p, { replace: true });
  };

  const runAction = async (action: FpCaseAction) => {
    if (!id || busy) return;
    if (action.requires_reason && reason.trim().length < 10) {
      toast.error('Provide a rationale of at least 10 characters.');
      return;
    }
    setBusy(true);
    try {
      await fpAssessmentSetStatus(id, action.to_status, reason.trim() || null);
      toast.success(`${action.label} recorded.`);
      setReason('');
      setPendingAction(null);
      await caseQuery.refetch();
      setSection('current');
    } catch (e: any) {
      toast.error(e?.message ?? 'The operation was rejected.');
    } finally {
      setBusy(false);
    }
  };

  const assignCommittee = async () => {
    if (!id || !committeeChoice) return;
    setBusy(true);
    try {
      await fpAssessmentAssignCommittee(id, committeeChoice);
      toast.success('Committee assigned to this assessment.');
      setCommitteeChoice('');
      await caseQuery.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? 'Committee assignment was rejected.');
    } finally {
      setBusy(false);
    }
  };

  if (caseQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading assessment case…
        </div>
      </DashboardLayout>
    );
  }

  if (!kase?.found || !kase?.allowed || !header) {
    return (
      <DashboardLayout>
        <div className="space-y-4 p-6">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/fpa/processes"><ArrowLeft className="mr-1 h-4 w-4" />Back to F&P processes</Link>
          </Button>
          <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
            {kase?.found === false
              ? 'This assessment case does not exist.'
              : 'You do not have access to this assessment case.'}
          </CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  const currentIdx = STEP_ORDER.findIndex((s) => s.status === header.status);
  const determination = kase.determination ?? null;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/fpa/processes"><ArrowLeft className="mr-1 h-4 w-4" />F&P processes</Link>
        </Button>

        <CaseHeader
          reference={header.reference}
          subject={header.subject}
          subjectHref={header.subject_href}
          caseType={`Fit & Proper · ${(header.assessment_type ?? 'assessment').replace(/_/g, ' ')}`}
          stageLabel={header.stage_label}
          statusLabel={header.status_label}
          ownerName={header.owner_user_id ? (names?.[header.owner_user_id] ?? 'Assigned officer') : null}
          team={header.team}
          priority={header.priority}
          slaDueAt={header.sla_due_at}
          slaState={header.sla_state}
          waitingOn={header.waiting_on}
          nextActionLabel={kase.next_action?.label ?? null}
          blockers={blockers}
          lastActivityAt={header.last_activity_at}
        />

        {detour ? (
          <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              You were sent here to clear a blocker on the current step.
            </span>
            <Button size="sm" variant="outline" onClick={() => setSection('current')}>
              Return to current step
            </Button>
          </div>
        ) : null}

        <Tabs value={section} onValueChange={(v) => setSection(v as SectionKey)}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            {SECTIONS.map((s) => (
              <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>
            ))}
          </TabsList>

          {/* ------------------------------------------------ current step */}
          <TabsContent value="current" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current step — {header.stage_label}</CardTitle>
                <CardDescription>
                  This is the only place the assessment lifecycle can be advanced. Supporting tabs
                  record their own content and never change the case status.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="space-y-1.5">
                  {STEP_ORDER.map((s, i) => (
                    <li key={s.status} className="flex items-center gap-2 text-sm">
                      {i < currentIdx
                        ? <Check className="h-4 w-4 text-emerald-600" />
                        : <Circle className={`h-4 w-4 ${i === currentIdx ? 'text-primary' : 'text-muted-foreground/40'}`} />}
                      <span className={i === currentIdx ? 'font-medium' : 'text-muted-foreground'}>{s.label}</span>
                    </li>
                  ))}
                </ol>

                {blockers.length ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                    <div className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />Before you can progress this case:
                    </div>
                    <ul className="mt-1 space-y-1 pl-5">
                      {blockers.map((b) => (
                        <li key={b.code} className="list-disc text-muted-foreground">
                          {b.label}
                          {b.href ? (
                            <Link to={b.href} className="ml-2 underline hover:no-underline">Resolve</Link>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {actions.length === 0 ? (
                  <Empty>
                    {kase.can_act
                      ? 'There is no lifecycle action available at this stage.'
                      : 'You do not have permission to act on Fit & Proper cases.'}
                  </Empty>
                ) : (
                  <div className="space-y-3">
                    {pendingAction?.requires_reason ? (
                      <div className="space-y-1">
                        <Label htmlFor="fp-reason">Rationale (recorded on the regulatory audit trail)</Label>
                        <Textarea
                          id="fp-reason"
                          rows={3}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Why is the case moving to this stage?"
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {actions.map((a) => (
                        <Button
                          key={a.code}
                          size="sm"
                          variant={a.code === kase.next_action?.code ? 'default' : 'outline'}
                          disabled={busy || !a.enabled}
                          onClick={() => {
                            if (a.requires_reason && pendingAction?.code !== a.code) {
                              setPendingAction(a);
                              return;
                            }
                            void runAction(a);
                          }}
                        >
                          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                          {a.requires_reason && pendingAction?.code !== a.code ? a.label : `Confirm: ${a.label}`}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------- overview */}
          <TabsContent value="overview">
            <Card>
              <CardHeader><CardTitle className="text-base">Case overview</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Field label="Person">
                  <Link to={header.subject_href} className="hover:underline">{header.subject}</Link>
                </Field>
                <Field label="Role / appointment">{header.role_label ?? 'Not linked to a role'}</Field>
                <Field label="Entity">
                  {header.entity_href
                    ? <Link to={header.entity_href} className="hover:underline">
                        {header.licensee_name ?? 'Entity'} <ArrowUpRight className="inline h-3 w-3" />
                      </Link>
                    : '—'}
                </Field>
                <Field label="Regulator">{header.regulator_name ?? '—'}</Field>
                <Field label="Assessment type">{(header.assessment_type ?? '—').replace(/_/g, ' ')}</Field>
                <Field label="Initiated">{formatDateTime(header.created_at)}</Field>
                <Field label="Open findings">{kase.screening?.open_findings ?? 0}</Field>
                <Field label="High/critical findings">{kase.screening?.high_findings ?? 0}</Field>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------- declaration */}
          <TabsContent value="declaration" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Declaration (personal questionnaire)</CardTitle>
                  <CardDescription>Scoped to this assessment case only.</CardDescription>
                </div>
                <div className="flex gap-2">
                  {canRequestDeclaration(header.status) ? (
                    <Button size="sm" variant="outline" onClick={() => setDeclarationOpen(true)}>
                      Request declaration
                    </Button>
                  ) : null}
                  {kase.declaration?.has_data ? (
                    <FpPqAmendmentDialog
                      assessmentId={id!}
                      invalidateKeys={[['fp_assessment_case', id]]}
                    />
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <Field label="Questionnaire state">{kase.declaration?.pq_state ?? '—'}</Field>
                  <Field label="Submitted">{kase.declaration?.submitted_at ? formatDateTime(kase.declaration.submitted_at) : 'Not submitted'}</Field>
                  <Field label="Invitation status">{kase.declaration?.invitation?.status ?? 'No invitation sent'}</Field>
                  <Field label="Invitation expires">{kase.declaration?.invitation?.expires_at ? formatDateTime(kase.declaration.invitation.expires_at) : '—'}</Field>
                </div>
                {kase.declaration?.pq_amendment_reason ? (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <span className="text-muted-foreground">Amendment requested: </span>
                    {kase.declaration.pq_amendment_reason}
                  </div>
                ) : null}
                <SubmittedDeclarationView
                  formTemplateId={kase.declaration?.form_template_id}
                  formVersionId={kase.declaration?.form_version_id}
                  declarationData={declarationQ.data}
                />
              </CardContent>
            </Card>
            <RequestDeclarationDialog
              open={declarationOpen}
              onOpenChange={setDeclarationOpen}
              individualId={header.individual_id}
              individualName={header.subject}
              assessmentId={id!}
              assessmentLabel={`${header.reference} · ${(header.assessment_type ?? 'assessment').replace(/_/g, ' ')}`}
              onSent={() => { void caseQuery.refetch(); }}
            />
          </TabsContent>

          {/* --------------------------------------------------- screening */}
          <TabsContent value="screening">
            <FpScreeningPanel individualId={header.individual_id} assessmentId={id!} scopeToAssessment />
          </TabsContent>

          {/* ---------------------------------------------------- findings */}
          <TabsContent value="findings">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Findings — this assessment</CardTitle>
                <CardDescription>
                  {(kase.findings ?? []).length} finding(s) raised against {header.reference}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(kase.findings ?? []).length === 0 ? (
                  <Empty>No findings have been raised for this assessment.</Empty>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Check</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Disposition</TableHead>
                          <TableHead>Raised</TableHead>
                          <TableHead className="w-20" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(kase.findings ?? []).map((f) => (
                          <TableRow key={f.id}>
                            <TableCell className="text-xs uppercase text-muted-foreground">{f.check_type ?? '—'}</TableCell>
                            <TableCell className="text-sm font-medium">{f.title ?? '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{f.severity ?? '—'}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {f.is_false_positive ? 'False positive' : (f.resolution_status ?? 'open')}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">{formatDateOnly(f.created_at)}</TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost" asChild><Link to={f.href}>Open</Link></Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* --------------------------------------------------- committee */}
          <TabsContent value="committee" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Committee</CardTitle>
                <CardDescription>Votes recorded against this assessment only.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <Field label="Committee">{kase.committee?.committee?.name ?? 'Not assigned'}</Field>
                  <Field label="Quorum">{kase.committee?.committee?.quorum ?? '—'}</Field>
                  <Field label="Approval threshold">
                    {kase.committee?.committee?.approval_threshold_pct != null
                      ? `${kase.committee.committee.approval_threshold_pct}%` : '—'}
                  </Field>
                  <Field label="Votes cast">{(kase.committee?.votes ?? []).length}</Field>
                </div>

                {!kase.committee?.committee && kase.can_act ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[240px]">
                      <Label className="text-xs">Assign a committee</Label>
                      <Select value={committeeChoice} onValueChange={setCommitteeChoice}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select committee" /></SelectTrigger>
                        <SelectContent>
                          {(committeesQ.data ?? []).map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" disabled={!committeeChoice || busy} onClick={assignCommittee}>Assign</Button>
                  </div>
                ) : null}

                {(kase.committee?.votes ?? []).length === 0 ? (
                  <Empty>No votes have been cast for this assessment.</Empty>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vote</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>Justification</TableHead>
                          <TableHead>Cast</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(kase.committee?.votes ?? []).map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="text-sm font-medium">{v.vote ?? '—'}</TableCell>
                            <TableCell className="text-xs tabular-nums">{v.weight ?? 1}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{v.justification ?? '—'}</TableCell>
                            <TableCell className="text-xs tabular-nums">{v.voted_at ? formatDateTime(v.voted_at) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Voting is performed in the F&P Committee screen; this tab is the case record of it.
                  <Link to="/fpa/committee" className="ml-1 underline hover:no-underline">Open committee voting</Link>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ----------------------------------------------- determination */}
          <TabsContent value="determination">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Determination</CardTitle>
                <CardDescription>The determination recorded for this assessment case.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!determination ? (
                  <Empty>No determination has been recorded for this assessment.</Empty>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <Field label="Outcome"><Badge variant="outline">{determination.outcome ?? '—'}</Badge></Field>
                      <Field label="Determined">{determination.determined_at ? formatDateTime(determination.determined_at) : '—'}</Field>
                      <Field label="Effective from">{determination.effective_from ? formatDateOnly(determination.effective_from) : '—'}</Field>
                      <Field label="Current position">{determination.is_current ? 'Yes' : 'Superseded'}</Field>
                    </div>
                    <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                      {determination.rationale ?? 'No rationale recorded.'}
                    </div>
                    {determination.is_committee_override ? (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                        <span className="font-medium">Committee override: </span>
                        {determination.override_reason ?? '—'}
                      </div>
                    ) : null}
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  Determinations are recorded through the governed F&P determination screen.
                  <Link to="/fpa/determinations" className="ml-1 underline hover:no-underline">Open determinations</Link>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------------------------------------------------- conditions */}
          <TabsContent value="conditions">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Conditions</CardTitle>
                <CardDescription>Conditions attached to this case's determination.</CardDescription>
              </CardHeader>
              <CardContent>
                {(kase.conditions ?? []).length === 0 ? (
                  <Empty>No conditions are attached to this assessment's determination.</Empty>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(kase.conditions ?? []).map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="text-xs uppercase text-muted-foreground">{c.category ?? '—'}</TableCell>
                            <TableCell className="text-sm">{c.description ?? '—'}</TableCell>
                            <TableCell className="text-xs tabular-nums">{c.due_date ? formatDateOnly(c.due_date) : '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{c.status ?? '—'}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------------------------------------------------- monitoring */}
          <TabsContent value="monitoring">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monitoring</CardTitle>
                <CardDescription>Post-determination monitoring events for this case lineage.</CardDescription>
              </CardHeader>
              <CardContent>
                {(kase.monitoring ?? []).length === 0 ? (
                  <Empty>No monitoring events for this case.</Empty>
                ) : (
                  <div className="space-y-2">
                    {(kase.monitoring ?? []).map((m) => (
                      <div key={m.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{m.event_type ?? 'event'}</span>
                          <Badge variant="outline" className="text-xs">{m.severity ?? '—'}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{m.summary ?? '—'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Raised {m.raised_at ? formatDateTime(m.raised_at) : '—'}
                          {m.acknowledged_at ? ` · acknowledged ${formatDateTime(m.acknowledged_at)}` : ' · unacknowledged'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------------ appeal */}
          <TabsContent value="appeal">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Appeal</CardTitle>
                <CardDescription>Appeals filed against this case's determination.</CardDescription>
              </CardHeader>
              <CardContent>
                {(kase.appeals ?? []).length === 0 ? (
                  <Empty>No appeal has been filed against this determination.</Empty>
                ) : (
                  <div className="space-y-2">
                    {(kase.appeals ?? []).map((ap) => (
                      <div key={ap.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">Appeal · {ap.status ?? '—'}</span>
                          <span className="text-xs text-muted-foreground">
                            Filed {ap.filed_at ? formatDateTime(ap.filed_at) : '—'}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{ap.grounds ?? '—'}</p>
                        {ap.decision ? (
                          <p className="mt-1 text-xs">
                            Decision: <span className="font-medium">{ap.decision}</span>
                            {ap.decided_at ? ` · ${formatDateTime(ap.decided_at)}` : ''}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------- communications */}
          <TabsContent value="communications">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Communications</CardTitle>
                <CardDescription>Declaration invitations and notifications for this case.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {kase.declaration?.invitation ? (
                  <div className="rounded-md border p-3 text-sm">
                    <div className="font-medium">Declaration invitation · {kase.declaration.invitation.status ?? '—'}</div>
                    <div className="mt-1 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <Field label="Channel">{kase.declaration.invitation.channel ?? '—'}</Field>
                      <Field label="Recipient">{kase.declaration.invitation.recipient_email ?? '—'}</Field>
                      <Field label="Sent">{kase.declaration.invitation.sent_at ? formatDateTime(kase.declaration.invitation.sent_at) : '—'}</Field>
                      <Field label="Submitted">{kase.declaration.invitation.submitted_at ? formatDateTime(kase.declaration.invitation.submitted_at) : '—'}</Field>
                    </div>
                  </div>
                ) : (
                  <Empty>No declaration invitation has been issued for this case.</Empty>
                )}
                <p className="text-xs text-muted-foreground">
                  Full delivery history is in the F&P notification log.
                  <Link to="/fpa/notifications" className="ml-1 underline hover:no-underline">Open notification log</Link>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ----------------------------------------------- related cases */}
          <TabsContent value="related">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related cases</CardTitle>
                <CardDescription>Other assessment cases for {header.subject}.</CardDescription>
              </CardHeader>
              <CardContent>
                {(kase.related_cases ?? []).length === 0 ? (
                  <Empty>This is the only assessment case for this person.</Empty>
                ) : (
                  <div className="space-y-2">
                    {(kase.related_cases ?? []).map((r) => (
                      <div key={r.href} className="flex items-center justify-between rounded-md border p-3 text-sm">
                        <div>
                          <div className="font-medium">{r.label}</div>
                          <div className="text-xs text-muted-foreground">{r.detail ?? '—'}</div>
                        </div>
                        <Button size="sm" variant="outline" asChild><Link to={r.href}>Open case</Link></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------- history */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">History</CardTitle>
                <CardDescription>Audited events recorded against this assessment.</CardDescription>
              </CardHeader>
              <CardContent>
                {(kase.history ?? []).length === 0 ? (
                  <Empty>No audited events recorded for this assessment yet.</Empty>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Object</TableHead>
                          <TableHead>Rationale</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(kase.history ?? []).map((h, i) => (
                          <TableRow key={`${h.at}-${i}`}>
                            <TableCell className="text-xs tabular-nums whitespace-nowrap">{formatDateTime(h.at)}</TableCell>
                            <TableCell className="text-sm">{h.action}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{h.object_type ?? '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{h.justification ?? '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
