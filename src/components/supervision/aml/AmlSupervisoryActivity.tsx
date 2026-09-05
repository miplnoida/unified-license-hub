/**
 * Plan → Intervention → Examination for AML/CFT, on the canonical spine.
 *
 * Every action here calls the existing governed supervisory operation
 * (`supervisory_intervention_open`, `supervisory_intervention_decide`,
 * `supervisory_examination_open`, `examination_scope_from_assessment`,
 * `examination_scope_area_amend`). No AML-specific intervention or examination
 * storage exists, and no identifier is ever typed by the user — the entity,
 * domain, plan, intervention, attention and originating assessment are carried
 * automatically from the record the officer is standing on.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, ArrowUpRight, Lock } from 'lucide-react';
import { AmlActionDialog } from '@/components/supervision/aml/AmlActionDialog';
import {
  useAmendAmlExaminationScope,
  useAmlExaminationScopeFromAssessment,
  useDecideAmlIntervention,
  useOpenAmlExamination,
  useOpenAmlIntervention,
  amlErrorMessage,
} from '@/hooks/useAmlLifecycle';
import { useCan } from '@/hooks/useCan';
import { fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

/** Canonical intervention types available to AML/CFT supervision. */
const INTERVENTION_TYPES = [
  { value: 'TARGETED_EXAMINATION', label: 'Targeted examination' },
  { value: 'ONSITE_EXAMINATION', label: 'Onsite examination' },
  { value: 'FULL_SCOPE_EXAMINATION', label: 'Full-scope examination' },
  { value: 'OFFSITE_REVIEW', label: 'Offsite review' },
  { value: 'FOLLOW_UP_REVIEW', label: 'Follow-up examination' },
  { value: 'THEMATIC_REVIEW', label: 'Thematic review' },
  { value: 'DESK_REVIEW', label: 'Desk review (lightweight)' },
  { value: 'SUPERVISORY_MEETING', label: 'Supervisory meeting' },
  { value: 'INFORMATION_REQUEST', label: 'Information request' },
  { value: 'ENHANCED_MONITORING', label: 'Enhanced monitoring' },
];


const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

interface Props {
  assessmentId: string;
  assessmentStatus: string;
  entityId: string;
  entityName: string | null;
  /** Recorded assessment dimensions (with proposed_examination_scope). */
  dimensions: any[];
  attention: any[];
  plans: any[];
  interventions: any[];
  /** Examinations with this assessment as their exact origin. */
  examinations: any[];
  onChanged: () => void;
}

export function AmlSupervisoryActivity({
  assessmentId,
  assessmentStatus,
  entityId,
  entityName,
  dimensions,
  attention,
  plans,
  interventions,
  examinations,
  onChanged,
}: Props) {
  const [planTarget, setPlanTarget] = useState<any | null>(null);
  const [interventionTarget, setInterventionTarget] = useState<any | null>(null);
  const [dialog, setDialog] = useState<'intervention' | 'decide' | 'examination' | null>(null);
  const [scopeTarget, setScopeTarget] = useState<any | null>(null);

  const openIntervention = useOpenAmlIntervention();
  const decideIntervention = useDecideAmlIntervention();
  const openExamination = useOpenAmlExamination();

  const canCreate = useCan('aml_supervision', 'create');
  const canApprove = useCan('aml_supervision', 'approve');
  const canExamine = useCan('aml_supervision', 'examine');

  const approved = String(assessmentStatus ?? '').toLowerCase() === 'approved';
  const activePlans = plans.filter((p) => ['APPROVED', 'ACTIVE'].includes(String(p.status ?? '').toUpperCase()));

  const done = (message: string) => {
    toast.success(message);
    onChanged();
  };

  const interventionsByPlan = useMemo(() => {
    const m = new Map<string, any[]>();
    interventions.forEach((i) => m.set(i.plan_id, [...(m.get(i.plan_id) ?? []), i]));
    return m;
  }, [interventions]);

  const examByIntervention = useMemo(() => {
    const m = new Map<string, any>();
    examinations.forEach((e) => {
      if (e.intervention_id) m.set(e.intervention_id, e);
    });
    return m;
  }, [examinations]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Supervisory plans, interventions and examinations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No supervisory plan has been created from this assessment yet. Raise supervisory attention, confirm its
              priority, then create a plan from the Supervisory actions panel.
            </p>
          ) : null}

          {plans.map((p) => {
            const planStatus = String(p.status ?? '').toUpperCase();
            const canOpenIntervention = ['APPROVED', 'ACTIVE'].includes(planStatus);
            const ivs = interventionsByPlan.get(p.id) ?? [];
            return (
              <div key={p.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{p.title}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className={ratingTone(p.priority)}>
                      {titleCase(p.priority)}
                    </Badge>
                    <Badge variant="outline" className={statusTone(p.status)}>
                      {titleCase(p.status)}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{p.reference}</span>
                  </span>
                </div>

                {canOpenIntervention && canCreate ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      setPlanTarget(p);
                      setDialog('intervention');
                    }}
                  >
                    Open supervisory intervention
                  </Button>
                ) : !canOpenIntervention ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Interventions can be opened once the plan is approved or active.
                  </p>
                ) : null}

                {ivs.length ? (
                  <div className="mt-3 space-y-2">
                    {ivs.map((iv) => {
                      const ivStatus = String(iv.status ?? '').toUpperCase();
                      const exam = iv.examination_id
                        ? examinations.find((e) => e.id === iv.examination_id) ?? examByIntervention.get(iv.id)
                        : examByIntervention.get(iv.id);
                      const execution = interventionExecutionContract(iv.intervention_type);
                      const needsExam = execution.executionKind === 'EXAMINATION' && !exam;
                      const lightweightNote = exam ? null : lightweightExecutionGuidance(iv.intervention_type);
                      return (
                        <div key={iv.id} className="rounded-md border bg-muted/30 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="font-medium">{iv.title}</span>
                            <span className="flex items-center gap-2">
                              <Badge variant="outline">{titleCase(iv.intervention_type)}</Badge>
                              <Badge variant="outline" className={statusTone(iv.status)}>
                                {titleCase(iv.status)}
                              </Badge>
                              <span className="font-mono text-xs text-muted-foreground">{iv.reference}</span>
                            </span>
                          </div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">
                            {fmtDate(iv.planned_start)} → {fmtDate(iv.planned_end)}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {ivStatus === 'PROPOSED' && canApprove ? (
                              <Button data-rbac="aml_supervision.approve"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setInterventionTarget(iv);
                                  setDialog('decide');
                                }}
                              >
                                Record endorsement decision
                              </Button>
                            ) : null}

                            {needsExam && ['ENDORSED', 'ACTIVE'].includes(ivStatus) && canExamine ? (
                              <Button data-rbac="aml_supervision.examine"
                                size="sm"
                                onClick={() => {
                                  setInterventionTarget(iv);
                                  setDialog('examination');
                                }}
                              >
                                Create examination
                              </Button>
                            ) : null}

                            {needsExam && !canExamine ? (
                              <Button data-rbac="aml_supervision.examine" size="sm" variant="outline" disabled>
                                <Lock className="mr-1.5 h-3.5 w-3.5" />
                                Requires the AML/CFT examine capability
                              </Button>
                            ) : null}

                            {exam ? (
                              <>
                                <Button size="sm" variant="outline" asChild>
                                  <Link to={`/supervision/examinations/${exam.id}`}>
                                    Open examination workspace <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                                {canExamine ? (
                                  <Button data-rbac="aml_supervision.examine" size="sm" variant="outline" onClick={() => setScopeTarget(exam)}>
                                    Set scope from assessment
                                  </Button>
                                ) : null}
                              </>
                            ) : null}
                          </div>

                          {exam ? (
                            <div className="mt-2 text-xs text-muted-foreground">
                              <span className="font-mono">{exam.reference}</span> · {titleCase(exam.stage)} ·{' '}
                              {exam.is_driving_assessment
                                ? 'driving assessment provenance recorded'
                                : 'linked provenance recorded'}
                              {exam.risk_focus_dimensions?.length
                                ? ` · risk focus: ${exam.risk_focus_dimensions.map(titleCase).join(', ')}`
                                : ''}
                              {exam.scope_dimensions?.length
                                ? ` · scope: ${exam.scope_dimensions
                                    .map((s: any) => titleCase(s.dimension_code))
                                    .join(', ')}`
                                : ' · scope not yet set'}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : canOpenIntervention ? (
                  <p className="mt-2 text-xs text-muted-foreground">No intervention opened under this plan yet.</p>
                ) : null}
              </div>
            );
          })}

          {!approved ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Interventions and examinations can only be driven by an approved assessment.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Examinations driven by this assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {examinations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No examination records this assessment as its origin. Examinations on the same entity that were driven by
              a different assessment are deliberately not shown here.
            </p>
          ) : (
            examinations.map((e) => (
              <Link
                key={e.id}
                to={`/supervision/examinations/${e.id}`}
                className="block rounded-md border p-3 text-sm hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{e.title || e.reference}</span>
                  <span className="flex items-center gap-2">
                    {e.is_driving_assessment ? <Badge variant="outline">Driving assessment</Badge> : null}
                    <Badge variant="outline" className={statusTone(e.stage)}>
                      {titleCase(e.stage)}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {fmtDate(e.fieldwork_start)} → {fmtDate(e.fieldwork_end)}
                    </span>
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="font-mono">{e.reference}</span>
                  {e.risk_focus_dimensions?.length
                    ? ` · risk focus: ${e.risk_focus_dimensions.map(titleCase).join(', ')}`
                    : ''}
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- dialogs --- */}

      <AmlActionDialog
        open={dialog === 'intervention'}
        onOpenChange={(o) => (o ? null : setDialog(null))}
        title="Open supervisory intervention"
        description={`The intervention is opened on ${entityName ?? 'this entity'} under plan ${
          planTarget?.reference ?? ''
        }, carrying the plan, attention and AML/CFT domain automatically.`}
        fields={[
          {
            name: 'intervention_type',
            label: 'Intervention type',
            kind: 'select',
            required: true,
            defaultValue: 'TARGETED_EXAMINATION',
            options: INTERVENTION_TYPES,
          },
          {
            name: 'title',
            label: 'Intervention title',
            kind: 'text',
            required: true,
            defaultValue: 'AML/CFT targeted examination',
          },
          {
            name: 'basis',
            label: 'Supervisory basis',
            kind: 'textarea',
            required: true,
            helper: 'At least 20 characters — the database enforces a substantive basis.',
          },
          { name: 'expected_outcome', label: 'Expected outcome', kind: 'textarea' },
          { name: 'planned_start', label: 'Planned start', kind: 'date', defaultValue: plusDays(14) },
          { name: 'planned_end', label: 'Planned end', kind: 'date', defaultValue: plusDays(45) },
        ]}
        submitLabel="Open intervention"
        onSubmit={async (v) =>
          openIntervention.mutateAsync({
            planId: planTarget.id,
            interventionType: v.intervention_type,
            title: v.title,
            basis: v.basis,
            entityId,
            attentionId: planTarget.attention_id ?? attention[0]?.id ?? null,
            expectedOutcome: v.expected_outcome || null,
            plannedStart: v.planned_start || null,
            plannedEnd: v.planned_end || null,
          })
        }
        onDone={() => done('Supervisory intervention opened.')}
      />

      <AmlActionDialog
        open={dialog === 'decide'}
        onOpenChange={(o) => (o ? null : setDialog(null))}
        title={`Decide intervention ${interventionTarget?.reference ?? ''}`}
        fields={[
          {
            name: 'decision',
            label: 'Decision',
            kind: 'select',
            required: true,
            defaultValue: 'ENDORSED',
            options: [
              { value: 'ENDORSED', label: 'Endorse' },
              { value: 'REJECTED', label: 'Reject' },
            ],
          },
          { name: 'rationale', label: 'Decision rationale', kind: 'textarea', required: true },
        ]}
        submitLabel="Record decision"
        onSubmit={async (v) =>
          decideIntervention.mutateAsync({
            interventionId: interventionTarget.id,
            decision: v.decision,
            rationale: v.rationale,
          })
        }
        onDone={() => done('Intervention decision recorded.')}
      />

      <AmlActionDialog
        open={dialog === 'examination'}
        onOpenChange={(o) => (o ? null : setDialog(null))}
        title="Create examination"
        description={`Opened from intervention ${
          interventionTarget?.reference ?? ''
        } — entity, AML/CFT domain, plan, intervention, attention and the originating assessment are carried automatically.`}
        fields={[
          {
            name: 'title',
            label: 'Examination title',
            kind: 'text',
            required: true,
            defaultValue: `AML/CFT examination — ${entityName ?? ''}`.trim(),
          },
          {
            name: 'engagement_type',
            label: 'Engagement type',
            kind: 'select',
            required: true,
            defaultValue: 'targeted',
            options: ENGAGEMENT_OPTIONS,
          },
          { name: 'period_start', label: 'Period under review — from', kind: 'date' },
          { name: 'period_end', label: 'Period under review — to', kind: 'date' },
        ]}
        submitLabel="Create examination"
        onSubmit={async (v) =>
          openExamination.mutateAsync({
            interventionId: interventionTarget.id,
            title: v.title,
            engagementType: v.engagement_type,
            entityId,
            assessmentId,
            riskFocusDimensionIds: dimensions
              .filter((d) => d.proposed_examination_scope)
              .map((d) => d.id),
            periodStart: v.period_start || null,
            periodEnd: v.period_end || null,
            triggerType: 'AML_RISK',
          })
        }
        onDone={() => done('Examination created with exact assessment provenance.')}
      />

      <ScopeDialog
        examination={scopeTarget}
        dimensions={dimensions}
        onClose={() => setScopeTarget(null)}
        onDone={() => {
          setScopeTarget(null);
          done('Examination scope recorded against the assessment dimensions.');
        }}
      />
    </div>
  );
}

/**
 * Scope selection. Dimensions proposed for examination scope during the
 * assessment are preselected, but supervisory judgment may add or remove any of
 * them; an area that is not assessment-derived is recorded separately as
 * EXAMINER_AMENDED with its own mandatory rationale.
 */
function ScopeDialog({
  examination,
  dimensions,
  onClose,
  onDone,
}: {
  examination: any | null;
  dimensions: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const scopeFromAssessment = useAmlExaminationScopeFromAssessment();
  const amendScope = useAmendAmlExaminationScope();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [rationale, setRationale] = useState('');
  const [amendCode, setAmendCode] = useState('');
  const [amendRationale, setAmendRationale] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  const open = !!examination;
  if (open && seeded !== examination.id) {
    const seed: Record<string, boolean> = {};
    dimensions.forEach((d) => {
      seed[d.id] =
        !!d.proposed_examination_scope ||
        (examination.scope_dimensions ?? []).some((s: any) => s.assessment_dimension_id === d.id);
    });
    setSelected(seed);
    setRationale('');
    setAmendCode('');
    setAmendRationale('');
    setError(null);
    setSeeded(examination.id);
  }

  const chosen = dimensions.filter((d) => selected[d.id]).map((d) => d.id);

  const submit = async () => {
    if (!chosen.length && !amendCode.trim()) {
      setError('Select at least one assessment dimension, or add an examiner-amended scope area.');
      return;
    }
    if (chosen.length && rationale.trim().length < 10) {
      setError('A scope rationale of at least 10 characters is required.');
      return;
    }
    if (amendCode.trim() && amendRationale.trim().length < 10) {
      setError('An examiner-amended scope area requires its own rationale of at least 10 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (chosen.length) {
        await scopeFromAssessment.mutateAsync({
          examinationId: examination.id,
          dimensionIds: chosen,
          rationale: rationale.trim(),
        });
      }
      if (amendCode.trim()) {
        const code = amendCode.trim().toUpperCase().replace(/\s+/g, '_');
        await amendScope.mutateAsync({
          examinationId: examination.id,
          areaCode: code,
          areaLabel: amendCode.trim(),
          rationale: amendRationale.trim(),
        });
      }
      onDone();
    } catch (e) {
      setError(amlErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Examination scope</DialogTitle>
          <DialogDescription>
            Dimensions proposed for examination during the assessment are preselected. Supervisory judgment may change
            the selection; the exact assessment and dimension are persisted as the scope's provenance.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-1">
          {dimensions.length === 0 ? (
            <p className="text-sm text-muted-foreground">This assessment has no recorded dimensions.</p>
          ) : (
            dimensions.map((d) => (
              <label
                key={d.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md border p-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Checkbox
                    checked={!!selected[d.id]}
                    onCheckedChange={(v) => setSelected((s) => ({ ...s, [d.id]: !!v }))}
                  />
                  <span>{titleCase(d.dimension_code)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {d.proposed_examination_scope ? (
                    <Badge variant="outline">Proposed at assessment</Badge>
                  ) : null}
                  <Badge variant="outline" className={ratingTone(d.residual_rating)}>
                    {titleCase(d.residual_rating)}
                  </Badge>
                </span>
              </label>
            ))
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="aml-scope-rationale">Scope rationale</Label>
          <Textarea
            id="aml-scope-rationale"
            rows={3}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Why these risk areas are in scope for this examination…"
          />
        </div>

        <div className="rounded-md border p-3">
          <p className="text-sm font-medium">Examiner-amended scope area (optional)</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Use this only for an area that is not derived from the assessment. It is recorded as EXAMINER_AMENDED and
            its rationale is mandatory.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="aml-scope-area">Scope area</Label>
            <input
              id="aml-scope-area"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={amendCode}
              onChange={(e) => setAmendCode(e.target.value)}
              placeholder="e.g. Correspondent banking"
            />
          </div>
          <div className="mt-2 space-y-1.5">
            <Label htmlFor="aml-scope-area-rationale">Amendment rationale</Label>
            <Textarea
              id="aml-scope-area-rationale"
              rows={2}
              value={amendRationale}
              onChange={(e) => setAmendRationale(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? 'Working…' : 'Record scope'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
