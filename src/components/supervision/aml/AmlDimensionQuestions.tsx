/**
 * Mandatory supervisory question responses for one methodology dimension.
 *
 * The questions are not React content: they are read from the methodology
 * version attached to the assessment, each with its own stable code and
 * version. Every answer is written through the governed assessment operation,
 * together with the supervisory observation and any governed evidence the
 * methodology requires, so the working file — and not component state — holds
 * the record of what was asked and what was concluded.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { AmlQuestionEvidencePanel } from '@/components/supervision/aml/AmlQuestionEvidencePanel';
import { useAssessmentQuestionExecution } from '@/hooks/useAssessmentEvidenceBasis';
import {
  amlErrorMessage,
  useSaveAmlQuestionResponse,
  type AmlMethodologyQuestion,
  type AmlQuestionResponse,
} from '@/hooks/useAmlLifecycle';
import { AMBER, EMERALD, NEUTRAL } from '@/lib/amlLabels';

const RESPONSE_LABEL: Record<string, string> = {
  YES: 'Yes',
  PARTIALLY: 'Partially',
  NO: 'No',
  NOT_APPLICABLE: 'Not applicable',
};

interface Props {
  assessmentId: string;
  entityId: string;
  questions: AmlMethodologyQuestion[];
  responses: AmlQuestionResponse[];
  editable: boolean;
  onChanged: () => void;
}

export function AmlDimensionQuestions({
  assessmentId,
  entityId,
  questions,
  responses,
  editable,
  onChanged,
}: Props) {
  // Evidence counts and permitted evidence kinds are read from the platform,
  // never recomputed here, so the officer sees the same position as submission.
  const { data: execution } = useAssessmentQuestionExecution(assessmentId);
  const byExecution = new Map((execution ?? []).map((e) => [e.question_id, e]));

  if (!questions.length) {
    return (
      <p className="text-xs text-muted-foreground">
        The methodology version configures no mandatory supervisory questions for this dimension.
      </p>
    );
  }

  const byQuestion = new Map(responses.map((r) => [r.methodology_question_id, r]));


  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Mandatory supervisory questions
      </div>
      {questions.map((q, index) => (
        <QuestionRow
          key={q.id}
          index={index + 1}
          question={q}
          recorded={byQuestion.get(q.id)}
          evidenceCount={byExecution.get(q.id)?.evidence_count ?? null}
          legacyEvidenceCount={byExecution.get(q.id)?.legacy_evidence_count ?? null}
          permittedEvidenceTypes={byExecution.get(q.id)?.permitted_evidence_types ?? null}
          assessmentId={assessmentId}
          entityId={entityId}
          editable={editable}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function QuestionRow({
  index,
  question,
  recorded,
  evidenceCount,
  legacyEvidenceCount,
  permittedEvidenceTypes,
  assessmentId,
  entityId,
  editable,
  onChanged,
}: {
  index: number;
  question: AmlMethodologyQuestion;
  recorded?: AmlQuestionResponse;
  evidenceCount: number | null;
  legacyEvidenceCount: number | null;
  permittedEvidenceTypes: string[] | null;
  assessmentId: string;
  entityId: string;
  editable: boolean;
  onChanged: () => void;
}) {
  const save = useSaveAmlQuestionResponse();
  const [response, setResponse] = useState<string>(recorded?.response ?? '');
  const [observation, setObservation] = useState<string>(recorded?.observation ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = (question.response_options?.length
    ? question.response_options
    : ['YES', 'PARTIALLY', 'NO', 'NOT_APPLICABLE']
  ).filter((o) => o !== 'NOT_APPLICABLE' || question.allow_not_applicable);

  const na = response === 'NOT_APPLICABLE';
  const requiredEvidence = question.requires_evidence ? Math.max(1, question.min_evidence_count ?? 1) : 0;
  const observationRequired = na ? question.na_requires_rationale : question.requires_observation;
  const legacyRefs = Array.isArray(recorded?.evidence_refs) ? (recorded?.evidence_refs as unknown[]).length : 0;
  const onFile = evidenceCount ?? legacyRefs;
  const answered =
    !!recorded &&
    (recorded.response === 'NOT_APPLICABLE'
      ? !question.na_requires_rationale || String(recorded.observation ?? '').trim().length >= 10
      : (!question.requires_observation || String(recorded.observation ?? '').trim().length >= 10) &&
        (!question.requires_evidence || onFile >= requiredEvidence));

  const submit = async () => {
    if (!response) {
      setError('Select a response before saving.');
      return;
    }
    if (observationRequired && observation.trim().length < 10) {
      setError(
        na
          ? 'Explain why this question is not applicable to the entity (at least 10 characters).'
          : 'A supervisory observation of at least 10 characters is required for this question.',
      );
      return;
    }
    if (!na && requiredEvidence > 0 && onFile < requiredEvidence) {
      setError(
        `This question requires at least ${requiredEvidence} governed evidence reference${requiredEvidence === 1 ? '' : 's'}. Link the evidence below, then save.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await save.mutateAsync({
        assessmentId,
        questionId: question.id,
        response,
        observation: observation.trim() || null,
        // Evidence recorded before the register existed is preserved exactly.
        evidenceRefs: (recorded?.evidence_refs as unknown[] | null) ?? null,
      });
      toast.success(`${question.question_code} recorded.`);
      onChanged();
    } catch (e) {
      setError(amlErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start gap-2">
        {answered ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {index}. {question.prompt}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={`${NEUTRAL} font-mono text-[10px]`}>
              {question.question_code} v{question.question_version}
            </Badge>
            {question.requires_evidence ? (
              <Badge variant="outline" className={AMBER}>
                Evidence required
              </Badge>
            ) : null}
            {recorded ? (
              <Badge variant="outline" className={answered ? EMERALD : AMBER}>
                {RESPONSE_LABEL[recorded.response] ?? recorded.response}
              </Badge>
            ) : null}
          </div>
          {question.guidance ? (
            <p className="mt-1 text-xs text-muted-foreground">{question.guidance}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`resp-${question.id}`}>Response</Label>
          <Select value={response} onValueChange={setResponse} disabled={!editable}>
            <SelectTrigger id={`resp-${question.id}`} className="sm:max-w-xs">
              <SelectValue placeholder="Select a response…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {RESPONSE_LABEL[o] ?? o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`obs-${question.id}`}>
            {na ? 'Why is this not applicable?' : 'Supervisory observation'}
            {observationRequired ? <span className="text-destructive"> *</span> : null}
          </Label>
          <Textarea
            id={`obs-${question.id}`}
            rows={2}
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            disabled={!editable}
          />
        </div>

        {!na ? (
          <AmlQuestionEvidencePanel
            assessmentId={assessmentId}
            entityId={entityId}
            questionId={question.id}
            questionCode={question.question_code}
            permittedTypes={permittedEvidenceTypes}
            requiredCount={requiredEvidence}
            legacyCount={legacyEvidenceCount ?? legacyRefs}
            editable={editable}
          />
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button size="sm" variant="outline" onClick={submit} disabled={!editable || busy}>
          {busy ? 'Saving…' : 'Save response'}
        </Button>
      </div>
    </div>
  );
}
