import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useCreateEscalation, usePrudentialEntities } from '@/hooks/usePrudentialSupervision';

const TYPES = ['senior_supervisor_review','enforcement_referral','board_level_concern','immediate_risk','cross_regulator'];

interface Defaults {
  entity_id?: string;
  related_type?: 'entity'|'return'|'assessment'|'action';
  related_id?: string;
  escalation_type?: string;
  reason?: string;
  priority?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaults?: Defaults | null;
  onCreated?: (id: string) => void;
}

export function CreatePrudentialEscalationDialog({ open, onOpenChange, defaults, onCreated }: Props) {
  const create = useCreateEscalation();
  const { data: entities = [] } = usePrudentialEntities();
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (open) setForm({
      related_type: 'entity', escalation_type: 'senior_supervisor_review', priority: 'medium',
      ...(defaults || {}),
    });
  }, [open, defaults]);

  const submit = async () => {
    if (create.isPending) return;
    try {
      const res: any = await create.mutateAsync(form);
      onOpenChange(false);
      if (res?.id && onCreated) onCreated(res.id);
    } catch { /* toast handled in hook */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New prudential escalation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Entity</Label>
            <Select value={form.entity_id || ''} onValueChange={(v) => setForm({ ...form, entity_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
              <SelectContent>{entities.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Type</Label>
              <Select value={form.escalation_type} onValueChange={(v) => setForm({ ...form, escalation_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g,' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['low','medium','high','critical'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Reason / evidence <span className="text-destructive">*</span></Label>
            <Textarea rows={4} value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={create.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!form.entity_id || !form.reason || form.reason.trim().length < 5 || create.isPending} onClick={submit}>
            {create.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>) : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreatePrudentialEscalationDialog;
