/**
 * Governed fact-definition authoring.
 *
 * A fact definition says what must be known, in what unit, from what source and
 * against which materiality parameter. The parameter reference is validated
 * server-side; removal is refused while a question still links to the fact.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useSaveMethodologyFactRequirement,
  useSupervisoryMethodologyParameters,
  useSupervisoryMethodologyVocabulary,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { AreaField, CheckField, PickField, SectionTitle, TextField, asList, orNull, pickValue } from './StudioKit';

interface Props {
  methodologyId: string;
  open: boolean;
  onClose: () => void;
  existing?: Record<string, any> | null;
}

function initial(f?: Record<string, any> | null) {
  return {
    fact_code: f?.fact_code ?? '',
    label: f?.label ?? '',
    description: f?.description ?? '',
    data_type: f?.data_type ?? '',
    unit: f?.unit ?? '',
    numerator_basis: f?.numerator_basis ?? '',
    denominator_basis: f?.denominator_basis ?? '',
    period_expectation: f?.period_expectation ?? '',
    source_type_expectation: Array.isArray(f?.source_type_expectation)
      ? f!.source_type_expectation.join(', ') : (f?.source_type_expectation ?? ''),
    materiality_parameter_code: f?.materiality_parameter_code ?? '',
    attribute_source: f?.attribute_source ?? '',
    definition_status: f?.definition_status ?? '',
    is_required: f?.is_required ?? true,
    auto_prefill_allowed: f?.auto_prefill_allowed ?? false,
    officer_edit_allowed: f?.officer_edit_allowed ?? true,
  };
}

export function FactEditorDialog({ methodologyId, open, onClose, existing }: Props) {
  const [form, setForm] = useState(() => initial(existing));
  const vocab = useSupervisoryMethodologyVocabulary(open);
  const params = useSupervisoryMethodologyParameters(methodologyId, open);
  const save = useSaveMethodologyFactRequirement();
  const isEdit = !!existing?.fact_code;

  useEffect(() => { if (open) setForm(initial(existing)); }, [open, existing]);
  const set = (k: keyof ReturnType<typeof initial>, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    try {
      await save.mutateAsync({
        methodologyId,
        facts: [{
          fact_code: form.fact_code.trim().toUpperCase(),
          label: orNull(form.label),
          description: orNull(form.description),
          data_type: pickValue(form.data_type),
          unit: orNull(form.unit),
          numerator_basis: orNull(form.numerator_basis),
          denominator_basis: orNull(form.denominator_basis),
          period_expectation: orNull(form.period_expectation),
          source_type_expectation: asList(form.source_type_expectation),
          materiality_parameter_code: pickValue(form.materiality_parameter_code) ?? '',
          attribute_source: pickValue(form.attribute_source) ?? 'DECLARED',
          definition_status: pickValue(form.definition_status) ?? 'ATTRIBUTES_PENDING',
          is_required: form.is_required,
          auto_prefill_allowed: form.auto_prefill_allowed,
          officer_edit_allowed: form.officer_edit_allowed,
        }],
      });
      toast.success(isEdit ? 'Fact definition saved' : 'Fact definition added');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The fact definition could not be saved');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${existing?.fact_code}` : 'Add a fact definition'}</DialogTitle>
          <DialogDescription>
            A definition describes what must be known and how it is measured. It does not capture any entity value.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="f-code" label="Fact code" mono disabled={isEdit} value={form.fact_code} onChange={(v) => set('fact_code', v)} />
          <TextField id="f-label" label="Label" value={form.label} onChange={(v) => set('label', v)} />
          <AreaField id="f-desc" label="Description" value={form.description} onChange={(v) => set('description', v)} />

          <SectionTitle>Measurement</SectionTitle>
          <PickField id="f-type" label="Data type" value={form.data_type}
                     options={vocab.data?.fact_data_type ?? []} onChange={(v) => set('data_type', v)} allowNone />
          <TextField id="f-unit" label="Unit" value={form.unit} onChange={(v) => set('unit', v)} />
          <TextField id="f-num" label="Numerator basis" value={form.numerator_basis} onChange={(v) => set('numerator_basis', v)} />
          <TextField id="f-den" label="Denominator basis" value={form.denominator_basis} onChange={(v) => set('denominator_basis', v)} />
          <TextField id="f-period" label="Period expectation" value={form.period_expectation} onChange={(v) => set('period_expectation', v)} />
          <TextField id="f-source" label="Expected sources" value={form.source_type_expectation}
                     onChange={(v) => set('source_type_expectation', v)} hint="Separate several sources with commas." />

          <SectionTitle>Governance</SectionTitle>
          <PickField id="f-param" label="Materiality parameter" value={form.materiality_parameter_code}
                     options={(params.data?.rows ?? []).map((p) => ({
                       value: p.parameter_code, label: `${p.parameter_code} — ${p.label ?? 'no label'}`,
                     }))}
                     onChange={(v) => set('materiality_parameter_code', v)} allowNone noneLabel="No parameter" />
          <PickField id="f-attr" label="Attribute source" value={form.attribute_source}
                     options={vocab.data?.fact_attribute_source ?? []} onChange={(v) => set('attribute_source', v)} allowNone />
          <PickField id="f-status" label="Definition status" value={form.definition_status}
                     options={vocab.data?.fact_definition_status ?? []} onChange={(v) => set('definition_status', v)} allowNone />
          <div className="space-y-1">
            <CheckField id="f-req" label="Required" checked={form.is_required} onChange={(v) => set('is_required', v)} />
            <CheckField id="f-pre" label="May be pre-filled from system data" checked={form.auto_prefill_allowed}
                        onChange={(v) => set('auto_prefill_allowed', v)} />
            <CheckField id="f-edit" label="An officer may edit the value" checked={form.officer_edit_allowed}
                        onChange={(v) => set('officer_edit_allowed', v)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={submit} data-rbac="aml_supervision.manage_config"
                  disabled={save.isPending || form.fact_code.trim().length < 2}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save fact definition' : 'Add fact definition'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
