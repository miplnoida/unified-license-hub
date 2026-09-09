/**
 * Governed response-semantics authoring.
 *
 * A profile states what each response MEANS supervisorily. The server refuses a
 * profile with no response meaning, and refuses retirement while an active
 * question still uses it.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  useSaveMethodologySemanticProfile,
  type MethodologySemanticProfile,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { AreaField, TextField, orNull } from './StudioKit';

interface Props {
  methodologyId: string;
  open: boolean;
  onClose: () => void;
  existing?: MethodologySemanticProfile | null;
}

type Pair = { key: string; meaning: string };

function initial(p?: MethodologySemanticProfile | null) {
  const entries = Object.entries(p?.response_meaning ?? {});
  return {
    semantic_code: p?.semantic_code ?? '',
    label: p?.label ?? '',
    description: p?.description ?? '',
    pairs: (entries.length ? entries.map(([k, v]) => ({
      key: k, meaning: typeof v === 'object' ? JSON.stringify(v) : String(v),
    })) : [{ key: '', meaning: '' }]) as Pair[],
  };
}

export function SemanticProfileEditorDialog({ methodologyId, open, onClose, existing }: Props) {
  const [form, setForm] = useState(() => initial(existing));
  const save = useSaveMethodologySemanticProfile();
  const isEdit = !!existing;

  useEffect(() => { if (open) setForm(initial(existing)); }, [open, existing]);

  const setPair = (i: number, field: keyof Pair, v: string) =>
    setForm((p) => ({ ...p, pairs: p.pairs.map((row, idx) => (idx === i ? { ...row, [field]: v } : row)) }));

  const meaning = Object.fromEntries(
    form.pairs.filter((p) => p.key.trim() && p.meaning.trim()).map((p) => [p.key.trim(), p.meaning.trim()]));

  const submit = async () => {
    try {
      await save.mutateAsync({
        methodologyId,
        profiles: [{
          semantic_code: form.semantic_code.trim().toUpperCase(),
          label: orNull(form.label),
          description: orNull(form.description),
          response_meaning: meaning,
        }],
      });
      toast.success(isEdit ? 'Response semantics saved' : 'Response semantics profile added');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The profile could not be saved');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${existing?.semantic_code}` : 'Add a response semantics profile'}</DialogTitle>
          <DialogDescription>
            State what each permitted response means supervisorily. The profile belongs to this version only.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="s-code" label="Semantic code" mono disabled={isEdit}
                     value={form.semantic_code} onChange={(v) => setForm((p) => ({ ...p, semantic_code: v }))} />
          <TextField id="s-label" label="Label" value={form.label}
                     onChange={(v) => setForm((p) => ({ ...p, label: v }))} />
          <AreaField id="s-desc" label="Description" value={form.description}
                     onChange={(v) => setForm((p) => ({ ...p, description: v }))} />

          <div className="space-y-2 sm:col-span-2">
            <Label>Response meaning</Label>
            {form.pairs.map((pair, i) => (
              <div key={i} className="grid grid-cols-[10rem_minmax(0,1fr)] gap-2">
                <Input aria-label={`Response ${i + 1}`} placeholder="Response" className="font-mono"
                       value={pair.key} onChange={(e) => setPair(i, 'key', e.target.value)} />
                <Input aria-label={`Meaning ${i + 1}`} placeholder="What this response means"
                       value={pair.meaning} onChange={(e) => setPair(i, 'meaning', e.target.value)} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm"
                    onClick={() => setForm((p) => ({ ...p, pairs: [...p.pairs, { key: '', meaning: '' }] }))}>
              Add a response
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={submit} data-rbac="aml_supervision.manage_config"
                  disabled={save.isPending || form.semantic_code.trim().length < 2 || Object.keys(meaning).length === 0}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save profile' : 'Add profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
