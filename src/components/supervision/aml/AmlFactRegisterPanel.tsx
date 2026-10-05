/**
 * Structured facts for one assessment.
 *
 * A fact is a typed, dated value with a stated source — not a sentence inside a
 * narrative. The methodology version attached to the assessment decides which
 * facts exist, what type each is, whether the platform may propose a value and
 * whether the officer may change it. Where the platform proposes a value, the
 * proposal is kept alongside the officer's value, and changing it always needs a
 * written reason. A fact never becomes a supervisory answer or a rating.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';
import {
  evidenceErrorMessage,
  useAssessmentFactRegister,
  useOverrideAssessmentFact,
  useSetAssessmentFact,
  type AssessmentFactRow,
} from '@/hooks/useAssessmentEvidenceBasis';
import { AMBER, EMERALD, NEUTRAL } from '@/lib/amlLabels';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useAssessmentConfigurationAuthority,
  type GovernedFactRow,
} from '@/hooks/useAssessmentConfigurationAuthority';

interface Props {
  assessmentId: string;
  editable: boolean;
}

const typeHint = (row: AssessmentFactRow): string => {
  const t = (row.data_type ?? '').toLowerCase();
  if (t.includes('percent')) return 'Enter a percentage between 0 and 100.';
  if (t.includes('integer') || t.includes('whole')) return 'Enter a whole number.';
  if (t === 'date') return 'Enter a date.';
  if (t.includes('bool') || t.includes('yes')) return 'Enter yes or no.';
  if (t.includes('currency')) return 'Enter an amount.';
  if (t.includes('decimal') || t.includes('numeric') || t.includes('ratio')) return 'Enter a number.';
  return 'Enter the recorded value.';
};

/**
 * The value the platform proposed, exactly as the platform recorded it. This is
 * never recomputed here: it is kept so the officer's change and the original
 * proposal are both visible.
 */
const proposedValue = (row: AssessmentFactRow): string | null => {
  const sv = row.system_value;
  if (!sv || typeof sv !== 'object') return null;
  const v = (sv as Record<string, unknown>).value;
  return v == null ? null : String(v);
};

const SOURCE_KINDS = ['RETURN', 'FORM', 'MANUAL', 'EXTERNAL', 'DERIVED'];
const SOURCE_LABEL: Record<string, string> = {
  RETURN: 'Regulatory return', FORM: 'Form submission', MANUAL: 'Officer entry',
  EXTERNAL: 'External source', DERIVED: 'Derived by the platform',
};

export function AmlFactRegisterPanel({ assessmentId, editable }: Props) {
  const { data, isLoading } = useAssessmentFactRegister(assessmentId);
  const authority = useAssessmentConfigurationAuthority(assessmentId);
  const [target, setTarget] = useState<AssessmentFactRow | null>(null);
  const factGoverned = authority.data?.fact_config.status === 'GOVERNED';
  const governedByCode = new Map<string, GovernedFactRow>(
    (authority.data?.facts ?? []).map((f) => [f.fact_code, f]),
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Structured facts</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const rows = data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Structured facts</CardTitle>
          <Badge variant="outline" className={`${NEUTRAL} text-[10px]`}>
            {rows.filter((r) => r.recorded).length} of {rows.length} recorded
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The methodology version attached to this assessment defines no structured facts.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.fact_requirement_id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.label || r.fact_code}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={`${NEUTRAL} font-mono text-[10px]`}>{r.fact_code}</Badge>
                    <Badge variant="outline" className={`${NEUTRAL} text-[10px]`}>{r.data_type}</Badge>
                    {r.unit ? <Badge variant="outline" className={`${NEUTRAL} text-[10px]`}>{r.unit}</Badge> : null}
                    {(factGoverned ? governedByCode.get(r.fact_code)?.required : r.is_required)
                      ? <Badge variant="outline" className={AMBER}>Required</Badge> : null}
                    {factGoverned && governedByCode.get(r.fact_code)?.permitted === false ? (
                      <Badge variant="outline" className={NEUTRAL} data-testid={`fact-not-permitted-${r.fact_code}`}>
                        Not used by the governing fact settings
                      </Badge>
                    ) : null}
                    {r.recorded ? (
                      <Badge variant="outline" className={EMERALD}>
                        {r.value ?? '—'}{r.numerator != null && r.denominator != null ? ` (${r.numerator}/${r.denominator})` : ''}
                      </Badge>
                    ) : null}
                    {r.officer_overridden ? <Badge variant="outline" className={AMBER}>Officer value</Badge> : null}
                    {r.auto_prefilled ? <Badge variant="outline" className={`${NEUTRAL} text-[10px]`}>Proposed by the platform</Badge> : null}
                  </div>
                  {r.recorded ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Source: {r.source_type ?? 'not stated'}
                      {r.source_reference ? ` · ${r.source_reference}` : ''}
                      {r.as_of_date ? ` · as at ${r.as_of_date}` : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">{r.description || 'Not recorded yet.'}</p>
                  )}
                  {r.officer_overridden ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Platform proposed: {proposedValue(r) ?? 'not stated'} · officer value: {r.value ?? '—'}
                    </p>
                  ) : null}
                  {r.officer_overridden && r.override_reason ? (
                    <p className="mt-1 text-xs text-muted-foreground">Change explained: {r.override_reason}</p>
                  ) : null}
                </div>
                {editable && !(factGoverned && governedByCode.get(r.fact_code)?.permitted === false) ? (
                  <Button data-rbac="aml_supervision.edit" type="button" size="sm" variant="outline"
                    onClick={() => setTarget(r)}>
                    {r.recorded ? (r.auto_prefilled ? 'Change value' : 'Update') : 'Record'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Facts support supervisory judgement. They are never treated as an answer, a rating or a conclusion.
        </p>
      </CardContent>

      {target && authority.data ? (
        <FactDialog
          assessmentId={assessmentId}
          row={target}
          governed={governedByCode.get(target.fact_code)}
          sourceGoverned={authority.data.source_binding.status === 'GOVERNED'}
          onClose={() => setTarget(null)}
        />
      ) : target ? (
        // Fail closed: never offer a free-text source while the permitted sources are unknown.
        <Dialog open onOpenChange={(o) => (o ? null : setTarget(null))}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{target.label || target.fact_code}</DialogTitle>
              <DialogDescription>
                {authority.isError
                  ? 'The permitted sources for this fact could not be loaded, so the value cannot be recorded right now. Close this window and try again.'
                  : 'Loading the sources this fact may come from…'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="fact-source">Where the value comes from</Label>
              <Input id="fact-source" aria-label="Where the value comes from" disabled value="" placeholder={authority.isError ? 'Unavailable' : 'Loading…'} readOnly />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </Card>
  );
}

function FactDialog({
  assessmentId, row, onClose, governed, sourceGoverned,
}: {
  assessmentId: string; row: AssessmentFactRow; onClose: () => void;
  governed?: GovernedFactRow; sourceGoverned: boolean;
}) {
  const set = useSetAssessmentFact(assessmentId);
  const override = useOverrideAssessmentFact(assessmentId);
  // Display only: the server re-checks every source against the pinned settings.
  const sourceChoices: string[] | null = governed?.allowed_sources?.length
    ? Array.from(new Set(governed.allowed_sources.map((s) => s.source_kind)))
    : sourceGoverned ? SOURCE_KINDS : null;
  const [value, setValue] = useState(row.value ?? '');
  const [numerator, setNumerator] = useState(row.numerator != null ? String(row.numerator) : '');
  const [denominator, setDenominator] = useState(row.denominator != null ? String(row.denominator) : '');
  const [sourceType, setSourceType] = useState(
    row.source_type ?? (sourceChoices ? sourceChoices[0] : 'OFFICER_ENTERED'),
  );
  const [sourceReference, setSourceReference] = useState(row.source_reference ?? '');
  const [asOf, setAsOf] = useState(row.as_of_date ?? '');
  const [note, setNote] = useState(row.note ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ratio = !!(row.numerator_basis || row.denominator_basis);
  const overriding = row.recorded && row.auto_prefilled && !!row.fact_id;

  const submit = async () => {
    setError(null);
    try {
      if (overriding) {
        await override.mutateAsync({
          factId: row.fact_id as string,
          value,
          numerator: numerator || null,
          denominator: denominator || null,
          sourceType,
          sourceReference: sourceReference || null,
          reason,
        });
        toast.success(`${row.fact_code} changed — the platform's proposed value is retained.`);
      } else {
        await set.mutateAsync({
          assessmentId,
          factRequirementId: row.fact_requirement_id,
          factCode: row.fact_code,
          value,
          numerator: numerator || null,
          denominator: denominator || null,
          unit: row.unit,
          sourceType,
          sourceReference: sourceReference || null,
          asOfDate: asOf || null,
          note: note || null,
        });
        toast.success(`${row.fact_code} recorded.`);
      }
      onClose();
    } catch (e) {
      setError(evidenceErrorMessage(e));
    }
  };

  const busy = set.isPending || override.isPending;

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row.label || row.fact_code}</DialogTitle>
          <DialogDescription>
            {typeHint(row)}{' '}
            {overriding
              ? 'This value was proposed by the platform; the original is kept and your change must be explained.'
              : 'State where the value comes from — a fact without a source cannot support a supervisory judgement.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fact-value">Value{row.unit ? ` (${row.unit})` : ''}</Label>
            <Input id="fact-value" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          {ratio ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fact-num">Numerator{row.numerator_basis ? ` — ${row.numerator_basis}` : ''}</Label>
                <Input id="fact-num" value={numerator} onChange={(e) => setNumerator(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fact-den">Denominator{row.denominator_basis ? ` — ${row.denominator_basis}` : ''}</Label>
                <Input id="fact-den" value={denominator} onChange={(e) => setDenominator(e.target.value)} />
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fact-source">Where the value comes from</Label>
              {sourceChoices ? (
                <Select value={sourceType} onValueChange={(v) => {
                  setSourceType(v);
                  const ref = governed?.allowed_sources?.find((s) => s.source_kind === v)?.source_reference;
                  if (ref && !sourceReference) setSourceReference(ref);
                }}>
                  <SelectTrigger id="fact-source" aria-label="Where the value comes from"><SelectValue placeholder="Choose a source" /></SelectTrigger>
                  <SelectContent>
                    {sourceChoices.map((k) => (
                      <SelectItem key={k} value={k}>{SOURCE_LABEL[k] ?? k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="fact-source" value={sourceType} onChange={(e) => setSourceType(e.target.value)} />
              )}
              {governed?.allowed_sources?.length ? (
                <p className="text-xs text-muted-foreground">
                  The governing source settings accept only these sources for this fact.
                </p>
              ) : row.source_type_expectation?.length ? (
                <p className="text-xs text-muted-foreground">
                  The methodology expects: {row.source_type_expectation.join(', ')}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fact-ref">Source reference</Label>
              <Input id="fact-ref" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} />
            </div>
          </div>
          {!overriding ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fact-asof">As at</Label>
                <Input id="fact-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fact-note">Note</Label>
                <Input id="fact-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="fact-reason">Why are you changing the proposed value?</Label>
              <Textarea id="fact-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}

          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            data-rbac="aml_supervision.edit"
            type="button"
            size="sm"
            disabled={busy || (overriding && !reason.trim())}
            onClick={submit}
          >
            {busy ? 'Saving…' : overriding ? 'Record my value' : 'Record fact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
