/**
 * Programme editor — the governed configuration of one assessment a regulator runs.
 *
 * Every vocabulary on this form (assessment types, period rules, question
 * classes) is the server's own catalogue, returned by
 * `supervisory_assessment_programme_register_options`. The form adapts to the
 * chosen period rule, but the server validates the final configuration and is
 * the only authority on whether it may be saved, submitted or approved.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  useUpsertProgramme,
  type Programme, type ProgrammeRegisterOptions,
} from '@/hooks/useSupervisoryAssessmentProgrammes';
import { humanize } from '@/components/admin/supervisory-policy-profile/labels';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setId: string;
  programme?: Programme | null;
  options?: ProgrammeRegisterOptions;
}

const blank = {
  programme_code: '', label: '', description: '', assessment_type: '', sort_order: '100',
  is_active: true, recurrence_months: '', summary_required: true,
  period_rule: '', period_value: '', end_offset_days: '0', allow_manual_override: true,
  requires_prior_assessment: false, requires_trigger_signal: false,
  question_class_scope: ['CORE'] as string[], guidance: '', rationale: '',
};

export function ProgrammeEditorDialog({ open, onOpenChange, setId, programme, options }: Props) {
  const upsert = useUpsertProgramme();
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  const periodRules = options?.period_rules ?? [];
  const questionClasses = options?.question_classes ?? [];
  const assessmentTypes = options?.assessment_types ?? [];
  const rule = periodRules.find((r) => r.code === f.period_rule);
  const needsValue = Boolean(rule?.requires_value)
    || f.period_rule === 'TRAILING_DAYS' || f.period_rule === 'TRAILING_MONTHS' || f.period_rule === 'EVENT_WINDOW';
  const manualOnly = f.period_rule === 'MANUAL_REQUIRED';

  useEffect(() => {
    if (!open) return;
    setError(null);
    setF(programme ? {
      programme_code: programme.programme_code, label: programme.label,
      description: programme.description ?? '', assessment_type: programme.assessment_type,
      sort_order: String(programme.sort_order ?? 100), is_active: programme.is_active,
      recurrence_months: programme.recurrence_months == null ? '' : String(programme.recurrence_months),
      summary_required: programme.summary_required,
      period_rule: programme.period_rule,
      period_value: programme.period_value == null ? '' : String(programme.period_value),
      end_offset_days: String(programme.end_offset_days ?? 0),
      allow_manual_override: programme.allow_manual_override,
      requires_prior_assessment: programme.requires_prior_assessment,
      requires_trigger_signal: programme.requires_trigger_signal,
      question_class_scope: programme.question_class_scope ?? ['CORE'],
      guidance: programme.guidance ?? '', rationale: '',
    } : {
      ...blank,
      assessment_type: assessmentTypes[0]?.code ?? '',
      period_rule: periodRules[0]?.code ?? '',
    });
  }, [open, programme, assessmentTypes.length, periodRules.length]);

  const toggleClass = (code: string, on: boolean) =>
    setF((p) => ({
      ...p,
      question_class_scope: on
        ? Array.from(new Set([...p.question_class_scope, code]))
        : p.question_class_scope.filter((c) => c !== code),
    }));

  const submit = async () => {
    setError(null);
    try {
      await upsert.mutateAsync({
        setId,
        payload: {
          id: programme?.id ?? null,
          programme_code: f.programme_code.trim(), label: f.label.trim(),
          description: f.description.trim() || null,
          assessment_type: f.assessment_type,
          is_active: f.is_active,
          sort_order: Number(f.sort_order) || 100,
          recurrence_months: f.recurrence_months === '' ? null : Number(f.recurrence_months),
          summary_required: f.summary_required,
          period_rule: f.period_rule,
          period_value: manualOnly || f.period_value === '' ? null : Number(f.period_value),
          end_offset_days: Number(f.end_offset_days) || 0,
          allow_manual_override: manualOnly ? true : f.allow_manual_override,
          requires_prior_assessment: f.requires_prior_assessment,
          requires_trigger_signal: f.requires_trigger_signal,
          question_class_scope: f.question_class_scope,
          guidance: f.guidance.trim() || null,
          rationale: f.rationale.trim() || null,
        },
      });
      toast.success(programme ? 'Programme updated.' : 'Programme added.');
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'The programme could not be saved.');
    }
  };

  const ready = f.programme_code.trim() !== '' && f.label.trim() !== ''
    && f.assessment_type !== '' && f.period_rule !== ''
    && f.question_class_scope.length > 0
    && (!needsValue || Number(f.period_value) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{programme ? 'Edit programme' : 'Add programme'}</DialogTitle>
          <DialogDescription>
            This configuration decides what an officer may start for a supervised entity, which
            triggers are accepted and how the review period is derived.
          </DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <p className="text-sm font-medium sm:col-span-2">Identity</p>
            <div className="space-y-1.5">
              <Label htmlFor="pg-code">Programme code</Label>
              <Input id="pg-code" value={f.programme_code}
                onChange={(e) => setF({ ...f, programme_code: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-label">Label</Label>
              <Input id="pg-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pg-description">Description</Label>
              <Textarea id="pg-description" rows={2} value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-sort">Display order</Label>
              <Input id="pg-sort" type="number" value={f.sort_order}
                onChange={(e) => setF({ ...f, sort_order: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="pg-active" checked={f.is_active}
                onCheckedChange={(v) => setF({ ...f, is_active: v })} />
              <Label htmlFor="pg-active">Available to officers</Label>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <p className="text-sm font-medium sm:col-span-2">Assessment behaviour</p>
            <div className="space-y-1.5">
              <Label htmlFor="pg-type">Assessment type</Label>
              <Select value={f.assessment_type} onValueChange={(v) => setF({ ...f, assessment_type: v })}>
                <SelectTrigger id="pg-type"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {assessmentTypes.map((t) => (
                    <SelectItem key={t.code} value={t.code}>{t.label || humanize(t.code)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-recurrence">Recurrence (months)</Label>
              <Input id="pg-recurrence" type="number" value={f.recurrence_months}
                onChange={(e) => setF({ ...f, recurrence_months: e.target.value })}
                placeholder="Leave blank if it does not recur" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch id="pg-summary" checked={f.summary_required}
                onCheckedChange={(v) => setF({ ...f, summary_required: v })} />
              <Label htmlFor="pg-summary">A scope and summary must be entered when starting</Label>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <p className="text-sm font-medium sm:col-span-2">Review period</p>
            <div className="space-y-1.5">
              <Label htmlFor="pg-rule">Period rule</Label>
              <Select value={f.period_rule} onValueChange={(v) => setF({ ...f, period_rule: v })}>
                <SelectTrigger id="pg-rule"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {periodRules.map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.label || humanize(r.code)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rule?.description ? (
                <p className="text-xs text-muted-foreground">{rule.description}</p>
              ) : null}
            </div>
            {needsValue ? (
              <div className="space-y-1.5">
                <Label htmlFor="pg-value">
                  {f.period_rule === 'TRAILING_MONTHS' ? 'Number of months' : 'Number of days'}
                </Label>
                <Input id="pg-value" type="number" min={1} value={f.period_value}
                  onChange={(e) => setF({ ...f, period_value: e.target.value })} />
                {Number(f.period_value) <= 0 ? (
                  <p className="text-xs text-destructive">This period rule needs a positive value.</p>
                ) : null}
              </div>
            ) : null}
            {manualOnly ? (
              <p className="text-xs text-muted-foreground sm:col-span-2" data-testid="pg-manual-note">
                The officer enters the review period; no period is derived, so manual entry stays permitted.
              </p>
            ) : null}
            {f.period_rule === 'PRIOR_ASSESSMENT_FORWARD' ? (
              <p className="text-xs text-muted-foreground sm:col-span-2" data-testid="pg-prior-note">
                The period starts the day after the previous assessment period, so a previous assessment
                of the entity is needed.
              </p>
            ) : null}
            {f.period_rule === 'EVENT_WINDOW' ? (
              <p className="text-xs text-muted-foreground sm:col-span-2" data-testid="pg-event-note">
                The period is a window of the stated length around the triggering event.
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="pg-offset">Ends this many days before the start date</Label>
              <Input id="pg-offset" type="number" value={f.end_offset_days}
                onChange={(e) => setF({ ...f, end_offset_days: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="pg-manual" checked={manualOnly ? true : f.allow_manual_override}
                disabled={manualOnly}
                onCheckedChange={(v) => setF({ ...f, allow_manual_override: v })} />
              <Label htmlFor="pg-manual">The officer may adjust the dates</Label>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <p className="text-sm font-medium sm:col-span-2">Dependencies</p>
            <div className="flex items-center gap-2">
              <Switch id="pg-prior" checked={f.requires_prior_assessment}
                onCheckedChange={(v) => setF({ ...f, requires_prior_assessment: v })} />
              <Label htmlFor="pg-prior">Requires a previous assessment</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="pg-signal" checked={f.requires_trigger_signal}
                onCheckedChange={(v) => setF({ ...f, requires_trigger_signal: v })} />
              <Label htmlFor="pg-signal">Requires the triggering signal to be recorded</Label>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium">Question scope</p>
            <div className="flex flex-wrap gap-4">
              {questionClasses.map((q) => (
                <label key={q.code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={f.question_class_scope.includes(q.code)}
                    aria-label={q.label || humanize(q.code)}
                    onCheckedChange={(v) => toggleClass(q.code, v === true)} />
                  {q.label || humanize(q.code)}
                </label>
              ))}
            </div>
            {f.question_class_scope.length === 0 ? (
              <p className="text-xs text-destructive">At least one question class must be in scope.</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Which individual questions apply within these classes is decided by the methodology, not here.
            </p>
          </section>

          {programme && ((programme.included_dimension_codes?.length ?? 0) > 0
            || (programme.excluded_dimension_codes?.length ?? 0) > 0) ? (
            <section className="space-y-1">
              <p className="text-sm font-medium">Advanced scope</p>
              <p className="text-xs text-muted-foreground" data-testid="pg-dimension-scope">
                Dimensions included: {programme.included_dimension_codes?.join(', ') || 'all'} · excluded:{' '}
                {programme.excluded_dimension_codes?.join(', ') || 'none'}. Dimension-level scoping is
                recorded but is not yet editable here; it is validated against the methodology in a later wave.
              </p>
            </section>
          ) : null}

          <section className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pg-guidance">Guidance for officers</Label>
              <Textarea id="pg-guidance" rows={2} value={f.guidance}
                onChange={(e) => setF({ ...f, guidance: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-rationale">Reason</Label>
              <Textarea id="pg-rationale" rows={2} value={f.rationale}
                onChange={(e) => setF({ ...f, rationale: e.target.value })} />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!ready || upsert.isPending} onClick={submit}>
            {programme ? 'Save programme' : 'Add programme'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
