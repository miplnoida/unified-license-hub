/**
 * Start a new AML/CFT risk assessment for a supervised entity.
 *
 * The entity list is the supervised portfolio the officer can already see, so
 * no entity is ever invented here. The methodology version is resolved by the
 * database from domain, sector and effective date — never "the latest active
 * one" — and creation is blocked outright when no version applies.
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
import { AlertTriangle } from 'lucide-react';
import { AmlActionDialog } from '@/components/supervision/aml/AmlActionDialog';
import { useCreateAmlAssessment, useResolvedAmlMethodology } from '@/hooks/useAmlLifecycle';
import { useAmlPortfolio } from '@/hooks/useAmlSupervision';
import { useCan } from '@/hooks/useCan';
import { useCalculationReadiness } from '@/hooks/useSupervisoryCalculationConfig';

import { BLUE, fmtDate } from '@/lib/amlLabels';

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

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
  const navigate = useNavigate();
  const create = useCreateAmlAssessment();
  // Authority to initiate an assessment is a governed capability, not a screen
  // affordance. The server re-checks it; this only stops offering the control.
  const canCreate = useCan('aml_supervision', 'create');
  const { data: portfolio } = useAmlPortfolio(300);

  const targetEntity = entityId ?? chosenEntity;
  const { data: resolved, isLoading: resolving } = useResolvedAmlMethodology(targetEntity || null);
  const methodology = resolved?.methodology ?? null;
  const readiness = useCalculationReadiness('AML_CFT', methodology?.id ?? undefined);


  const entityOptions = useMemo(
    () =>
      (portfolio ?? [])
        .map((r) => ({ value: r.entity_id, label: r.entity_name || r.entity_id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [portfolio],
  );

  const prior = useMemo(
    () => (portfolio ?? []).find((r) => r.entity_id === targetEntity)?.last_assessment_id ?? null,
    [portfolio, targetEntity],
  );

  const startFlow = () => {
    if (entityId) {
      setOpen(true);
      return;
    }
    setPickerOpen(true);
  };

  if (!canCreate) return null;

  return (
    <>
      <Button size={size} variant={variant} onClick={startFlow}>
        {label}
      </Button>

      {/* Entity is chosen first so the methodology can be resolved before the
          working file is created — the officer never picks a version. */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select the supervised entity</DialogTitle>
            <DialogDescription>
              The applicable AML/CFT methodology version is resolved from the entity's sector and the effective date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="aml-entity-pick">Supervised entity</Label>
            <Select value={chosenEntity} onValueChange={setChosenEntity}>
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

          {chosenEntity ? (
            resolving ? (
              <p className="text-sm text-muted-foreground">Resolving the applicable methodology…</p>
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
                  No AML/CFT methodology is applicable to this entity on this date. A methodology owner must publish an
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
              disabled={!chosenEntity || !methodology || resolving}
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
          methodology
            ? `The assessment is created in draft on ${methodology.code} v${methodology.version}, ready for its risk and control ratings.`
            : 'The assessment is created in draft against the applicable AML/CFT methodology.'
        }

        fields={[
          {
            name: 'assessment_type',
            label: 'Assessment type',
            kind: 'select',
            required: true,
            defaultValue: 'PERIODIC',
            options: [
              { value: 'PERIODIC', label: 'Periodic' },
              { value: 'INITIAL_BASELINE', label: 'Initial baseline' },
              { value: 'FOLLOW_UP', label: 'Follow-up' },
              { value: 'EVENT_DRIVEN', label: 'Event driven' },
            ],
          },
          {
            name: 'trigger_type',
            label: 'Trigger',
            kind: 'select',
            defaultValue: 'PERIODIC',
            options: [
              { value: 'PERIODIC', label: 'Periodic cycle' },
              { value: 'REASSESSMENT', label: 'Reassessment requirement' },
              { value: 'EVENT_DRIVEN', label: 'Event or intelligence' },
              { value: 'FOLLOW_UP', label: 'Follow-up of prior assessment' },
              { value: 'THEMATIC', label: 'Thematic review' },
            ],
          },
          { name: 'period_start', label: 'Review period from', kind: 'date', required: true, defaultValue: isoDaysAgo(365) },
          { name: 'period_end', label: 'Review period to', kind: 'date', required: true, defaultValue: isoDaysAgo(1) },
          { name: 'summary', label: 'Scope and summary', kind: 'textarea', required: true },
        ]}
        submitLabel="Create assessment"
        onSubmit={async (v) => {
          if (!methodology) {
            throw new Error(
              'No AML/CFT methodology is applicable to this entity on this date. A methodology owner must publish an applicable active version before an assessment can be created.',
            );
          }
          const result: any = await create.mutateAsync({
            entityId: targetEntity,
            methodologyId: methodology.id,
            assessmentType: v.assessment_type,
            triggerType: v.trigger_type,
            periodStart: v.period_start || null,
            periodEnd: v.period_end || null,
            summary: v.summary,
            supersedesId: v.assessment_type === 'FOLLOW_UP' ? prior : null,
          });
          const id = result?.id ?? null;
          toast.success('AML/CFT assessment created in draft.');
          if (id) navigate(`/supervision/aml/assessments/${id}`);
          return result;
        }}

      />
    </>
  );
}
