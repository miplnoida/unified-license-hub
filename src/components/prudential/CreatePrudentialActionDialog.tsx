import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useCreateAction, usePrudentialEntities } from '@/hooks/usePrudentialSupervision';
import { useInternalUsers } from '@/hooks/useInternalUsers';

const TYPES = ['information_request','capital_plan','liquidity_plan','board_letter','onsite_inspection','enforcement_referral','restriction','monitoring'];

interface Defaults {
  entity_id?: string;
  source_type?: 'return_breach'|'assessment'|'manual'|'escalation'|'stress_indicator';
  source_id?: string;
  title?: string;
  description?: string;
  severity?: 'low'|'medium'|'high'|'critical';
  action_type?: string;
  due_date?: string;
  assigned_to?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaults?: Defaults | null;
  onCreated?: (id: string) => void;
}

export function CreatePrudentialActionDialog({ open, onOpenChange, defaults, onCreated }: Props) {
  const create = useCreateAction();
  const { data: entities = [] } = usePrudentialEntities();
  const { data: internalUsers = [] } = useInternalUsers();
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (open) setForm({
      severity: 'medium', action_type: 'information_request', source_type: 'manual',
      ...(defaults || {}),
    });
  }, [open, defaults]);

  const submit = async () => {
    if (create.isPending) return;
    // Coerce sentinel 'unassigned' back to null so DB column stays clean.
    const payload = { ...form };
    if (payload.assigned_to === 'unassigned' || payload.assigned_to === '') payload.assigned_to = null;
    try {
      const res: any = await create.mutateAsync(payload);
      onOpenChange(false);
      if (res?.id && onCreated) onCreated(res.id);
    } catch { /* toast handled in hook */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New prudential action</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Entity</Label>
            <Select value={form.entity_id || ''} onValueChange={(v) => setForm({ ...form, entity_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
              <SelectContent>{entities.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Title</Label><Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Type</Label>
              <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g,' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Severity</Label>
              <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['low','medium','high','critical'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Assign to</Label>
              <Select value={form.assigned_to || 'unassigned'} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {internalUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email || u.id.slice(0, 8)}
                      {u.primary_role ? ` · ${u.primary_role}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Due date</Label><Input type="date" value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={create.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!form.entity_id || !form.title || create.isPending} onClick={submit}>
            {create.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>) : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreatePrudentialActionDialog;
