/**
 * Governed dimension authoring. Weight, kind and group are validated by
 * `supervisory_methodology_dimension_save`; retirement is refused by the server
 * while a dimension still holds active questions.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useSaveMethodologyDimension,
  useSupervisoryMethodologyVocabulary,
  type MethodologyDimension,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { AreaField, CheckField, PickField, SectionTitle, TextField, orNull, pickValue } from './StudioKit';

interface Props {
  methodologyId: string;
  open: boolean;
  onClose: () => void;
  existing?: (MethodologyDimension & { updated_at?: string }) | null;
}

function initial(d?: MethodologyDimension | null) {
  return {
    dimension_code: d?.dimension_code ?? '',
    label: d?.label ?? '',
    description: d?.description ?? '',
    dimension_group: d?.dimension_group ?? '',
    dimension_kind: d?.dimension_kind ?? '',
    weight: d?.weight !== null && d?.weight !== undefined ? String(d.weight) : '',
    sort_order: d?.sort_order !== null && d?.sort_order !== undefined ? String(d.sort_order) : '100',
    evidence_required: d?.evidence_required ?? false,
    rationale: '',
  };
}

export function DimensionEditorDialog({ methodologyId, open, onClose, existing }: Props) {
  const [form, setForm] = useState(() => initial(existing));
  const vocab = useSupervisoryMethodologyVocabulary(open);
  const save = useSaveMethodologyDimension();
  const isEdit = !!existing;

  useEffect(() => { if (open) setForm(initial(existing)); }, [open, existing]);
  const set = (k: keyof ReturnType<typeof initial>, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    try {
      await save.mutateAsync({
        methodologyId,
        payload: {
          dimension_code: form.dimension_code.trim().toUpperCase(),
          label: form.label.trim(),
          description: orNull(form.description),
          dimension_group: pickValue(form.dimension_group) ?? 'OTHER',
          dimension_kind: pickValue(form.dimension_kind),
          weight: orNull(form.weight),
          sort_order: orNull(form.sort_order),
          evidence_required: form.evidence_required,
          rationale: orNull(form.rationale),
          ...(isEdit && existing?.updated_at ? { expected_updated_at: existing.updated_at } : {}),
        } as Record<string, unknown>,
      });
      toast.success(isEdit ? 'Dimension updated' : 'Dimension added to this draft version');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The dimension could not be saved');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${existing?.dimension_code}` : 'Add a dimension'}</DialogTitle>
          <DialogDescription>
            Weighted dimensions in a group must total 100 before this version can be submitted for review.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="d-code" label="Dimension code" mono disabled={isEdit}
                     value={form.dimension_code} onChange={(v) => set('dimension_code', v)} />
          <TextField id="d-label" label="Label" value={form.label} onChange={(v) => set('label', v)} />
          <AreaField id="d-desc" label="Description" value={form.description} onChange={(v) => set('description', v)} />

          <SectionTitle>Classification and weighting</SectionTitle>
          <PickField id="d-group" label="Dimension group" value={form.dimension_group}
                     options={vocab.data?.dimension_group ?? []} onChange={(v) => set('dimension_group', v)} allowNone />
          <PickField id="d-kind" label="Dimension kind" value={form.dimension_kind}
                     options={vocab.data?.dimension_kind ?? []} onChange={(v) => set('dimension_kind', v)} allowNone
                     noneLabel="Derive from group" />
          <TextField id="d-weight" label="Weight (0–100)" type="number" value={form.weight}
                     onChange={(v) => set('weight', v)} hint="Leave empty for an unweighted dimension." />
          <TextField id="d-sort" label="Display order" type="number" value={form.sort_order} onChange={(v) => set('sort_order', v)} />
          <CheckField id="d-evidence" label="Evidence is expected across this dimension"
                      checked={form.evidence_required} onChange={(v) => set('evidence_required', v)} />
          <TextField id="d-rationale" label="Reason for this change (optional)" value={form.rationale}
                     onChange={(v) => set('rationale', v)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={submit} data-rbac="aml_supervision.manage_config"
                  disabled={save.isPending || form.dimension_code.trim().length < 2 || form.label.trim().length < 2}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save dimension' : 'Add dimension'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
