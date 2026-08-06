import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { usePrudentialEntities } from '@/hooks/usePrudentialSupervision';
import {
  AML_STATUSES,
  LICENSE_STATUSES,
  OPERATOR_TYPES,
  OperatorRow,
  useSaveOperator,
} from '@/hooks/usePaymentSystems';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  operator?: OperatorRow | null;
  defaultType?: string;
  onSaved?: (id: string) => void;
}

export function OperatorDialog({ open, onOpenChange, operator, defaultType, onSaved }: Props) {
  const save = useSaveOperator();
  const { data: entities = [] } = usePrudentialEntities();
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (!open) return;
    setForm({
      operator_name: operator?.operator_name ?? '',
      operator_type: operator?.operator_type ?? defaultType ?? 'ach',
      entity_id: operator?.entity_id ?? 'none',
      licence_number: operator?.licence_number ?? '',
      license_status: operator?.license_status ?? 'active',
      designation_date: operator?.designation_date ?? '',
      systemically_important: operator?.systemically_important ?? false,
      active_agents_count: operator?.active_agents_count ?? '',
      aml_compliance_status: operator?.aml_compliance_status ?? 'not_assessed',
      contact_name: operator?.contact_name ?? '',
      contact_email: operator?.contact_email ?? '',
      contact_phone: operator?.contact_phone ?? '',
      notes: operator?.notes ?? '',
    });
  }, [open, operator, defaultType]);

  const submit = async () => {
    const payload: Record<string, any> = {
      operator_name: form.operator_name,
      operator_type: form.operator_type,
      entity_id: form.entity_id === 'none' ? null : form.entity_id,
      licence_number: form.licence_number || null,
      license_status: form.license_status,
      designation_date: form.designation_date || null,
      systemically_important: !!form.systemically_important,
      active_agents_count: form.active_agents_count === '' ? null : Number(form.active_agents_count),
      aml_compliance_status: form.aml_compliance_status,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      notes: form.notes || null,
    };
    if (operator?.id) payload.id = operator.id;
    const saved = await save.mutateAsync(payload);
    onOpenChange(false);
    if (saved?.id) onSaved?.(saved.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{operator ? 'Edit operator' : 'Add operator to register'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Operator name</Label>
            <Input value={form.operator_name ?? ''}
              onChange={e => setForm((f: any) => ({ ...f, operator_name: e.target.value }))}
              placeholder="e.g. National Payments Switch Ltd" />
          </div>
          <div>
            <Label>Operator type</Label>
            <Select value={form.operator_type} onValueChange={v => setForm((f: any) => ({ ...f, operator_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPERATOR_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Licence status</Label>
            <Select value={form.license_status} onValueChange={v => setForm((f: any) => ({ ...f, license_status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LICENSE_STATUSES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Linked supervised entity</Label>
            <Select value={form.entity_id} onValueChange={v => setForm((f: any) => ({ ...f, entity_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {entities.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Licence number</Label>
            <Input value={form.licence_number ?? ''}
              onChange={e => setForm((f: any) => ({ ...f, licence_number: e.target.value }))} />
          </div>
          <div>
            <Label>Designation date</Label>
            <Input type="date" value={form.designation_date ?? ''}
              onChange={e => setForm((f: any) => ({ ...f, designation_date: e.target.value }))} />
          </div>
          <div>
            <Label>Active agents</Label>
            <Input type="number" min={0} value={form.active_agents_count ?? ''}
              onChange={e => setForm((f: any) => ({ ...f, active_agents_count: e.target.value }))} />
          </div>
          <div>
            <Label>AML compliance status</Label>
            <Select value={form.aml_compliance_status}
              onValueChange={v => setForm((f: any) => ({ ...f, aml_compliance_status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AML_STATUSES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label className="cursor-pointer">Systemically important</Label>
              <p className="text-xs text-muted-foreground">Flag for heightened oversight</p>
            </div>
            <Switch checked={!!form.systemically_important}
              onCheckedChange={v => setForm((f: any) => ({ ...f, systemically_important: v }))} />
          </div>
          <div>
            <Label>Contact name</Label>
            <Input value={form.contact_name ?? ''}
              onChange={e => setForm((f: any) => ({ ...f, contact_name: e.target.value }))} />
          </div>
          <div>
            <Label>Contact email</Label>
            <Input type="email" value={form.contact_email ?? ''}
              onChange={e => setForm((f: any) => ({ ...f, contact_email: e.target.value }))} />
          </div>
          <div>
            <Label>Contact phone</Label>
            <Input value={form.contact_phone ?? ''}
              onChange={e => setForm((f: any) => ({ ...f, contact_phone: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes ?? ''}
              onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!form.operator_name || save.isPending} onClick={submit}>
            {save.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
