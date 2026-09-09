/**
 * Supervisory Assessment Programme Studio — governed authoring and lifecycle.
 *
 * Every control on this screen is offered only where the server says the
 * signed-in officer may act (`supervisory_assessment_programme_action_capabilities`)
 * and every action is a governed RPC with a recorded rationale. Nothing about
 * assessment behaviour, period derivation, triggers or question scope is decided
 * in the browser: all vocabularies come from the server's own catalogue and all
 * validation and refusal remains server-side.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { AlertTriangle } from 'lucide-react';
import {
  useAdoptProgrammeSet,
  useAssessmentProgrammeCapabilities,
  useAssessmentProgrammeCompare,
  useAssessmentProgrammeHistory,
  useAssessmentProgrammeOptions,
  useAssessmentProgrammeSet,
  useProgrammeSetLifecycle,
  useProgrammeSetNewVersion,
  useRemoveProgrammeTrigger,
  useRetireProgramme,
  type Programme,
  type ProgrammeFinding,
  type ProgrammeTrigger,
} from '@/hooks/useSupervisoryAssessmentProgrammes';
import { RationaleDialog } from '@/components/admin/supervisory-assessment-programme/RationaleDialog';
import { ProgrammeEditorDialog } from '@/components/admin/supervisory-assessment-programme/ProgrammeEditorDialog';
import { TriggerEditorDialog } from '@/components/admin/supervisory-assessment-programme/TriggerEditorDialog';
import { ProgrammeSetMetadataAction } from '@/components/admin/supervisory-assessment-programme/ProgrammeSetFormDialog';
import {
  ErrorPanel, ProfileOriginBadge, ProfileStatusBadge, formatDate, humanize,
} from '@/components/admin/supervisory-policy-profile/labels';

type LifecycleAction = 'SUBMIT_REVIEW' | 'RETURN_TO_DRAFT' | 'APPROVE' | 'ACTIVATE' | 'RETIRE';

const ACTION_LABEL: Record<LifecycleAction, string> = {
  SUBMIT_REVIEW: 'Submit for review',
  RETURN_TO_DRAFT: 'Return to draft',
  APPROVE: 'Approve',
  ACTIVATE: 'Activate',
  RETIRE: 'Retire',
};

const ACTION_STATUS: Record<LifecycleAction, string> = {
  SUBMIT_REVIEW: 'REVIEW',
  RETURN_TO_DRAFT: 'DRAFT',
  APPROVE: 'APPROVED',
  ACTIVATE: 'ACTIVE',
  RETIRE: 'RETIRED',
};

const periodSentence = (p: {
  period_rule: string; period_value: number | null; end_offset_days: number | null;
}) => {
  if (p.period_rule === 'TRAILING_DAYS') return `Trailing ${p.period_value} days ending ${p.end_offset_days || 0} day(s) before the start date`;
  if (p.period_rule === 'TRAILING_MONTHS') return `Trailing ${p.period_value} months ending ${p.end_offset_days || 0} day(s) before the start date`;
  if (p.period_rule === 'PRIOR_ASSESSMENT_FORWARD') return 'From the day after the previous assessment period';
  if (p.period_rule === 'EVENT_WINDOW') return `Event window of ${p.period_value} days`;
  return 'Entered by the officer';
};

const findingText = (f: ProgrammeFinding | string) =>
  typeof f === 'string' ? f : `${f.programme_code ? `${f.programme_code} — ` : ''}${f.message}`;

export default function SupervisoryAssessmentProgrammeDetailPage() {
  const { programmeSetId } = useParams<{ programmeSetId: string }>();
  const navigate = useNavigate();
  const detail = useAssessmentProgrammeSet(programmeSetId);
  const caps = useAssessmentProgrammeCapabilities(programmeSetId);
  const history = useAssessmentProgrammeHistory(programmeSetId);
  const options = useAssessmentProgrammeOptions();
  const lifecycle = useProgrammeSetLifecycle();
  const newVersion = useProgrammeSetNewVersion();
  const adopt = useAdoptProgrammeSet();
  const retireProgramme = useRetireProgramme();
  const removeTrigger = useRemoveProgrammeTrigger();

  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [programmeEditor, setProgrammeEditor] = useState<{ open: boolean; programme: Programme | null }>({ open: false, programme: null });
  const [triggerEditor, setTriggerEditor] = useState<{ open: boolean; programme: Programme | null; trigger: ProgrammeTrigger | null }>({ open: false, programme: null, trigger: null });
  const [retiring, setRetiring] = useState<Programme | null>(null);
  const [removing, setRemoving] = useState<{ programme: Programme; trigger: ProgrammeTrigger } | null>(null);
  const [baselineId, setBaselineId] = useState<string>('');

  const compare = useAssessmentProgrammeCompare(programmeSetId, baselineId || undefined);

  if (detail.error) return <ErrorPanel error={detail.error} />;
  if (detail.isLoading || !detail.data) return <Skeleton className="h-96 w-full" />;

  const d = detail.data;
  const c = caps.data;
  const v = d.validation ?? { error_count: 0 };
  const errors = (v.errors ?? []) as Array<ProgrammeFinding | string>;
  const warnings = (v.warnings ?? []) as Array<ProgrammeFinding | string>;
  const editable = Boolean(c?.editable);
  const o = options.data;
  const scopeCount = o?.selectable_regulator_count ?? (o?.regulators?.length ?? 0);
  const soleRegulator = o?.active_regulator ?? (scopeCount === 1 ? o?.regulators?.[0] ?? null : null);

  const runLifecycle = async (rationale: string) => {
    if (!action || !programmeSetId) return;
    await lifecycle.mutateAsync({ setId: programmeSetId, toStatus: ACTION_STATUS[action], rationale });
    toast.success(`${ACTION_LABEL[action]} recorded.`);
    setAction(null);
  };

  const actionButton = (a: LifecycleAction, allowed?: boolean) =>
    allowed ? (
      <Button key={a} size="sm" variant={a === 'RETIRE' ? 'outline' : 'default'} onClick={() => setAction(a)}>
        {ACTION_LABEL[a]}
      </Button>
    ) : null;

  return (
    <div className="space-y-4">
      <PageHeader title={`${d.set.code} ${d.set.set_version}`} description={d.set.name} />

      <div className="flex flex-wrap items-center gap-2">
        <ProfileStatusBadge status={d.set.status} />
        <ProfileOriginBadge origin={d.set.origin} label={null} />
        <Badge variant="outline">{humanize(d.set.domain_code)}</Badge>
        <Badge variant="outline">
          {d.set.regulator_name ?? 'MIPL Reference — not regulator-owned'}
        </Badge>
        <span className="ml-auto flex flex-wrap gap-2">
          {editable ? <ProgrammeSetMetadataAction set={d.set} /> : null}
          {actionButton('SUBMIT_REVIEW', c?.can_submit)}
          {actionButton('RETURN_TO_DRAFT', c?.can_return)}
          {actionButton('APPROVE', c?.can_approve)}
          {actionButton('ACTIVATE', c?.can_activate)}
          {actionButton('RETIRE', c?.can_retire)}
          {c?.can_new_version ? (
            <Button size="sm" variant="outline" data-rbac="aml_supervision.manage_config" onClick={() => setVersionOpen(true)}>New version</Button>
          ) : null}
          {c?.can_adopt ? (
            <Button size="sm" variant="outline" data-rbac="aml_supervision.manage_config" onClick={() => setAdoptOpen(true)}>Adopt for my regulator</Button>
          ) : null}
        </span>
      </div>

      {c?.reason && !editable ? (
        <p className="text-xs text-muted-foreground" data-testid="programme-capability-reason">{c.reason}</p>
      ) : null}

      {c?.maker_checker_block ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{c.maker_checker_block}</AlertDescription>
        </Alert>
      ) : null}

      {errors.length ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p className="text-sm">This package cannot be submitted or approved until these are resolved:</p>
            <ul className="list-disc pl-5 text-xs">
              {errors.map((e, i) => <li key={i}>{findingText(e)}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="programmes">
        <TabsList>
          <TabsTrigger value="programmes">Programmes</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="usage">Policy profiles</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="programmes" className="space-y-3 pt-3">
          {editable ? (
            <div className="flex justify-end">
              <Button size="sm" data-rbac="aml_supervision.manage_config" onClick={() => setProgrammeEditor({ open: true, programme: null })}>
                Add programme
              </Button>
            </div>
          ) : null}

          {d.programmes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No programme has been configured in this package yet.</p>
          ) : d.programmes.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {p.label}
                  <Badge variant="outline" className="font-mono text-[11px]">{p.programme_code}</Badge>
                  <Badge variant="outline">{humanize(p.assessment_type)}</Badge>
                  {!p.is_active || p.retired_at ? <Badge variant="secondary">Retired</Badge> : null}
                  {editable ? (
                    <span className="ml-auto flex gap-2">
                      <Button size="sm" variant="outline" data-rbac="aml_supervision.manage_config"
                        onClick={() => setProgrammeEditor({ open: true, programme: p })}>
                        Edit programme
                      </Button>
                      {!p.retired_at ? (
                        <Button size="sm" variant="outline" data-rbac="aml_supervision.manage_config" onClick={() => setRetiring(p)}>Retire</Button>
                      ) : null}
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {p.description ? <p className="text-muted-foreground">{p.description}</p> : null}
                <p><span className="text-muted-foreground">Review period: </span>{periodSentence(p)}
                  {p.allow_manual_override ? ' (the officer may adjust the dates)' : ' (fixed)'}</p>
                {p.recurrence_months ? (
                  <p><span className="text-muted-foreground">Recurs every: </span>{p.recurrence_months} months</p>
                ) : null}
                <p><span className="text-muted-foreground">Question classes in scope: </span>
                  {(p.question_class_scope ?? []).map(humanize).join(', ') || 'All'}</p>
                {p.requires_prior_assessment ? <p className="text-xs text-muted-foreground">Requires a previous assessment of the entity.</p> : null}
                {p.requires_trigger_signal ? <p className="text-xs text-muted-foreground">Requires the triggering signal or event to be recorded.</p> : null}
                {p.guidance ? <p className="text-xs text-muted-foreground">{p.guidance}</p> : null}
                {p.retired_at ? (
                  <p className="text-xs text-muted-foreground">
                    Retired {formatDate(p.retired_at)}{p.retirement_rationale ? ` — ${p.retirement_rationale}` : ''}.
                    Assessments already started under it are unchanged.
                  </p>
                ) : null}

                <div className="rounded-md border p-3">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                    Triggers accepted
                    {editable ? (
                      <Button size="sm" variant="ghost" className="ml-auto" data-rbac="aml_supervision.manage_config"
                        onClick={() => setTriggerEditor({ open: true, programme: p, trigger: null })}>
                        Add trigger
                      </Button>
                    ) : null}
                  </p>
                  {p.triggers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None configured.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {p.triggers.map((t) => (
                        <li key={t.id ?? t.trigger_code} className="flex flex-wrap items-center gap-2 text-sm">
                          <span>{t.label || humanize(t.trigger_code)}</span>
                          <Badge variant="outline" className="font-mono text-[11px]">{t.trigger_code}</Badge>
                          {t.is_default ? <Badge variant="secondary">Default</Badge> : null}
                          {t.is_active === false ? <Badge variant="outline">Unavailable</Badge> : null}
                          {t.requires_signal ? <span className="text-xs text-muted-foreground">Signal required</span> : null}
                          {editable ? (
                            <span className="ml-auto flex gap-1">
                              <Button size="sm" variant="ghost" data-rbac="aml_supervision.manage_config"
                                onClick={() => setTriggerEditor({ open: true, programme: p, trigger: t })}>
                                Edit
                              </Button>
                              <Button size="sm" variant="ghost" data-rbac="aml_supervision.manage_config"
                                onClick={() => setRemoving({ programme: p, trigger: t })}>
                                Remove
                              </Button>
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="validation" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">
            The server checks this package on every read. Review and approval stay blocked while any
            error remains, whatever this screen shows.
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={errors.length ? 'destructive' : 'secondary'}>{errors.length} error(s)</Badge>
            <Badge variant="outline">{warnings.length} warning(s)</Badge>
            <Badge variant="outline">
              {v.ready_for_review === false ? 'Not ready for review' : 'Ready for review'}
            </Badge>
          </div>
          {errors.length === 0 && warnings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No finding. This package is structurally complete.</p>
          ) : null}
          {errors.length ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Must be resolved</p>
              {errors.map((e, i) => (
                <div key={i} className="rounded-md border border-destructive/40 p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    {typeof e === 'string' ? null : <Badge variant="outline">{humanize(e.area)}</Badge>}
                    {typeof e === 'string' ? null : (
                      <span className="font-mono text-[11px] text-muted-foreground">{e.code}</span>
                    )}
                    {typeof e !== 'string' && e.programme_code ? (
                      <Badge variant="secondary" className="font-mono text-[11px]">{e.programme_code}</Badge>
                    ) : null}
                  </p>
                  <p>{typeof e === 'string' ? e : e.message}</p>
                </div>
              ))}
            </div>
          ) : null}
          {warnings.length ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Worth reviewing</p>
              {warnings.map((w, i) => (
                <div key={i} className="rounded-md border p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    {typeof w === 'string' ? null : <Badge variant="outline">{humanize(w.area)}</Badge>}
                    {typeof w !== 'string' && w.programme_code ? (
                      <Badge variant="secondary" className="font-mono text-[11px]">{w.programme_code}</Badge>
                    ) : null}
                  </p>
                  <p>{typeof w === 'string' ? w : w.message}</p>
                </div>
              ))}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="usage" className="pt-3">
          {d.profile_bindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No supervisory policy profile binds this package yet.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.profile_bindings.map((b) => (
                <li key={b.profile_id} className="flex flex-wrap items-center gap-2">
                  <Button variant="link" className="h-auto p-0"
                    onClick={() => navigate(`/admin/supervisory-policy-profiles/${b.profile_id}`)}>
                    {b.profile_code} {b.profile_version}
                  </Button>
                  <ProfileStatusBadge status={b.profile_status} />
                  <ProfileOriginBadge origin={b.profile_origin} label={null} />
                  <span className="font-mono text-xs text-muted-foreground">
                    Bound version {b.bound_version ?? d.set.set_version}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="versions" className="pt-3">
          <ul className="space-y-2 text-sm">
            {d.versions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <Button variant="link" className="h-auto p-0"
                  onClick={() => navigate(`/admin/supervisory-assessment-programmes/${s.id}`)}>
                  {s.set_version}
                </Button>
                <ProfileStatusBadge status={s.status} />
                <ProfileOriginBadge origin={s.origin} label={null} />
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="compare" className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Compare with version</span>
            <Select value={baselineId} onValueChange={setBaselineId}>
              <SelectTrigger className="h-9 w-[14rem]" aria-label="Baseline version">
                <SelectValue placeholder="Select a version…" />
              </SelectTrigger>
              <SelectContent>
                {d.versions.filter((s) => s.id !== d.set.id).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.set_version} · {humanize(s.status)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!baselineId ? (
            <p className="text-sm text-muted-foreground">Choose a version to see what changed.</p>
          ) : compare.isLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="space-y-3 text-sm">
              {(compare.data?.changes ?? []).length === 0 ? (
                <p className="text-muted-foreground">No difference between these two versions.</p>
              ) : (compare.data?.changes ?? []).map((ch: any, i: number) => (
                <div key={i} className="rounded-md border p-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{humanize(ch.change_type ?? ch.area ?? 'CHANGE')}</Badge>
                    {ch.programme_code ? (
                      <Badge variant="secondary" className="font-mono text-[11px]">{ch.programme_code}</Badge>
                    ) : null}
                    {ch.field ? <span className="font-mono text-xs">{ch.field}</span> : null}
                  </p>
                  <p className="text-muted-foreground">
                    {ch.description ?? `${ch.baseline_value ?? '—'} → ${ch.current_value ?? '—'}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="pt-3">
          {history.isLoading ? <Skeleton className="h-40 w-full" /> : (
            <ul className="space-y-3 text-sm">
              {(history.data?.rows ?? []).map((e: any) => (
                <li key={e.id} className="border-l-2 pl-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{humanize(e.event_type)}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{formatDate(e.created_at)}</span>
                    {e.actor_name ? <span className="text-xs text-muted-foreground">{e.actor_name}</span> : null}
                  </p>
                  {e.rationale ? <p className="text-xs text-muted-foreground">{e.rationale}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <RationaleDialog
        open={action !== null}
        onOpenChange={(open) => { if (!open) setAction(null); }}
        title={action ? ACTION_LABEL[action] : ''}
        description="The reason is recorded permanently against this programme package."
        onConfirm={(rationale) => runLifecycle(rationale)}
      />

      <RationaleDialog
        open={versionOpen}
        onOpenChange={setVersionOpen}
        title="Create a new version"
        description="The current package stays exactly as it is. A new draft is created with a copy of its programmes and triggers."
        confirmLabel="Create version"
        extraField={{ label: 'New version number', placeholder: 'e.g. 1.1' }}
        onConfirm={async (rationale, extra) => {
          const res: any = await newVersion.mutateAsync({
            setId: programmeSetId!, newVersion: extra, rationale,
          });
          toast.success('New draft version created.');
          const id = typeof res === 'string' ? res : res?.id ?? res?.programme_set_id;
          if (id) navigate(`/admin/supervisory-assessment-programmes/${id}`);
        }}
      />

      <RationaleDialog
        open={adoptOpen}
        onOpenChange={setAdoptOpen}
        title={soleRegulator ? `Adopt for ${soleRegulator.name} (${soleRegulator.code})` : 'Adopt this package'}
        description="A regulator-owned draft copy is created. The reference package itself is never bound as policy."
        confirmLabel="Adopt package"
        onConfirm={async (rationale) => {
          if (!soleRegulator) throw new Error('No active regulator is available in your authorised scope.');
          const res: any = await adopt.mutateAsync({
            referenceSetId: programmeSetId!, regulatorId: soleRegulator.id, rationale,
          });
          toast.success('Package adopted as a regulator-owned draft.');
          const id = typeof res === 'string' ? res : res?.id ?? res?.programme_set_id;
          if (id) navigate(`/admin/supervisory-assessment-programmes/${id}`);
        }}
      />

      <RationaleDialog
        open={retiring !== null}
        onOpenChange={(open) => { if (!open) setRetiring(null); }}
        title={retiring ? `Retire ${retiring.label}` : ''}
        description="The programme stops being offered to officers. Its history and any assessments already started under it are kept."
        confirmLabel="Retire programme"
        onConfirm={async (rationale) => {
          await retireProgramme.mutateAsync({ programmeId: retiring!.id, rationale });
          toast.success('Programme retired.');
          setRetiring(null);
        }}
      />

      <RationaleDialog
        open={removing !== null}
        onOpenChange={(open) => { if (!open) setRemoving(null); }}
        title="Remove trigger"
        description="The trigger is removed from this draft programme. The change is recorded in the package history."
        confirmLabel="Remove trigger"
        onConfirm={async (rationale) => {
          await removeTrigger.mutateAsync({ triggerId: removing!.trigger.id!, rationale });
          toast.success('Trigger removed.');
          setRemoving(null);
        }}
      />

      <ProgrammeEditorDialog
        open={programmeEditor.open}
        onOpenChange={(open) => setProgrammeEditor({ open, programme: open ? programmeEditor.programme : null })}
        setId={programmeSetId!}
        programme={programmeEditor.programme}
        options={o}
      />

      {triggerEditor.programme ? (
        <TriggerEditorDialog
          open={triggerEditor.open}
          onOpenChange={(open) => setTriggerEditor((p) => ({ ...p, open, trigger: open ? p.trigger : null }))}
          programmeId={triggerEditor.programme.id}
          programmeLabel={triggerEditor.programme.label}
          trigger={triggerEditor.trigger}
          options={o}
        />
      ) : null}
    </div>
  );
}
