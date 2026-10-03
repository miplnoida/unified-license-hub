/**
 * Start a new AML/CFT risk assessment for a supervised entity.
 *
 * The entity list is the supervised portfolio the officer can already see, so
 * no entity is ever invented here. The methodology version is resolved by the
 * database from the entity's own supervisory context — never "the latest active
 * one" — through the same entity-context operation the creation routine uses.
 * The preview informs the officer; the server remains the authority.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Plus } from 'lucide-react';
import { AmlActionDialog } from '@/components/supervision/aml/AmlActionDialog';
import { useResolvedAmlMethodology } from '@/hooks/useAmlLifecycle';
import { useAmlPortfolio } from '@/hooks/useAmlSupervision';
import { useCan } from '@/hooks/useCan';
import { useCalculationReadiness } from '@/hooks/useSupervisoryCalculationConfig';
import {
  useAssessmentCreationEligibility,
  useCreateProgrammedAssessment,
  useEntityProgrammeOptions,
} from '@/hooks/useSupervisoryAssessmentProgrammes';

import { BLUE, fmtDate } from '@/lib/amlLabels';


interface Props {
  entityId?: string;
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline';
}

export function AmlNewAssessmentDialog({ entityId, label = 'New AML/CFT assessment', size = 'default', variant = 'default' }: Props) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenEntity, setChosenEntity] = useState<string>('');
  const [chosenProgramme, setChosenProgramme] = useState<string>('');
  const navigate = useNavigate();
  const createProgrammed = useCreateProgrammedAssessment();
  // Authority to initiate an assessment is a governed capability, not a screen
  // affordance. The server re-checks it; this only stops offering the control.
  const canCreate = useCan('aml_supervision', 'create');
  const { data: portfolio } = useAmlPortfolio(300);

  const targetEntity = entityId ?? chosenEntity;
  const { data: resolved, isLoading: resolving } = useResolvedAmlMethodology(targetEntity || null);
  const methodology = resolved?.methodology ?? null;
  const ambiguous = resolved?.status === 'AMBIGUOUS';
  const readiness = useCalculationReadiness('AML_CFT', methodology?.id ?? undefined);

  // Which assessments may be started, their permitted triggers and how the
  // review period is derived are all governed configuration resolved by the
  // server for this entity. Nothing is defaulted in the browser.
  const programmeOptions = useEntityProgrammeOptions(targetEntity || null, 'AML_CFT');
  const programmes = programmeOptions.data?.programmes ?? [];
  const programme = programmes.find((p) => p.programme_id === chosenProgramme) ?? null;
  const defaultTrigger =
    programme?.triggers.find((t) => t.is_default)?.trigger_code ??
    programme?.triggers[0]?.trigger_code ??
    '';
  // Where the approved programme derives the period and forbids adjustment, the
  // officer is shown the derived dates instead of editable date fields.
  const periodFixed = Boolean(
    programme &&
      !programme.period.manual_entry_required &&
      !programme.period.allow_manual_override,
  );
  const programmeUnavailable = programmeOptions.data?.mode === 'UNAVAILABLE';
  // Supervisory perimeter: the server enforces it on every assessment insert;
  // this only stops offering the action and explains why.
  const eligibility = useAssessmentCreationEligibility(targetEntity || null, 'AML_CFT');
  const perimeterBlocked = Boolean(targetEntity) && (eligibility.isError || eligibility.data?.allowed === false);


  const entityOptions = useMemo(
    () =>
      (portfolio ?? [])
        .map((r) => ({ value: r.entity_id, label: r.entity_name || r.entity_id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [portfolio],
  );

  const startFlow = () => {
    setChosenProgramme('');
    setPickerOpen(true);
  };

  if (!canCreate) return null;

  return (
    <>
      <Button size={size} variant={variant} onClick={startFlow}>
        <Plus className="mr-1.5 h-4 w-4" />
        {label}
      </Button>

      {/* Entity and programme are chosen first so the methodology and the governed
          assessment behaviour are both resolved before the working file exists —
          the officer never picks a methodology version. */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{entityId ? 'Select the assessment to start' : 'Select the supervised entity'}</DialogTitle>
            <DialogDescription>
              The platform resolves the currently effective AML/CFT methodology and the approved assessment programmes for
              this entity; the officer never picks a version.
            </DialogDescription>
          </DialogHeader>
          {!entityId ? (
            <div className="space-y-2">
              <Label htmlFor="aml-entity-pick">Supervised entity</Label>
              <Select
                value={chosenEntity}
                onValueChange={(v) => {
                  setChosenEntity(v);
                  setChosenProgramme('');
                }}
              >
                <SelectTrigger id="aml-entity-pick">
                  <SelectValue placeholder="Select an entity…" />
                </SelectTrigger>
                <SelectContent>
                  {entityOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {targetEntity && perimeterBlocked ? (
            <Alert variant="destructive" data-testid="aml-perimeter-refusal">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {eligibility.data?.reason ??
                  'AML/CFT supervisory applicability has not been established for this entity.'}
              </AlertDescription>
            </Alert>
          ) : null}

          {targetEntity && !perimeterBlocked ? (
            programmeOptions.isLoading ? (
              <p className="text-sm text-muted-foreground">Resolving the approved assessment programmes…</p>
            ) : programmeUnavailable ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{programmeOptions.data?.reason}</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="aml-programme-pick">Assessment</Label>
                <Select value={chosenProgramme} onValueChange={setChosenProgramme}>
                  <SelectTrigger id="aml-programme-pick">
                    <SelectValue placeholder="Select the assessment to start…" />
                  </SelectTrigger>
                  <SelectContent>
                    {programmes.map((p) => (
                      <SelectItem key={p.programme_id} value={p.programme_id} disabled={p.selectable === false}>
                        {p.label}
                        {p.selectable === false ? ' — not available' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {programme?.guidance ? (
                  <p className="text-xs text-muted-foreground">{programme.guidance}</p>
                ) : null}
                {programme && programme.selectable === false ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription data-testid="aml-programme-refusal">
                      {programme.reason ?? 'This assessment cannot be started for this entity yet.'}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {programme?.requires_prior_assessment ? (
                  <p className="text-xs text-muted-foreground" data-testid="aml-prior-assessment">
                    {programme.prior_assessment_id
                      ? `Builds on the previous assessment ${programme.prior_assessment_reference ?? programme.prior_assessment_id}.`
                      : 'This assessment needs a previous assessment of this entity, and none was found.'}
                  </p>
                ) : null}
                {programme?.requires_trigger_signal ? (
                  <p className="text-xs text-muted-foreground" data-testid="aml-signal-required">
                    The triggering signal or event must already be recorded for this entity; the platform will
                    refuse to create the assessment otherwise.
                  </p>
                ) : null}
                {programmeOptions.data?.compatibility_notice ? (
                  <p className="text-xs text-muted-foreground">{programmeOptions.data.compatibility_notice}</p>
                ) : null}
              </div>
            )

          ) : null}


          {targetEntity ? (
            resolving ? (
              <p className="text-sm text-muted-foreground">Resolving the applicable methodology…</p>
            ) : ambiguous ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  The AML/CFT methodology configuration is ambiguous for this entity: more than one active version applies
                  with equal specificity. A methodology owner must scope or supersede one of them before an assessment can
                  be created.
                </AlertDescription>
              </Alert>
            ) : methodology ? (
              <Alert>
                <AlertDescription className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={BLUE}>
                      {methodology.code} v{methodology.version}
                    </Badge>
                    <span className="text-sm">{methodology.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Status {methodology.status} · effective from {fmtDate(methodology.effective_from)}
                  </p>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No currently effective AML/CFT methodology applies to this entity. A methodology owner must publish an
                  applicable active version before an assessment can be created.
                </AlertDescription>
              </Alert>
            )
          ) : null}

          {/* Calculation readiness is stated plainly: the assessment may still be
              created, but the platform does not pretend a calculated
              recommendation will exist. */}
          {methodology && !readiness.isLoading && readiness.data && !readiness.data.ready ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-1">
                <p className="text-sm">
                  No methodology calculation will be produced for this assessment; ratings will be supervisory
                  judgement only.
                </p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {readiness.data.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}


          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!targetEntity || perimeterBlocked || eligibility.isLoading || !programme || programme.selectable === false || !methodology || ambiguous || resolving || programmeOptions.isLoading}
              onClick={() => {
                setPickerOpen(false);
                setOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AmlActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Start an AML/CFT risk assessment"
        description={
          [
            methodology
              ? `The assessment is created in draft on ${methodology.code} v${methodology.version}, ready for its risk and control ratings.`
              : 'The assessment is created in draft against the applicable AML/CFT methodology.',
            periodFixed
              ? `The review period is set by the approved programme: ${fmtDate(programme?.period.suggested_period_start ?? null)} to ${fmtDate(programme?.period.suggested_period_end ?? null)}.`
              : null,
          ].filter(Boolean).join(' ')
        }

        fields={[
          {
            name: 'trigger_type',
            label: 'Trigger',
            kind: 'select',
            required: true,
            defaultValue: defaultTrigger,
            options: (programme?.triggers ?? [])
              .filter((t) => t.is_active !== false)
              .map((t) => ({
                value: t.trigger_code,
                label: t.label || t.trigger_code,
              })),
          },
          // The dates are only asked for where the approved programme permits the
          // officer to set or adjust them. Where the programme fixes the period,
          // the derived dates are stated above and sent as resolved by the server.
          ...(periodFixed ? [] : [
            {
              name: 'period_start' as const,
              label: 'Review period from',
              kind: 'date' as const,
              required: true,
              defaultValue: programme?.period.suggested_period_start ?? '',
            },
            {
              name: 'period_end' as const,
              label: 'Review period to',
              kind: 'date' as const,
              required: true,
              defaultValue: programme?.period.suggested_period_end ?? '',
            },
          ]),
          {
            name: 'summary',
            label: 'Scope and summary',
            kind: 'textarea',
            required: Boolean(programme?.summary_required),
          },
        ]}
        submitLabel="Create assessment"
        onSubmit={async (v) => {
          // The programme decides the assessment type, the permitted triggers and
          // how the review period is derived. The server re-applies every one of
          // those rules and is authoritative if the configuration changed.
          const result: any = await createProgrammed.mutateAsync({
            entityId: targetEntity,
            domainCode: 'AML_CFT',
            programmeId: programme!.programme_id,
            triggerType: v.trigger_type,
            periodStart: periodFixed ? null : v.period_start || null,
            periodEnd: periodFixed ? null : v.period_end || null,
            summary: v.summary,
            triggerSignalId: null,
          });
          const id = result?.id ?? null;
          const boundVersion = result?.methodology_version ?? null;
          toast.success(
            boundVersion
              ? `AML/CFT assessment created in draft on methodology version ${boundVersion}.`
              : 'AML/CFT assessment created in draft.',
          );
          if (id) navigate(`/supervision/aml/assessments/${id}`);
          return result;
        }}


      />

    </>
  );
}
