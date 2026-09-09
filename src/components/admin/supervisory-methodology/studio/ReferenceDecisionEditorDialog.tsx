/**
 * Governed MIPL reference-decision authoring.
 *
 * `supervisory_methodology_reference_decision_record` records reference-design
 * approvals only: any other approval scope is refused, and a rationale of at
 * least 10 characters is mandatory. A reference decision is never a regulator
 * policy approval.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useRecordMethodologyReferenceDecision,
  type MethodologyReferenceDecisionRow,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { AreaField, TextField, orNull } from './StudioKit';

interface Props {
  methodologyId: string;
  domainCode: string;
  methodologyCode: string;
  methodologyVersion: string;
  open: boolean;
  onClose: () => void;
  existing?: MethodologyReferenceDecisionRow | null;
}

function initial(d?: MethodologyReferenceDecisionRow | null) {
  return {
    decision_code: d?.decision_code ?? '',
    title: d?.title ?? '',
    decision_text: d?.decision_text ?? '',
    rationale: d?.rationale ?? '',
  };
}

export function ReferenceDecisionEditorDialog({
  methodologyId, domainCode, methodologyCode, methodologyVersion, open, onClose, existing,
}: Props) {
  const [form, setForm] = useState(() => initial(existing));
  const record = useRecordMethodologyReferenceDecision();
  const isEdit = !!existing;

  useEffect(() => { if (open) setForm(initial(existing)); }, [open, existing]);
  const set = (k: keyof ReturnType<typeof initial>, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    try {
      await record.mutateAsync({
        methodologyId,
        decisions: [{
          domain_code: domainCode,
          methodology_code: methodologyCode,
          methodology_version: methodologyVersion,
          decision_code: form.decision_code.trim().toUpperCase(),
          title: orNull(form.title),
          decision_text: orNull(form.decision_text),
          approval_scope: 'MIPL_REFERENCE_APPROVAL',
          rationale: form.rationale.trim(),
        }],
      });
      toast.success('Reference decision recorded');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The reference decision could not be recorded');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${existing?.decision_code}` : 'Record a reference decision'}</DialogTitle>
          <DialogDescription>
            A reference decision records a methodology-design choice. It is not a regulator approval of policy.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="rd-code" label="Decision code" mono disabled={isEdit}
                     value={form.decision_code} onChange={(v) => set('decision_code', v)} />
          <TextField id="rd-title" label="Title" value={form.title} onChange={(v) => set('title', v)} />
          <AreaField id="rd-text" label="Decision" rows={3} value={form.decision_text} onChange={(v) => set('decision_text', v)} />
          <AreaField id="rd-rationale" label="Rationale (at least 10 characters)" rows={3}
                     value={form.rationale} onChange={(v) => set('rationale', v)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={record.isPending}>Cancel</Button>
          <Button onClick={submit} data-rbac="aml_supervision.manage_config"
                  disabled={record.isPending || form.decision_code.trim().length < 2 || form.rationale.trim().length < 10}>
            {record.isPending ? 'Recording…' : 'Record decision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
