/**
 * Governed methodology metadata authoring.
 *
 * Identity (code, version), origin, ownership and approval state are not
 * editable and are not sent: `supervisory_methodology_metadata_save` ignores
 * them and refuses any version that is not a draft or in review.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useSaveMethodologyMetadata } from '@/hooks/useSupervisoryMethodologyAdmin';
import { AreaField, SectionTitle, TextField, orNull } from './StudioKit';

interface Props {
  methodologyId: string;
  open: boolean;
  onClose: () => void;
  detail: Record<string, any>;
}

function initial(d: Record<string, any>) {
  const def = (d?.definition ?? {}) as Record<string, any>;
  return {
    name: d?.name ?? '',
    title: d?.title ?? '',
    description: def.description ?? '',
    purpose: def.purpose ?? '',
    scope: def.scope ?? '',
    legal_basis: def.legal_basis ?? '',
    change_summary: def.change_summary ?? '',
    notes: def.notes ?? '',
    effective_from: (d?.effective_from ?? '') as string,
    effective_to: (d?.effective_to ?? '') as string,
    assessment_frequency_months: d?.assessment_frequency_months ? String(d.assessment_frequency_months) : '',
    calculation_guidance: d?.calculation_guidance ?? '',
    rationale: '',
  };
}

export function MetadataEditorDialog({ methodologyId, open, onClose, detail }: Props) {
  const [form, setForm] = useState(() => initial(detail));
  const save = useSaveMethodologyMetadata();

  useEffect(() => { if (open) setForm(initial(detail)); }, [open, detail]);
  const set = (k: keyof ReturnType<typeof initial>, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    try {
      await save.mutateAsync({
        methodologyId,
        payload: {
          expected_updated_at: detail?.updated_at ?? null,
          name: form.name.trim(),
          title: orNull(form.title),
          description: orNull(form.description),
          purpose: orNull(form.purpose),
          scope: orNull(form.scope),
          legal_basis: orNull(form.legal_basis),
          change_summary: orNull(form.change_summary),
          notes: orNull(form.notes),
          effective_from: orNull(form.effective_from),
          effective_to: form.effective_to.trim(),
          assessment_frequency_months: orNull(form.assessment_frequency_months),
          calculation_guidance: orNull(form.calculation_guidance),
          rationale: orNull(form.rationale),
        },
      });
      toast.success('Methodology details saved');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The details could not be saved');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit methodology details</DialogTitle>
          <DialogDescription>
            Code, version, owner and approval state cannot be changed here. A new version is created through
            "New version"; approval is a separate governed decision.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="m-name" label="Name" value={form.name} onChange={(v) => set('name', v)} />
          <TextField id="m-title" label="Title" value={form.title} onChange={(v) => set('title', v)} />
          <AreaField id="m-description" label="Description" value={form.description} onChange={(v) => set('description', v)} />
          <AreaField id="m-purpose" label="Supervisory purpose" value={form.purpose} onChange={(v) => set('purpose', v)} />
          <AreaField id="m-scope" label="Scope" value={form.scope} onChange={(v) => set('scope', v)} />
          <AreaField id="m-legal" label="Legal basis" value={form.legal_basis} onChange={(v) => set('legal_basis', v)} />

          <SectionTitle>Applicability and timing</SectionTitle>
          <TextField id="m-from" label="Effective from" type="date" value={form.effective_from} onChange={(v) => set('effective_from', v)} />
          <TextField id="m-to" label="Effective to" type="date" value={form.effective_to} onChange={(v) => set('effective_to', v)}
                     hint="Leave empty for an open period." />
          <TextField id="m-freq" label="Assessment frequency (months)" type="number"
                     value={form.assessment_frequency_months} onChange={(v) => set('assessment_frequency_months', v)} />

          <SectionTitle>Guidance and change record</SectionTitle>
          <AreaField id="m-calc" label="Calculation guidance (narrative only)" value={form.calculation_guidance}
                     onChange={(v) => set('calculation_guidance', v)}
                     hint="Narrative guidance only. An approved calculation configuration is a separate policy decision." />
          <AreaField id="m-change" label="Change summary for this version" value={form.change_summary} onChange={(v) => set('change_summary', v)} />
          <AreaField id="m-notes" label="Internal notes" value={form.notes} onChange={(v) => set('notes', v)} />
          <TextField id="m-rationale" label="Reason for this change (optional)" value={form.rationale} onChange={(v) => set('rationale', v)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending || form.name.trim().length < 3}
                  data-rbac="aml_supervision.manage_config">
            {save.isPending ? 'Saving…' : 'Save details'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
