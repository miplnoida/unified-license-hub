/**
 * Governed question authoring — complete question model.
 *
 * The dialog collects content only. Authority, version freezing, reference
 * ownership, concurrency, classification consistency and history are decided by
 * `supervisory_methodology_question_save` server-side; the browser never writes
 * a question row and never assumes the save is permitted. Classification lists
 * come from `supervisory_methodology_vocabulary`, not from constants here.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useSaveMethodologyQuestion,
  useSupervisoryMethodologySemantics,
  useSupervisoryMethodologyVocabulary,
  type MethodologyDimension,
  type MethodologyQuestionDetail,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import {
  AreaField, CheckField, MultiCheckField, PickField, SectionTitle, TextField,
  asList, orNull, pickValue,
} from './studio/StudioKit';

export interface QuestionEditorProps {
  methodologyId: string;
  open: boolean;
  onClose: () => void;
  dimensions: MethodologyDimension[];
  existing?: MethodologyQuestionDetail | null;
}

function initial(existing?: MethodologyQuestionDetail | null, dimensions: MethodologyDimension[] = []) {
  const e = existing as Record<string, any> | null | undefined;
  return {
    question_code: e?.question_code ?? '',
    dimension_code: e?.dimension?.dimension_code ?? dimensions[0]?.dimension_code ?? '',
    prompt: e?.prompt ?? '',
    supervisory_intent: e?.supervisory_intent ?? '',
    guidance: e?.guidance ?? '',
    question_class: e?.question_class ?? '',
    axis: e?.axis ?? '',
    effectiveness_focus: e?.effectiveness_focus ?? '',
    calculation_participation: e?.calculation_participation ?? '',
    response_semantics_code: e?.semantic_profile?.semantic_code ?? e?.response_semantics_code ?? '',
    response_options: Array.isArray(e?.response_options) ? e!.response_options.join(', ') : '',
    trigger_condition: e?.trigger_condition ?? '',
    sector_applicability: e?.sector_applicability ?? '',
    sector_classification: e?.sector_classification ?? '',
    sector_notes: e?.sector_notes ?? '',
    evidence_basis_types: (Array.isArray(e?.evidence_basis_types) ? e!.evidence_basis_types : []) as string[],
    minimum_evidence_note: e?.minimum_evidence_note ?? '',
    na_conditions: e?.na_conditions ?? '',
    standards_reference: e?.standards_reference ?? '',
    change_classification: e?.change_classification ?? '',
    predecessor_mapping: e?.predecessor_mapping ?? '',
    mandatory: e?.mandatory ?? true,
    requires_observation: e?.requires_observation ?? false,
    requires_evidence: e?.requires_evidence ?? false,
    allow_not_applicable: e?.allow_not_applicable ?? false,
    na_requires_rationale: e?.na_requires_rationale ?? true,
    supervisory_judgement_required: e?.supervisory_judgement_required ?? false,
    factual_auto_prefill_possible: e?.factual_auto_prefill_possible ?? false,
    min_evidence_count: String(e?.min_evidence_count ?? 0),
    sort_order: String(e?.sort_order ?? 100),
    rationale: '',
  };
}

export function QuestionEditorDialog({ methodologyId, open, onClose, dimensions, existing }: QuestionEditorProps) {
  const [form, setForm] = useState(() => initial(existing, dimensions));
  const vocab = useSupervisoryMethodologyVocabulary(open);
  const semantics = useSupervisoryMethodologySemantics(methodologyId, open);
  const save = useSaveMethodologyQuestion();
  const isEdit = !!existing;

  useEffect(() => {
    if (open) setForm(initial(existing, dimensions));
  }, [open, existing, dimensions]);

  const set = (k: keyof ReturnType<typeof initial>, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    try {
      await save.mutateAsync({
        methodologyId,
        rationale: form.rationale.trim() || undefined,
        payload: {
          question_code: form.question_code.trim().toUpperCase(),
          dimension_code: form.dimension_code,
          prompt: form.prompt.trim(),
          supervisory_intent: orNull(form.supervisory_intent),
          guidance: orNull(form.guidance),
          question_class: pickValue(form.question_class),
          axis: pickValue(form.axis),
          effectiveness_focus: pickValue(form.effectiveness_focus),
          calculation_participation: pickValue(form.calculation_participation),
          response_semantics_code: pickValue(form.response_semantics_code),
          response_options: asList(form.response_options),
          trigger_condition: orNull(form.trigger_condition),
          sector_applicability: orNull(form.sector_applicability),
          sector_classification: orNull(form.sector_classification),
          sector_notes: orNull(form.sector_notes),
          evidence_basis_types: form.evidence_basis_types,
          minimum_evidence_note: orNull(form.minimum_evidence_note),
          na_conditions: orNull(form.na_conditions),
          standards_reference: orNull(form.standards_reference),
          change_classification: pickValue(form.change_classification),
          predecessor_mapping: orNull(form.predecessor_mapping),
          mandatory: form.mandatory,
          requires_observation: form.requires_observation,
          requires_evidence: form.requires_evidence,
          allow_not_applicable: form.allow_not_applicable,
          na_requires_rationale: form.na_requires_rationale,
          supervisory_judgement_required: form.supervisory_judgement_required,
          factual_auto_prefill_possible: form.factual_auto_prefill_possible,
          min_evidence_count: Number(form.min_evidence_count) || 0,
          sort_order: Number(form.sort_order) || 100,
          ...(isEdit && (existing as any)?.updated_at ? { expected_updated_at: (existing as any).updated_at } : {}),
        } as any,
      });
      toast.success(isEdit ? 'Question updated' : 'Question added to this draft version');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The question could not be saved');
    }
  };

  const disabled = save.isPending
    || form.question_code.trim().length < 2
    || form.prompt.trim().length < 10
    || !form.dimension_code;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${existing?.question_code}` : 'Add a question'}</DialogTitle>
          <DialogDescription>
            Content is saved to this draft version only. An approved or active version cannot be edited.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="q-code" label="Question code" mono disabled={isEdit}
                     value={form.question_code} onChange={(v) => set('question_code', v)} />
          <PickField id="q-dimension" label="Dimension" value={form.dimension_code}
                     options={dimensions.map((d) => ({ value: d.dimension_code, label: `${d.dimension_code} — ${d.label}` }))}
                     onChange={(v) => set('dimension_code', v)} />
          <AreaField id="q-prompt" label="Prompt" rows={3} value={form.prompt} onChange={(v) => set('prompt', v)} />
          <AreaField id="q-intent" label="Supervisory intent" value={form.supervisory_intent} onChange={(v) => set('supervisory_intent', v)} />
          <AreaField id="q-guidance" label="Assessor guidance" value={form.guidance} onChange={(v) => set('guidance', v)} />

          <SectionTitle>Classification</SectionTitle>
          <PickField id="q-class" label="Question class" value={form.question_class}
                     options={vocab.data?.question_class ?? []} onChange={(v) => set('question_class', v)} allowNone />
          <PickField id="q-axis" label="Assessment axis" value={form.axis}
                     options={vocab.data?.axis ?? []} onChange={(v) => set('axis', v)} allowNone />
          <PickField id="q-focus" label="Effectiveness focus" value={form.effectiveness_focus}
                     options={vocab.data?.effectiveness_focus ?? []} onChange={(v) => set('effectiveness_focus', v)} allowNone />
          <PickField id="q-participation" label="Calculation participation" value={form.calculation_participation}
                     options={vocab.data?.calculation_participation ?? []}
                     onChange={(v) => set('calculation_participation', v)} allowNone />

          <SectionTitle>Response semantics</SectionTitle>
          <PickField id="q-semantics" label="Response semantics profile" value={form.response_semantics_code}
                     options={(semantics.data ?? []).map((s) => ({
                       value: s.semantic_code, label: `${s.semantic_code} — ${s.label ?? 'no label'}`,
                     }))}
                     onChange={(v) => set('response_semantics_code', v)} allowNone noneLabel="No profile" />
          <TextField id="q-options" label="Permitted responses" value={form.response_options}
                     onChange={(v) => set('response_options', v)} hint="Separate responses with commas." />

          <SectionTitle>Applicability</SectionTitle>
          <AreaField id="q-trigger" label="Trigger condition" value={form.trigger_condition}
                     onChange={(v) => set('trigger_condition', v)}
                     hint="A conditional question must state when it applies." />
          <TextField id="q-sector-class" label="Sector classification" value={form.sector_classification}
                     onChange={(v) => set('sector_classification', v)} />
          <TextField id="q-sector-applic" label="Sector applicability" value={form.sector_applicability}
                     onChange={(v) => set('sector_applicability', v)} />
          <AreaField id="q-sector-notes" label="Sector notes" value={form.sector_notes} onChange={(v) => set('sector_notes', v)} />

          <SectionTitle>Evidence expectations</SectionTitle>
          <MultiCheckField label="Accepted evidence basis" options={vocab.data?.evidence_basis ?? []}
                           selected={form.evidence_basis_types}
                           onToggle={(value, on) => set('evidence_basis_types', on
                             ? [...form.evidence_basis_types, value]
                             : form.evidence_basis_types.filter((v) => v !== value))} />
          <TextField id="q-min-evidence" label="Minimum evidence items" type="number"
                     value={form.min_evidence_count} onChange={(v) => set('min_evidence_count', v)} />
          <TextField id="q-sort" label="Display order" type="number" value={form.sort_order} onChange={(v) => set('sort_order', v)} />
          <AreaField id="q-min-note" label="Minimum evidence note" value={form.minimum_evidence_note}
                     onChange={(v) => set('minimum_evidence_note', v)} />

          <SectionTitle>Answering rules</SectionTitle>
          <div className="space-y-1">
            <CheckField id="q-mandatory" label="Mandatory" checked={form.mandatory} onChange={(v) => set('mandatory', v)} />
            <CheckField id="q-observation" label="Observation required" checked={form.requires_observation}
                        onChange={(v) => set('requires_observation', v)} />
            <CheckField id="q-evidence" label="Evidence required" checked={form.requires_evidence}
                        onChange={(v) => set('requires_evidence', v)} />
          </div>
          <div className="space-y-1">
            <CheckField id="q-na" label='"Not applicable" is permitted' checked={form.allow_not_applicable}
                        onChange={(v) => set('allow_not_applicable', v)} />
            <CheckField id="q-na-rationale" label='"Not applicable" needs a rationale' checked={form.na_requires_rationale}
                        onChange={(v) => set('na_requires_rationale', v)} />
            <CheckField id="q-judgement" label="Supervisory judgement required" checked={form.supervisory_judgement_required}
                        onChange={(v) => set('supervisory_judgement_required', v)} />
            <CheckField id="q-prefill" label="May be pre-filled from system data" checked={form.factual_auto_prefill_possible}
                        onChange={(v) => set('factual_auto_prefill_possible', v)} />
          </div>
          <AreaField id="q-na-conditions" label='Conditions under which "not applicable" is acceptable'
                     value={form.na_conditions} onChange={(v) => set('na_conditions', v)} />

          <SectionTitle>Standards and lineage</SectionTitle>
          <TextField id="q-standards" label="Standards reference" value={form.standards_reference}
                     onChange={(v) => set('standards_reference', v)} />
          <PickField id="q-change" label="Change classification" value={form.change_classification}
                     options={vocab.data?.change_classification ?? []} onChange={(v) => set('change_classification', v)} allowNone />
          <TextField id="q-predecessor" label="Predecessor question" value={form.predecessor_mapping}
                     onChange={(v) => set('predecessor_mapping', v)} mono />
          <TextField id="q-rationale" label="Reason for this change (optional)" value={form.rationale}
                     onChange={(v) => set('rationale', v)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={disabled} data-rbac="aml_supervision.manage_config">
            {save.isPending ? 'Saving…' : isEdit ? 'Save question' : 'Add question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
