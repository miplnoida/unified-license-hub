/**
 * Governed parameter DEFINITION authoring.
 *
 * There is deliberately no value field. `supervisory_methodology_parameter_set`
 * refuses any payload carrying a value or an approval status: an approved
 * materiality or threshold value is a regulator policy decision taken in the
 * calculation / materiality policy layer, not an administration convenience.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useSaveMethodologyParameter,
  useSupervisoryMethodologyVocabulary,
  type MethodologyParameterRow,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { AreaField, PickField, SectionTitle, TextField, orNull, pickValue } from './StudioKit';

interface Props {
  methodologyId: string;
  open: boolean;
  onClose: () => void;
  existing?: (MethodologyParameterRow & Record<string, any>) | null;
}

function initial(p?: Record<string, any> | null) {
  return {
    parameter_code: p?.parameter_code ?? '',
    parameter_kind: p?.parameter_kind ?? '',
    label: p?.label ?? '',
    description: p?.description ?? '',
    intended_usage: p?.intended_usage ?? '',
    applicability_guidance: p?.applicability_guidance ?? '',
    data_type: p?.data_type ?? '',
    unit: p?.unit ?? '',
  };
}

export function ParameterEditorDialog({ methodologyId, open, onClose, existing }: Props) {
  const [form, setForm] = useState(() => initial(existing));
  const vocab = useSupervisoryMethodologyVocabulary(open);
  const save = useSaveMethodologyParameter();
  const isEdit = !!existing?.parameter_code;

  useEffect(() => { if (open) setForm(initial(existing)); }, [open, existing]);
  const set = (k: keyof ReturnType<typeof initial>, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    try {
      await save.mutateAsync({
        methodologyId,
        parameters: [{
          parameter_code: form.parameter_code.trim().toUpperCase(),
          parameter_kind: pickValue(form.parameter_kind) ?? 'MATERIALITY',
          label: orNull(form.label),
          description: orNull(form.description),
          intended_usage: orNull(form.intended_usage),
          applicability_guidance: orNull(form.applicability_guidance),
          data_type: pickValue(form.data_type),
          unit: orNull(form.unit),
        }],
      });
      toast.success(isEdit ? 'Parameter definition saved' : 'Parameter definition added');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The parameter definition could not be saved');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${existing?.parameter_code}` : 'Add a parameter definition'}</DialogTitle>
          <DialogDescription>
            Definition only. The approved value is set through the calculation and materiality policy process, never here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="p-code" label="Parameter code" mono disabled={isEdit}
                     value={form.parameter_code} onChange={(v) => set('parameter_code', v)} />
          <PickField id="p-kind" label="Parameter kind" value={form.parameter_kind}
                     options={vocab.data?.parameter_kind ?? []} onChange={(v) => set('parameter_kind', v)} allowNone />
          <TextField id="p-label" label="Label" value={form.label} onChange={(v) => set('label', v)} />
          <PickField id="p-type" label="Data type" value={form.data_type}
                     options={vocab.data?.parameter_data_type ?? []} onChange={(v) => set('data_type', v)} allowNone />
          <TextField id="p-unit" label="Unit" value={form.unit} onChange={(v) => set('unit', v)} />

          <SectionTitle>What this parameter is for</SectionTitle>
          <AreaField id="p-desc" label="Description" value={form.description} onChange={(v) => set('description', v)} />
          <AreaField id="p-usage" label="Intended usage" value={form.intended_usage} onChange={(v) => set('intended_usage', v)} />
          <AreaField id="p-applic" label="Applicability guidance" value={form.applicability_guidance}
                     onChange={(v) => set('applicability_guidance', v)} />
        </div>

        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          Saving a definition does not approve a value. Until a value is approved in the calculation and materiality
          policy layer, this parameter remains unapproved and cannot be used in a calculation.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={submit} data-rbac="aml_supervision.manage_config"
                  disabled={save.isPending || form.parameter_code.trim().length < 2}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save definition' : 'Add definition'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
