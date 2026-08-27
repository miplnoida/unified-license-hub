import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useMandateMutations, useRegulatorMandates, useRegulators, useRegulatoryFunctions,
  useSectors, useSubSectors,
} from '@/hooks/useOperatingStructure';

const NONE = 'none';
const RESPONSIBILITY = ['LEAD', 'JOINT', 'SUPPORT', 'ADVISORY'];

const errText = (e: unknown) =>
  ((e as any)?.message || String(e)).replace(/^(BAD_INPUT|FORBIDDEN|UNAUTHORIZED|NOT_FOUND):\s*/, '');

/**
 * WHERE a regulator's responsibilities apply, and whether the mandate layer is
 * enforced for a regulator + function pair.
 *
 * Mandates are inert until enforcement is ACTIVE: while DRAFT, the mandate check
 * never narrows anything. Turning enforcement on is a deliberate, audited act.
 */
export function MandateAdminTab() {
  const regulators = useRegulators();
  const functions = useRegulatoryFunctions();
  const sectors = useSectors();
  const subSectors = useSubSectors();
  const data = useRegulatorMandates();
  const { saveMandate, setMandateStatus, setEnforcement } = useMandateMutations();

  const [regulatorId, setRegulatorId] = useState<string>('');
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    functionId: '', responsibilityType: 'LEAD', sectorId: NONE, subSectorId: NONE, notes: '',
  });

  const activeRegulator = regulatorId || (regulators.data || [])[0]?.id || '';
  const fnName = (id: string | null) => (functions.data || []).find((f: any) => f.id === id)?.name || '—';
  const secName = (id: string | null) =>
    id ? (sectors.data || []).find((s: any) => s.id === id)?.name || 'Sector' : 'All sectors';
  const subName = (id: string | null) =>
    id ? (subSectors.data || []).find((s: any) => s.id === id)?.name || 'Sub-sector' : null;

  const mandates = useMemo(
    () => (data.data?.mandates || []).filter((m: any) => m.regulator_id === activeRegulator),
    [data.data, activeRegulator],
  );
  const enforcementFor = (functionId: string) =>
    (data.data?.enforcement || []).find(
      (e: any) => e.regulator_id === activeRegulator && e.regulatory_function_id === functionId,
    );

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ functionId: '', responsibilityType: 'LEAD', sectorId: NONE, subSectorId: NONE, notes: '' });
    setDialog(true);
  };

  const openEdit = (m: any) => {
    setEditing(m);
    setForm({
      functionId: m.regulatory_function_id,
      responsibilityType: m.responsibility_type,
      sectorId: m.sector_id || NONE,
      subSectorId: m.sub_sector_id || NONE,
      notes: m.notes || '',
    });
    setDialog(true);
  };

  const submit = () =>
    act(async () => {
      await saveMandate.mutateAsync({
        id: editing?.id || null,
        regulatorId: activeRegulator,
        functionId: form.functionId,
        responsibilityType: form.responsibilityType,
        sectorId: form.sectorId === NONE ? null : form.sectorId,
        subSectorId: form.subSectorId === NONE ? null : form.subSectorId,
        notes: form.notes || null,
      });
      setDialog(false);
    }, editing ? 'Mandate updated' : 'Mandate recorded');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Regulator mandates</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={activeRegulator} onValueChange={setRegulatorId}>
              <SelectTrigger className="w-[240px]"><SelectValue placeholder="Regulator" /></SelectTrigger>
              <SelectContent>
                {(regulators.data || []).map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button data-rbac="user_management.create" size="sm" onClick={openCreate} disabled={!activeRegulator}>New mandate</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {mandates.map((m: any) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{fnName(m.regulatory_function_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {m.responsibility_type} · {secName(m.sector_id)}
                  {subName(m.sub_sector_id) ? ` → ${subName(m.sub_sector_id)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.status === 'active' ? 'default' : 'secondary'}>{m.status}</Badge>
                <Button data-rbac="user_management.edit" size="sm" variant="outline" onClick={() => openEdit(m)}>Edit</Button>
                <Button
                  size="sm"
                  variant={m.status === 'active' ? 'destructive' : 'secondary'}
                  onClick={() =>
                    act(
                      () => setMandateStatus.mutateAsync({
                        mandateId: m.id,
                        status: m.status === 'active' ? 'inactive' : 'active',
                      }),
                      'Mandate status updated',
                    )}
                >
                  {m.status === 'active' ? 'Retire' : 'Reactivate'}
                </Button>
              </div>
            </div>
          ))}
          {mandates.length === 0 && (
            <p className="text-sm text-muted-foreground">No mandates recorded for this regulator.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mandate enforcement</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            While a function is in <span className="font-medium">Draft</span>, the mandate layer places no
            restriction. Setting it to <span className="font-medium">Active</span> means a covering mandate
            is required for the exact regulator, function, sector and sub-sector — otherwise the action is
            denied.
          </p>
          {(functions.data || []).filter((f: any) => f.status === 'active').map((f: any) => {
            const e = enforcementFor(f.id);
            const status = e?.enforcement_status || 'DRAFT';
            const covered = mandates.some((m: any) => m.regulatory_function_id === f.id && m.status === 'active');
            return (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {covered ? 'Active mandate recorded' : 'No active mandate — cannot be enforced yet'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={status === 'ACTIVE' ? 'default' : 'secondary'}>{status}</Badge>
                  <Button
                    size="sm"
                    variant={status === 'ACTIVE' ? 'outline' : 'default'}
                    disabled={!activeRegulator || (status !== 'ACTIVE' && !covered)}
                    onClick={() =>
                      act(
                        () => setEnforcement.mutateAsync({
                          regulatorId: activeRegulator,
                          functionId: f.id,
                          status: status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE',
                        }),
                        'Enforcement updated',
                      )}
                  >
                    {status === 'ACTIVE' ? 'Return to draft' : 'Enforce'}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit mandate' : 'New mandate'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Regulatory function</Label>
              <Select value={form.functionId} onValueChange={(v) => setForm({ ...form, functionId: v })}>
                <SelectTrigger><SelectValue placeholder="Select function" /></SelectTrigger>
                <SelectContent>
                  {(functions.data || []).filter((f: any) => f.status === 'active').map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Responsibility</Label>
              <Select
                value={form.responsibilityType}
                onValueChange={(v) => setForm({ ...form, responsibilityType: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESPONSIBILITY.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sector</Label>
              <Select
                value={form.sectorId}
                onValueChange={(v) => setForm({ ...form, sectorId: v, subSectorId: NONE })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All sectors</SelectItem>
                  {(sectors.data || []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sub-sector (optional)</Label>
              <Select
                value={form.subSectorId}
                onValueChange={(v) => setForm({ ...form, subSectorId: v })}
                disabled={form.sectorId === NONE}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All sub-sectors of the sector</SelectItem>
                  {(subSectors.data || [])
                    .filter((s: any) => s.sector_id === form.sectorId)
                    .map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.functionId}>
              {editing ? 'Save changes' : 'Record mandate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
