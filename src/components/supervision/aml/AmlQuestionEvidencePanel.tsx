/**
 * Governed evidence basis for one supervisory question.
 *
 * Evidence is never a file held by the browser and never free text. The officer
 * links a record that already exists in the platform — a registered document, a
 * submitted return, an examination, a finding, a remediation record — or records
 * a governed non-document basis with its own reference, period and retrieval
 * time. The platform re-checks the officer's authority, that the source really
 * exists, that the officer is allowed to see it, that the question is in scope
 * for this assessment, and that the methodology accepts that kind of evidence.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, EyeOff, FileText, Paperclip, X } from 'lucide-react';
import { useDmsRegister } from '@/hooks/useDmsDocuments';
import {
  evidenceErrorMessage,
  useAssessmentEvidenceRegister,
  useEvidenceBasisTypes,
  useLinkAssessmentEvidence,
  useUnlinkAssessmentEvidence,
} from '@/hooks/useAssessmentEvidenceBasis';
import { useAssessmentEvidencePolicy } from '@/hooks/useAssessmentEvidencePolicy';
import { decisionLabel, decisionTone, kindList, outstandingText } from '@/lib/evidencePolicyPresentation';
import { AMBER, EMERALD, NEUTRAL } from '@/lib/amlLabels';

/**
 * The evidence policy requirement for this question, exactly as the platform
 * decided it from the assessment's pinned policy. Nothing is re-checked here.
 */
function QuestionEvidencePolicyContext({ assessmentId, questionId }: { assessmentId: string; questionId: string }) {
  const { data } = useAssessmentEvidencePolicy(assessmentId);
  const evaluation = data?.evaluation;
  if (!evaluation || evaluation.status !== 'EVALUATED') return null;
  const decisions = evaluation.decisions.filter((d) => d.question_id === questionId);
  if (decisions.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid={`question-evidence-policy-${questionId}`}>
      {decisions.map((d) => (
        <div key={d.rule_code} className="rounded-md border border-dashed p-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-medium">
              Evidence policy {evaluation.policy_component_code ?? ''} v{evaluation.policy_component_version ?? '—'} ·{' '}
              {d.rule_label || d.rule_code}
            </span>
            <Badge variant="outline" className={`${decisionTone(d.decision)} text-[10px]`}>
              {decisionLabel(d.decision)}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            Minimum {d.required_items || 0} · {kindList(d.permitted_source_kinds)}
            {d.maximum_age_days ? ` · no older than ${d.maximum_age_days} days` : ''}
            {d.independent_sources_required ? ` · ${d.independent_sources_required} independent sources` : ''}
          </p>
          {outstandingText(d) ? <p className="mt-1 text-muted-foreground">{outstandingText(d)}</p> : null}
        </div>
      ))}
    </div>
  );
}

interface Props {
  assessmentId: string;
  entityId?: string;
  questionId: string;
  questionCode: string;
  permittedTypes?: string[] | null;
  requiredCount?: number;
  legacyCount?: number;
  editable: boolean;
}

export function AmlQuestionEvidencePanel({
  assessmentId, entityId, questionId, questionCode,
  permittedTypes, requiredCount = 0, legacyCount = 0, editable,
}: Props) {
  const [open, setOpen] = useState(false);
  const register = useAssessmentEvidenceRegister(assessmentId);
  const unlink = useUnlinkAssessmentEvidence(assessmentId);

  const linked = useMemo(
    () => (register.data ?? []).filter((r) => r.questions.some((q) => q.question_id === questionId)),
    [register.data, questionId],
  );
  const total = linked.length + legacyCount;

  const remove = async (evidenceId: string) => {
    try {
      await unlink.mutateAsync({ evidenceId, questionId });
      toast.success('Evidence link removed.');
    } catch (e) {
      toast.error(evidenceErrorMessage(e));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>
          Governed evidence basis
          {requiredCount > 0 ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              minimum {requiredCount} — {total} on file
            </span>
          ) : null}
        </Label>
        {editable ? (
          <Button data-rbac="aml_supervision.edit" type="button" size="sm" variant="outline"
            onClick={() => setOpen(true)}>
            <Paperclip className="mr-1.5 h-3.5 w-3.5" />Link evidence
          </Button>
        ) : null}
      </div>

      <QuestionEvidencePolicyContext assessmentId={assessmentId} questionId={questionId} />

      {legacyCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {legacyCount} earlier evidence reference{legacyCount === 1 ? '' : 's'} recorded on this answer before the
          evidence register existed. {legacyCount === 1 ? 'It' : 'They'} still count towards the methodology's requirement.
        </p>
      ) : null}

      {register.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No governed evidence linked to {questionCode} yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {linked.map((r) => (
            <li key={r.id} className="rounded-md border p-2">
              <div className="flex items-start gap-2">
                {r.source_accessible ? (
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.source_accessible
                      ? r.title || r.source_reference || r.type_label || 'Governed evidence'
                      : 'Restricted source — you are not authorised to see this record'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={`${NEUTRAL} text-[10px]`}>{r.type_label ?? r.evidence_type}</Badge>
                    {r.source_accessible && r.source_reference ? (
                      <Badge variant="outline" className={`${NEUTRAL} font-mono text-[10px]`}>{r.source_reference}</Badge>
                    ) : null}
                    {r.as_of_date ? (
                      <Badge variant="outline" className={`${NEUTRAL} text-[10px]`}>as at {r.as_of_date}</Badge>
                    ) : null}
                  </div>
                  {r.note ? <p className="mt-1 text-xs text-muted-foreground">{r.note}</p> : null}
                </div>
                {editable ? (
                  <Button data-rbac="aml_supervision.edit" type="button" size="icon" variant="ghost"
                    className="h-7 w-7" disabled={unlink.isPending} onClick={() => remove(r.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <LinkEvidenceDialog
        open={open}
        onOpenChange={setOpen}
        assessmentId={assessmentId}
        entityId={entityId}
        questionId={questionId}
        questionCode={questionCode}
        permittedTypes={permittedTypes}
      />
    </div>
  );
}

function LinkEvidenceDialog({
  open, onOpenChange, assessmentId, entityId, questionId, questionCode, permittedTypes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assessmentId: string;
  entityId?: string;
  questionId: string;
  questionCode: string;
  permittedTypes?: string[] | null;
}) {
  const types = useEvidenceBasisTypes();
  const link = useLinkAssessmentEvidence(assessmentId);
  const [type, setType] = useState<string>('');
  const [search, setSearch] = useState('');
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [asOf, setAsOf] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const available = (types.data ?? []).filter(
    (t) => !permittedTypes || permittedTypes.length === 0 || permittedTypes.includes(t.code),
  );
  const selected = available.find((t) => t.code === type);
  const isDocument = type === 'ENTERPRISE_DOCUMENT';
  const documents = useDmsRegister({ search: search || undefined, entityId }, 0, 25);

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const submit = async (sourceObjectId?: string) => {
    setError(null);
    if (selected?.requires_source_object && !UUID.test(String(sourceObjectId ?? ''))) {
      setError('This kind of evidence must point at an existing platform record, identified exactly.');
      return;
    }
    try {
      await link.mutateAsync({
        assessmentId,
        evidenceType: type,
        sourceObjectId: sourceObjectId ?? null,
        sourceReference: reference.trim() || null,
        title: title.trim() || null,
        asOfDate: asOf || null,
        note: note.trim() || null,
        methodologyQuestionId: questionId,
      });
      toast.success(`Evidence linked to ${questionCode}.`);
      onOpenChange(false);
      setReference(''); setTitle(''); setNote(''); setAsOf('');
    } catch (e) {
      setError(evidenceErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link governed evidence — {questionCode}</DialogTitle>
          <DialogDescription>
            Evidence must be a record the platform already holds, or a governed basis recorded with its own reference
            and date. Only sources you are authorised to see may be used.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="evidence-type">Evidence basis type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="evidence-type">
                <SelectValue placeholder="Select the kind of evidence…" />
              </SelectTrigger>
              <SelectContent>
                {available.map((t) => (
                  <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected?.description ? (
              <p className="text-xs text-muted-foreground">{selected.description}</p>
            ) : null}
            {permittedTypes && permittedTypes.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                The methodology accepts only these kinds of evidence for this question.
              </p>
            ) : null}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {isDocument ? (
            <div className="space-y-2">
              <Input placeholder="Search the document register by reference, name or type…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
              {documents.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (documents.data?.rows ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No registered documents match. Register the document first, then link it here.
                </p>
              ) : (
                <ul className="divide-y">
                  {(documents.data?.rows ?? []).map((r: any) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.display_name || r.file_name || 'Document'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[r.document_reference, r.category_name, r.document_date].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <Button data-rbac="aml_supervision.edit" type="button" size="sm" variant="outline"
                        disabled={link.isPending} onClick={() => submit(r.id)}>
                        Link
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : type ? (
            <div className="space-y-3">
              {selected?.requires_source_object ? (
                <div className="space-y-1.5">
                  <Label htmlFor="evidence-source-id">Platform record identifier</Label>
                  <Input id="evidence-source-id" value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Identifier of the existing platform record" />
                  <p className="text-xs text-muted-foreground">
                    This kind of evidence must point at a record the platform already holds for this entity.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="evidence-reference">Source reference</Label>
                    <Input id="evidence-reference" value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Citation, filing reference or sample identifier" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="evidence-title">What this evidence is</Label>
                    <Input id="evidence-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                </>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="evidence-asof">As at</Label>
                  <Input id="evidence-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="evidence-note">What it evidences</Label>
                  <Input id="evidence-note" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {type && !isDocument ? (
            <Button data-rbac="aml_supervision.edit" type="button" size="sm" disabled={link.isPending || !type}
              onClick={() => submit(selected?.requires_source_object ? reference.trim() : undefined)}>
              {link.isPending ? 'Linking…' : 'Link evidence'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const EVIDENCE_STATUS_STYLES = { ok: EMERALD, attention: AMBER };
