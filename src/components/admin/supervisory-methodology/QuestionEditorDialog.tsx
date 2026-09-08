/**
 * Governed question authoring.
 *
 * The dialog collects content only. Authority, version freezing, reference
 * ownership, concurrency and history are decided by
 * `supervisory_methodology_question_save` server-side; the browser never
 * writes a question row and never assumes the save is permitted.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  useSaveMethodologyQuestion,
  type MethodologyDimension,
  type MethodologyQuestionDetail,
} from '@/hooks/useSupervisoryMethodologyAdmin';

const CLASSES = ['CORE', 'CONDITIONAL', 'ENHANCED'];

export interface QuestionEditorProps {
  methodologyId: string;
  open: boolean;
  onClose: () => void;
  dimensions: MethodologyDimension[];
  existing?: MethodologyQuestionDetail | null;
}

interface FormState {
  question_code: string;
  dimension_code: string;
  prompt: string;
  supervisory_intent: string;
  guidance: string;
  question_class: string;
  mandatory: boolean;
  requires_evidence: boolean;
  min_evidence_count: string;
  allow_not_applicable: boolean;
  na_requires_rationale: boolean;
  sort_order: string;
  rationale: string;
}

function initial(existing?: MethodologyQuestionDetail | null, dimensions: MethodologyDimension[] = []): FormState {
  return {
    question_code: existing?.question_code ?? '',
    dimension_code: existing?.dimension?.dimension_code ?? dimensions[0]?.dimension_code ?? '',
    prompt: existing?.prompt ?? '',
    supervisory_intent: existing?.supervisory_intent ?? '',
    guidance: existing?.guidance ?? '',
    question_class: existing?.question_class ?? 'CORE',
    mandatory: existing?.mandatory ?? true,
    requires_evidence: existing?.requires_evidence ?? false,
    min_evidence_count: String(existing?.min_evidence_count ?? 0),
    allow_not_applicable: existing?.allow_not_applicable ?? false,
    na_requires_rationale: existing?.na_requires_rationale ?? true,
    sort_order: '100',
    rationale: '',
  };
}

export function QuestionEditorDialog({ methodologyId, open, onClose, dimensions, existing }: QuestionEditorProps) {
  const [form, setForm] = useState<FormState>(() => initial(existing, dimensions));
  const save = useSaveMethodologyQuestion();
  const isEdit = !!existing;

  useEffect(() => {
    if (open) setForm(initial(existing, dimensions));
  }, [open, existing, dimensions]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    try {
      await save.mutateAsync({
        methodologyId,
        rationale: form.rationale.trim() || undefined,
        payload: {
          question_code: form.question_code.trim().toUpperCase(),
          dimension_code: form.dimension_code,
          prompt: form.prompt.trim(),
          supervisory_intent: form.supervisory_intent.trim() || null,
          guidance: form.guidance.trim() || null,
          question_class: form.question_class,
          mandatory: form.mandatory,
          requires_evidence: form.requires_evidence,
          min_evidence_count: Number(form.min_evidence_count) || 0,
          allow_not_applicable: form.allow_not_applicable,
          na_requires_rationale: form.na_requires_rationale,
          sort_order: Number(form.sort_order) || 100,
        },
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
          <div className="space-y-1.5">
            <Label htmlFor="q-code">Question code</Label>
            <Input
              id="q-code"
              value={form.question_code}
              disabled={isEdit}
              onChange={(e) => set('question_code', e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-dimension">Dimension</Label>
            <Select value={form.dimension_code} onValueChange={(v) => set('dimension_code', v)}>
              <SelectTrigger id="q-dimension"><SelectValue placeholder="Select a dimension" /></SelectTrigger>
              <SelectContent>
                {dimensions.map((d) => (
                  <SelectItem key={d.id} value={d.dimension_code}>{d.dimension_code} — {d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="q-prompt">Prompt</Label>
            <Textarea id="q-prompt" rows={3} value={form.prompt} onChange={(e) => set('prompt', e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="q-intent">Supervisory intent</Label>
            <Textarea id="q-intent" rows={2} value={form.supervisory_intent} onChange={(e) => set('supervisory_intent', e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="q-guidance">Assessor guidance</Label>
            <Textarea id="q-guidance" rows={2} value={form.guidance} onChange={(e) => set('guidance', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-class">Question class</Label>
            <Select value={form.question_class} onValueChange={(v) => set('question_class', v)}>
              <SelectTrigger id="q-class"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-order">Sort order</Label>
            <Input id="q-order" type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.mandatory} onCheckedChange={(v) => set('mandatory', v === true)} />
              Mandatory question
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.requires_evidence} onCheckedChange={(v) => set('requires_evidence', v === true)} />
              Evidence required
            </label>
            {form.requires_evidence ? (
              <div className="space-y-1.5">
                <Label htmlFor="q-min">Minimum evidence items</Label>
                <Input id="q-min" type="number" min={0} value={form.min_evidence_count}
                       onChange={(e) => set('min_evidence_count', e.target.value)} className="w-28" />
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.allow_not_applicable} onCheckedChange={(v) => set('allow_not_applicable', v === true)} />
              "Not applicable" permitted
            </label>
            {form.allow_not_applicable ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.na_requires_rationale} onCheckedChange={(v) => set('na_requires_rationale', v === true)} />
                A rationale is required when "not applicable" is used
              </label>
            ) : null}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="q-rationale">Change note (recorded in history)</Label>
            <Input id="q-rationale" value={form.rationale} onChange={(e) => set('rationale', e.target.value)} />
          </div>
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
