import { baseCurrency, formatRecordMoney } from '@/lib/money';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';
import {
import { CurrencySelect } from '@/components/shared/CurrencySelect';
  PAYMENT_TYPES,
  labelOf,
  usePaymentOperators,
  useRetailVolumes,
  useSaveRetailVolume,
} from '@/hooks/usePaymentSystems';

interface Props { operatorId?: string }

export function RetailPaymentsPanel({ operatorId }: Props) {
  const { data: rows = [], isLoading } = useRetailVolumes();
  const { data: operators = [] } = usePaymentOperators();
  const save = useSaveRetailVolume();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    operator_id: operatorId ?? '',
    period_start: '',
    period_end: '',
    payment_type: 'card',
    transaction_count: '',
    transaction_value: '',
    currency: '',
  });

  const names = useMemo(() => new Map(operators.map(o => [o.id, o.operator_name])), [operators]);
  const visible = operatorId ? rows.filter(r => r.operator_id === operatorId) : rows;

  // Transaction counts aggregate across currencies; values MUST NOT be summed
  // across different currencies, so values are grouped per currency.
  const byType = useMemo(() => {
    const m = new Map<string, { count: number; values: Map<string, number> }>();
    for (const r of visible) {
      const cur = m.get(r.payment_type) ?? { count: 0, values: new Map<string, number>() };
      cur.count += Number(r.transaction_count ?? 0);
      const ccy = r.currency || baseCurrency() || '';
      cur.values.set(ccy, (cur.values.get(ccy) ?? 0) + Number(r.transaction_value ?? 0));
      m.set(r.payment_type, cur);
    }
    return m;
  }, [visible]);


  const submit = async () => {
    await save.mutateAsync({
      operator_id: form.operator_id,
      period_start: form.period_start,
      period_end: form.period_end,
      payment_type: form.payment_type,
      transaction_count: Number(form.transaction_count || 0),
      transaction_value: Number(form.transaction_value || 0),
      currency: form.currency,
    });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        {PAYMENT_TYPES.map(t => (
          <Card key={t.value}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="text-lg font-semibold font-mono">
                {(byType.get(t.value)?.count ?? 0).toLocaleString()}
              </p>
              {[...(byType.get(t.value)?.values ?? new Map<string, number>())].map(([ccy, val]) => (
                <p key={ccy} className="text-xs text-muted-foreground font-mono">
                  {ccy} {val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              ))}
              {!byType.get(t.value)?.values.size && (
                <p className="text-xs text-muted-foreground font-mono">—</p>
              )}

            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button size="sm" data-rbac="prudential_supervision.create" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Record period figures
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Retail payments volumes</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operator</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Currency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell></TableRow>
              )}
              {!isLoading && !visible.length && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No retail payments figures recorded.
                </TableCell></TableRow>
              )}
              {visible.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{names.get(r.operator_id) ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {new Date(r.period_start).toLocaleDateString()} – {new Date(r.period_end).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{labelOf(PAYMENT_TYPES, r.payment_type)}</TableCell>
                  <TableCell className="text-right font-mono">{Number(r.transaction_count).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{formatRecordMoney(r.transaction_value, r.currency)}</TableCell>
                  <TableCell>{r.currency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record retail payments figures</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            {!operatorId && (
              <div className="md:col-span-2">
                <Label>Operator</Label>
                <Select value={form.operator_id} onValueChange={v => setForm((f: any) => ({ ...f, operator_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose operator" /></SelectTrigger>
                  <SelectContent>
                    {operators.map(o => <SelectItem key={o.id} value={o.id}>{o.operator_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Period start</Label>
              <Input type="date" value={form.period_start}
                onChange={e => setForm((f: any) => ({ ...f, period_start: e.target.value }))} />
            </div>
            <div>
              <Label>Period end</Label>
              <Input type="date" value={form.period_end}
                onChange={e => setForm((f: any) => ({ ...f, period_end: e.target.value }))} />
            </div>
            <div>
              <Label>Instrument</Label>
              <Select value={form.payment_type} onValueChange={v => setForm((f: any) => ({ ...f, payment_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <CurrencySelect value={form.currency} onChange={code => setForm((f: any) => ({ ...f, currency: code }))} />
            </div>
            <div>
              <Label>Transaction count</Label>
              <Input type="number" min={0} value={form.transaction_count}
                onChange={e => setForm((f: any) => ({ ...f, transaction_count: e.target.value }))} />
            </div>
            <div>
              <Label>Transaction value</Label>
              <Input type="number" min={0} value={form.transaction_value}
                onChange={e => setForm((f: any) => ({ ...f, transaction_value: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.operator_id || !form.period_start || !form.period_end || save.isPending}
              onClick={submit}>
              {save.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
