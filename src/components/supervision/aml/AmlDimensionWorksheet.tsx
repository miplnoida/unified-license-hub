/**
 * The AML/CFT assessment working file.
 *
 * The methodology version attached to the assessment is the working file: every
 * configured dimension is rendered with its own guidance, mandatory questions,
 * data sources and evidence requirement, and the officer edits an existing
 * dimension rather than inventing a code. Calculated recommendations are shown
 * only where the methodology actually produced one; supervisory judgment is
 * captured separately, and a departure from the recommendation demands a
 * rationale before it can be saved.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import {
  CONTROL_OPTIONS,
  GRADE_OPTIONS,
  RATING_OPTIONS,
  TREND_OPTIONS,
} from '@/components/supervision/aml/AmlActionDialog';
import { AmlDimensionQuestions } from '@/components/supervision/aml/AmlDimensionQuestions';
import { AmlEvidenceLinker, type AmlEvidenceRef } from '@/components/supervision/aml/AmlEvidenceLinker';
import {
  amlErrorMessage,
  useAmlMethodologyDimensions,
  useAmlMethodologyQuestions,
  useAmlQuestionResponses,
  useSaveAmlDimension,
  type AmlMethodologyDimension,
  type AmlMethodologyQuestion,
  type AmlQuestionResponse,
} from '@/hooks/useAmlLifecycle';
import {
  computeQuestionGaps,
  evidenceCount,
  isAssessed,
  isOverride,
  matchRecorded,
  type RecordedDimension,
} from '@/lib/amlAssessmentReadiness';

import { AMBER, EMERALD, NEUTRAL, ratingTone, titleCase } from '@/lib/amlLabels';

interface Props {
  assessmentId: string;
  entityId: string;
  methodologyId: string | null;
  recorded: RecordedDimension[];
  editable: boolean;
  onChanged: () => void;
}

const GROUP_LABEL: Record<string, string> = {
  INHERENT_RISK: 'Inherent risk',
  CONTROL_EFFECTIVENESS: 'Control effectiveness',
};

const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : String((v as any)?.text ?? v)));
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(String);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
};

export function AmlDimensionWorksheet({ assessmentId, entityId, methodologyId, recorded, editable, onChanged }: Props) {
  const { data: dimensions, isLoading } = useAmlMethodologyDimensions(methodologyId);
  const { data: questionCatalogue } = useAmlMethodologyQuestions(methodologyId);
  const { data: questionResponses } = useAmlQuestionResponses(assessmentId);
  const dims = dimensions ?? [];
  const questions = questionCatalogue ?? [];
  const responses = questionResponses ?? [];

  const groups = useMemo(() => {
    const byGroup = new Map<string, AmlMethodologyDimension[]>();
    dims.forEach((d) => {
      const g = d.dimension_group ?? 'OTHER';
      byGroup.set(g, [...(byGroup.get(g) ?? []), d]);
    });
    return Array.from(byGroup.entries());
  }, [dims]);

  const questionsByDimension = useMemo(() => {
    const map = new Map<string, AmlMethodologyQuestion[]>();
    questions.forEach((q) => {
      map.set(q.methodology_dimension_id, [...(map.get(q.methodology_dimension_id) ?? []), q]);
    });
    return map;
  }, [questions]);

  const assessed = dims.filter((d) => isAssessed(d, matchRecorded(d, recorded))).length;
  const questionGaps = computeQuestionGaps(questions, responses, dims);
  const mandatoryQuestions = questions.filter((q) => q.mandatory !== false).length;
  const questionsDone = Math.max(0, mandatoryQuestions - questionGaps.length);

  if (!methodologyId) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          This assessment has no methodology version attached, so no working file can be rendered.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Working file completion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <Progress value={dims.length ? (assessed / dims.length) * 100 : 0} className="h-2 flex-1" />
            <span className="whitespace-nowrap font-mono text-sm">
              {assessed} / {dims.length} dimensions assessed
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Progress
              value={mandatoryQuestions ? (questionsDone / mandatoryQuestions) * 100 : 0}
              className="h-2 flex-1"
            />
            <span className="whitespace-nowrap font-mono text-sm">
              {questionsDone} / {mandatoryQuestions} mandatory questions answered
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Every dimension and question below is configured on the methodology version attached to this assessment.
            Dimension codes cannot be invented — you record judgment against the configured methodology, and the
            database refuses submission while any mandatory question remains outstanding.
          </p>
        </CardContent>
      </Card>


      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the methodology working file…</p>
      ) : dims.length === 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            The attached methodology version has no active dimensions configured. A methodology owner must configure the
            dimensions before this assessment can be worked.
          </AlertDescription>
        </Alert>
      ) : (
        groups.map(([group, rows]) => (
          <Card key={group}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {GROUP_LABEL[group] ?? titleCase(group)}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {rows.filter((d) => isAssessed(d, matchRecorded(d, recorded))).length} / {rows.length} assessed
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {rows.map((d) => (
                  <DimensionRow
                    key={d.id}
                    dimension={d}
                    row={matchRecorded(d, recorded)}
                    assessmentId={assessmentId}
                    entityId={entityId}
                    editable={editable}
                    dimensionQuestions={questionsByDimension.get(d.id) ?? []}
                    questionResponses={responses}
                    onChanged={onChanged}
                  />
                ))}

              </Accordion>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function DimensionRow({
  dimension,
  row,
  assessmentId,
  entityId,
  editable,
  dimensionQuestions,
  questionResponses,
  onChanged,
}: {
  dimension: AmlMethodologyDimension;
  row?: RecordedDimension;
  assessmentId: string;
  entityId: string;
  editable: boolean;
  dimensionQuestions: AmlMethodologyQuestion[];
  questionResponses: AmlQuestionResponse[];
  onChanged: () => void;
}) {

  const save = useSaveAmlDimension();
  const isControl = dimension.dimension_group === 'CONTROL_EFFECTIVENESS';
  const calculated = isControl ? row?.calculated_control_rating : row?.calculated_inherent_rating;
  const calculatedResidual = row?.calculated_residual_rating ?? null;

  const [judged, setJudged] = useState<string>(
    String((isControl ? row?.control_rating : row?.inherent_rating) ?? ''),
  );
  const [residual, setResidual] = useState<string>(String(row?.residual_rating ?? ''));
  const [rationale, setRationale] = useState<string>(String(row?.rationale ?? ''));
  const [sourceFacts, setSourceFacts] = useState<string>(String(row?.source_facts ?? ''));
  const [commentary, setCommentary] = useState<string>(String(row?.supervisory_commentary ?? ''));
  const [exceptions, setExceptions] = useState<string>(String(row?.exceptions ?? ''));
  const [trend, setTrend] = useState<string>(String(row?.trend ?? 'STABLE'));
  const [confidence, setConfidence] = useState<string>(String(row?.confidence ?? 'MEDIUM'));
  const [dataQuality, setDataQuality] = useState<string>(String(row?.data_quality ?? 'MEDIUM'));
  const [overrideReason, setOverrideReason] = useState<string>(String(row?.override_reason ?? ''));
  const [proposeScope, setProposeScope] = useState<boolean>(!!row?.proposed_examination_scope);
  const [notApplicable, setNotApplicable] = useState<boolean>(row?.is_applicable === false);
  const [evidence, setEvidence] = useState<AmlEvidenceRef[]>(
    Array.isArray(row?.evidence_refs) ? (row?.evidence_refs as AmlEvidenceRef[]) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const departure = !!calculated && !!judged && String(calculated).toLowerCase() !== judged.toLowerCase();
  const requiredEvidence = dimension.evidence_required ? Math.max(1, dimension.min_evidence_count ?? 1) : 0;
  const evidenceShort = !notApplicable && requiredEvidence > 0 && evidence.length < requiredEvidence;
  const done = isAssessed(dimension, row);
  const questions = asList(dimension.mandatory_questions);
  const sources = asList(dimension.data_sources);

  const submit = async () => {
    if (!notApplicable && !judged && !residual) {
      setError('Record a supervisory judgment before saving this dimension.');
      return;
    }
    if (!notApplicable && !rationale.trim()) {
      setError('A supervisory rationale is required.');
      return;
    }
    if (departure && !overrideReason.trim()) {
      setError('The judged rating departs from the calculated recommendation — an override rationale is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await save.mutateAsync({
        assessmentId,
        dimensionCode: dimension.dimension_code,
        dimensionGroup: dimension.dimension_group,
        methodologyDimensionId: dimension.id,
        inherentRating: isControl ? null : judged || null,
        controlRating: isControl ? judged || null : null,
        residualRating: residual || (isControl ? null : judged || null),
        weight: dimension.weight ?? null,
        rationale: rationale.trim() || 'Not applicable to this entity.',
        sourceFacts: sourceFacts || null,
        supervisoryCommentary: commentary || null,
        exceptions: exceptions || null,
        evidenceRefs: evidence.length ? evidence : null,
        trend: trend || null,
        confidence: confidence || null,
        dataQuality: dataQuality || null,
        isApplicable: notApplicable ? false : true,
        overrideReason: departure ? overrideReason : null,
        proposedExaminationScope: proposeScope,
      });
      toast.success(`${dimension.label || dimension.dimension_code} saved.`);
      onChanged();
    } catch (e) {
      setError(amlErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccordionItem value={dimension.id}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex w-full flex-wrap items-center gap-2 pr-3 text-left">
          {done ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{dimension.label || titleCase(dimension.dimension_code)}</span>
          <Badge variant="outline" className={`${NEUTRAL} font-mono text-[10px]`}>
            weight {dimension.weight ?? '—'}
          </Badge>
          {row?.is_applicable === false ? (
            <Badge variant="outline" className={NEUTRAL}>
              Not applicable
            </Badge>
          ) : null}
          {row ? (
            <Badge variant="outline" className={ratingTone(isControl ? row.control_rating : row.inherent_rating)}>
              {titleCase(String((isControl ? row.control_rating : row.inherent_rating) ?? '—'))}
            </Badge>
          ) : null}
          {isOverride(dimension, row) ? (
            <Badge variant="outline" className={AMBER}>
              Override
            </Badge>
          ) : null}
          {requiredEvidence > 0 && evidenceCount(row?.evidence_refs) < requiredEvidence && row?.is_applicable !== false ? (
            <Badge variant="outline" className={AMBER}>
              Evidence outstanding
            </Badge>
          ) : null}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-1">
          {dimension.description ? <p className="text-sm text-muted-foreground">{dimension.description}</p> : null}

          {dimension.scoring_guidance ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Methodology guidance
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{dimension.scoring_guidance}</p>
            </div>
          ) : null}

          <AmlDimensionQuestions
            assessmentId={assessmentId}
            entityId={entityId}
            questions={dimensionQuestions}
            responses={questionResponses}
            editable={editable}
            onChanged={onChanged}
          />


          <div className="grid gap-3 sm:grid-cols-2">
            {sources.length ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data sources</div>
                <p className="mt-1 text-sm">{sources.join(' · ')}</p>
              </div>
            ) : null}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Evidence requirement
              </div>
              <p className="mt-1 text-sm">
                {requiredEvidence > 0
                  ? `${dimension.evidence_requirements || 'Governed evidence required'} — minimum ${requiredEvidence} reference${requiredEvidence === 1 ? '' : 's'}`
                  : 'No mandatory evidence configured'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Calculated / recommended
              </div>
              {calculated ? (
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline" className={ratingTone(calculated)}>
                    {titleCase(calculated)}
                  </Badge>
                  {row?.calculated_score != null ? (
                    <span className="font-mono text-xs text-muted-foreground">score {String(row.calculated_score)}</span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No calculated recommendation available</p>
              )}
              {calculatedResidual ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Calculated residual: {titleCase(calculatedResidual)}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Calculation and any AI input are advisory. Supervisory judgment is authoritative once approved.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`judged-${dimension.id}`}>
                Supervisory judgment{isControl ? ' (control effectiveness)' : ' (inherent risk)'}
              </Label>
              <Select value={judged} onValueChange={setJudged} disabled={!editable || notApplicable}>
                <SelectTrigger id={`judged-${dimension.id}`}>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {(isControl ? CONTROL_OPTIONS : RATING_OPTIONS).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor={`residual-${dimension.id}`}>Residual rating</Label>
              <Select value={residual} onValueChange={setResidual} disabled={!editable || notApplicable}>
                <SelectTrigger id={`residual-${dimension.id}`}>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {RATING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {departure ? (
            <div className="space-y-1.5">
              <Label htmlFor={`override-${dimension.id}`}>
                Override rationale <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id={`override-${dimension.id}`}
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                disabled={!editable}
                placeholder={`Why does supervisory judgment depart from the calculated ${titleCase(calculated)} recommendation?`}
              />
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`trend-${dimension.id}`}>Trend</Label>
              <Select value={trend} onValueChange={setTrend} disabled={!editable}>
                <SelectTrigger id={`trend-${dimension.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TREND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`conf-${dimension.id}`}>Confidence</Label>
              <Select value={confidence} onValueChange={setConfidence} disabled={!editable}>
                <SelectTrigger id={`conf-${dimension.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`dq-${dimension.id}`}>Data quality</Label>
              <Select value={dataQuality} onValueChange={setDataQuality} disabled={!editable}>
                <SelectTrigger id={`dq-${dimension.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`facts-${dimension.id}`}>Source facts tested</Label>
            <Textarea
              id={`facts-${dimension.id}`}
              rows={2}
              value={sourceFacts}
              onChange={(e) => setSourceFacts(e.target.value)}
              disabled={!editable}
            />
          </div>

          <AmlEvidenceLinker
            entityId={entityId}
            value={evidence}
            onChange={setEvidence}
            disabled={!editable}
            requiredCount={requiredEvidence}
          />
          {evidenceShort ? (
            <p className="text-xs text-amber-600">
              This dimension requires at least {requiredEvidence} governed evidence reference
              {requiredEvidence === 1 ? '' : 's'}.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor={`rationale-${dimension.id}`}>
              Supervisory rationale <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id={`rationale-${dimension.id}`}
              rows={3}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              disabled={!editable}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`comm-${dimension.id}`}>Supervisory commentary</Label>
              <Textarea
                id={`comm-${dimension.id}`}
                rows={2}
                value={commentary}
                onChange={(e) => setCommentary(e.target.value)}
                disabled={!editable}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`exc-${dimension.id}`}>Exceptions</Label>
              <Textarea
                id={`exc-${dimension.id}`}
                rows={2}
                value={exceptions}
                onChange={(e) => setExceptions(e.target.value)}
                disabled={!editable}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={proposeScope}
                onCheckedChange={(v) => setProposeScope(v === true)}
                disabled={!editable}
              />
              Propose for examination scope
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={notApplicable}
                onCheckedChange={(v) => setNotApplicable(v === true)}
                disabled={!editable}
              />
              Not applicable to this entity
            </label>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={submit} disabled={!editable || busy}>
              {busy ? 'Saving…' : 'Save dimension'}
            </Button>
            {done ? (
              <Badge variant="outline" className={EMERALD}>
                Assessed
              </Badge>
            ) : null}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
