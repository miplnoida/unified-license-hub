/**
 * F6-X — Currency & Exchange Rate administration.
 *
 * Regulator-facing surface for the governed monetary contract:
 *  - currency master (codes, symbols, precision, active state)
 *  - base / reporting currency and accepted settlement currencies
 *  - effective-dated exchange rates with regime and maker-checker approval
 *
 * Nothing on this page prices anything. Every write goes through a governed
 * server routine (`currency_master_save`, `monetary_config_save`,
 * `fx_rate_propose`, `fx_rate_decide`, `fx_rate_supersede`) and the server
 * remains the sole authority on configuration, rates and conversions.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { formatDateOnly } from '@/lib/datetime';

type Row = Record<string, any>;

const REGIMES = [
  { value: 'MARKET', label: 'Market (per effective date)' },
  { value: 'EFFECTIVE_UNTIL_CHANGED', label: 'Effective until changed' },
  { value: 'FIXED', label: 'Fixed / pegged' },
];

export default function CurrencySettings() {
  const qc = useQueryClient();

  const currencies = useQuery({
    queryKey: ['currency_master'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('currencies')
        .select('code, name, display_symbol, decimal_precision, is_active')
        .order('code');
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const config = useQuery({
    queryKey: ['monetary_config_resolved'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('monetary_config_resolve');
      if (error) throw error;
      return (data ?? null) as Row | null;
    },
    retry: false,
  });

  const rates = useQuery({
    queryKey: ['fx_rates_admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('*')
        .order('effective_from', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const activeCodes = useMemo(
    () => (currencies.data ?? []).filter((c) => c.is_active).map((c) => String(c.code)),
    [currencies.data],
  );

  /* ---------------------------------------------------------------- master */
  const [master, setMaster] = useState({ code: '', name: '', symbol: '', precision: '2' });
  const saveCurrency = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('currency_master_save', {
        _code: master.code.trim().toUpperCase(),
        _name: master.name.trim() || null,
        _display_symbol: master.symbol.trim() || null,
        _decimal_precision: Number(master.precision),
        _is_active: true,
        _reason: 'Currency master maintained from Currency & FX settings',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Currency saved.');
      setMaster({ code: '', name: '', symbol: '', precision: '2' });
      qc.invalidateQueries({ queryKey: ['currency_master'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save the currency.'),
  });

  const toggleCurrency = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase.rpc('currency_master_save', {
        _code: String(row.code),
        _is_active: !row.is_active,
        _reason: 'Currency active state changed from Currency & FX settings',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['currency_master'] }),
    onError: (e: any) => toast.error(e?.message ?? 'Could not update the currency.'),
  });

  /* ---------------------------------------------------------------- config */
  const [base, setBase] = useState('');
  const [reporting, setReporting] = useState('');
  const saveConfig = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (base) payload.base_currency = base;
      if (reporting) payload.reporting_currency = reporting;
      if (!Object.keys(payload).length) throw new Error('Choose a base or reporting currency first.');
      const { error } = await supabase.rpc('monetary_config_save', {
        _payload: payload,
        _reason: 'Monetary configuration updated from Currency & FX settings',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Monetary configuration updated.');
      qc.invalidateQueries({ queryKey: ['monetary_config_resolved'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not update the configuration.'),
  });

  /* ----------------------------------------------------------------- rates */
  const [rate, setRate] = useState({
    from: '', to: '', value: '', effective_from: '', effective_to: '',
    regime: 'EFFECTIVE_UNTIL_CHANGED', reference: '',
  });
  const proposeRate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('fx_rate_propose', {
        _from: rate.from,
        _to: rate.to,
        _rate: Number(rate.value),
        _effective_from: rate.effective_from,
        _effective_to: rate.effective_to || null,
        _regime: rate.regime,
        _provenance_reference: rate.reference.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rate proposed — it must be approved by a different officer.');
      setRate({ from: '', to: '', value: '', effective_from: '', effective_to: '', regime: 'EFFECTIVE_UNTIL_CHANGED', reference: '' });
      qc.invalidateQueries({ queryKey: ['fx_rates_admin'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not propose the rate.'),
  });

  const decideRate = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc('fx_rate_decide', { _rate_id: id, _approve: approve });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Decision recorded.');
      qc.invalidateQueries({ queryKey: ['fx_rates_admin'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not record the decision.'),
  });

  const supersede = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('fx_rate_supersede', {
        _rate_id: id,
        _reason: 'Superseded from Currency & FX settings',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rate superseded — historical conversions are unchanged.');
      qc.invalidateQueries({ queryKey: ['fx_rates_admin'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not supersede the rate.'),
  });

  const cfg = config.data;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Currency & exchange rates"
          description="Base and reporting currency, the currency master, and effective-dated exchange rates. All figures of record are produced by the server."
        />

        <Card>
          <CardHeader><CardTitle className="text-base">Current monetary configuration</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {config.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
            ) : config.error || !cfg ? (
              <p className="text-destructive">
                No monetary configuration is in force. Fees and payments fail closed until a base and reporting currency are configured.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Base currency</p><p className="font-mono font-medium">{cfg.base_currency}</p></div>
                <div><p className="text-xs text-muted-foreground">Reporting currency</p><p className="font-mono font-medium">{cfg.reporting_currency}</p></div>
                <div><p className="text-xs text-muted-foreground">Cross-currency policy</p><p className="font-mono">{cfg.cross_currency_policy ?? '—'}</p></div>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="rates">
          <TabsList>
            <TabsTrigger value="rates">Exchange rates</TabsTrigger>
            <TabsTrigger value="currencies">Currency master</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------------- rates */}
          <TabsContent value="rates" className="space-y-4 pt-4">
            <PermissionGate module="fee_management" action="edit">
              <Card>
                <CardHeader><CardTitle className="text-base">Propose a rate</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>From</Label>
                    <Select value={rate.from} onValueChange={(v) => setRate((r) => ({ ...r, from: v }))}>
                      <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
                      <SelectContent>{activeCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>To</Label>
                    <Select value={rate.to} onValueChange={(v) => setRate((r) => ({ ...r, to: v }))}>
                      <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
                      <SelectContent>{activeCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Units of “to” per one “from”</Label>
                    <Input inputMode="decimal" value={rate.value} onChange={(e) => setRate((r) => ({ ...r, value: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Effective from</Label>
                    <Input type="date" value={rate.effective_from} onChange={(e) => setRate((r) => ({ ...r, effective_from: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Effective to (optional)</Label>
                    <Input type="date" value={rate.effective_to} onChange={(e) => setRate((r) => ({ ...r, effective_to: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Regime</Label>
                    <Select value={rate.regime} onValueChange={(v) => setRate((r) => ({ ...r, regime: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{REGIMES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Source reference</Label>
                    <Input value={rate.reference} onChange={(e) => setRate((r) => ({ ...r, reference: e.target.value }))} placeholder="e.g. central bank circular reference" />
                  </div>
                  <div className="flex items-end">
                    <Button
                      data-rbac="fee_management.edit"
                      disabled={proposeRate.isPending || !rate.from || !rate.to || !rate.value || !rate.effective_from}
                      onClick={() => proposeRate.mutate()}
                    >
                      {proposeRate.isPending ? 'Proposing…' : 'Propose rate'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </PermissionGate>

            <Card>
              <CardHeader><CardTitle className="text-base">Rate register</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {rates.isLoading ? (
                  <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
                ) : (rates.data ?? []).length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">No exchange rates have been recorded.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3">Pair</th>
                        <th className="py-2 pr-3 text-right">Rate</th>
                        <th className="py-2 pr-3">Effective</th>
                        <th className="py-2 pr-3">Regime</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {(rates.data ?? []).map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 pr-3 font-mono">{r.from_currency} → {r.to_currency}</td>
                          <td className="py-2 pr-3 text-right font-mono">{r.rate}</td>
                          <td className="py-2 pr-3">
                            {formatDateOnly(r.effective_from)}{r.effective_to ? ` – ${formatDateOnly(r.effective_to)}` : ''}
                          </td>
                          <td className="py-2 pr-3">{r.regime}</td>
                          <td className="py-2 pr-3"><Badge variant="outline">{r.status}</Badge></td>
                          <td className="py-2 pr-3">
                            <PermissionGate module="fee_management" action="edit">
                              <div className="flex justify-end gap-2">
                                {r.status === 'PENDING_APPROVAL' && (
                                  <>
                                    <Button size="sm" data-rbac="fee_management.edit" onClick={() => decideRate.mutate({ id: r.id, approve: true })}>Approve</Button>
                                    <Button size="sm" variant="outline" data-rbac="fee_management.edit" onClick={() => decideRate.mutate({ id: r.id, approve: false })}>Reject</Button>
                                  </>
                                )}
                                {r.status === 'ACTIVE' && (
                                  <Button size="sm" variant="outline" data-rbac="fee_management.edit" onClick={() => supersede.mutate(r.id)}>Supersede</Button>
                                )}
                              </div>
                            </PermissionGate>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------------------------------------------------- currencies */}
          <TabsContent value="currencies" className="space-y-4 pt-4">
            <PermissionGate module="fee_management" action="edit">
              <Card>
                <CardHeader><CardTitle className="text-base">Add or update a currency</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label>ISO code</Label>
                    <Input maxLength={3} value={master.code} onChange={(e) => setMaster((m) => ({ ...m, code: e.target.value.toUpperCase() }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={master.name} onChange={(e) => setMaster((m) => ({ ...m, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Symbol</Label>
                    <Input value={master.symbol} onChange={(e) => setMaster((m) => ({ ...m, symbol: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Decimals</Label>
                    <Input inputMode="numeric" value={master.precision} onChange={(e) => setMaster((m) => ({ ...m, precision: e.target.value }))} />
                  </div>
                  <div className="flex items-end">
                    <Button data-rbac="fee_management.edit" disabled={master.code.length !== 3 || saveCurrency.isPending} onClick={() => saveCurrency.mutate()}>
                      {saveCurrency.isPending ? 'Saving…' : 'Save currency'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </PermissionGate>

            <Card>
              <CardContent className="overflow-x-auto pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Code</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Symbol</th>
                      <th className="py-2 pr-3 text-right">Decimals</th>
                      <th className="py-2 pr-3">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currencies.data ?? []).map((c) => (
                      <tr key={c.code} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-3 font-mono font-medium">{c.code}</td>
                        <td className="py-2 pr-3">{c.name ?? '—'}</td>
                        <td className="py-2 pr-3">{c.display_symbol ?? '—'}</td>
                        <td className="py-2 pr-3 text-right font-mono">{c.decimal_precision ?? 2}</td>
                        <td className="py-2 pr-3">
                          <PermissionGate
                            module="fee_management"
                            action="edit"
                            fallback={<Badge variant="outline">{c.is_active ? 'Active' : 'Inactive'}</Badge>}
                          >
                            <Switch
                              data-rbac="fee_management.edit"
                              checked={!!c.is_active}
                              onCheckedChange={() => toggleCurrency.mutate(c)}
                            />
                          </PermissionGate>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------ configuration */}
          <TabsContent value="configuration" className="pt-4">
            <PermissionGate
              module="fee_management"
              action="edit"
              fallback={<p className="text-sm text-muted-foreground">You do not have authority to change the monetary configuration.</p>}
            >
              <Card>
                <CardHeader><CardTitle className="text-base">Base & reporting currency</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Base currency</Label>
                    <Select value={base} onValueChange={setBase}>
                      <SelectTrigger><SelectValue placeholder={cfg?.base_currency ?? 'Not configured'} /></SelectTrigger>
                      <SelectContent>{activeCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Reporting currency</Label>
                    <Select value={reporting} onValueChange={setReporting}>
                      <SelectTrigger><SelectValue placeholder={cfg?.reporting_currency ?? 'Not configured'} /></SelectTrigger>
                      <SelectContent>{activeCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button data-rbac="fee_management.edit" disabled={saveConfig.isPending} onClick={() => saveConfig.mutate()}>
                      {saveConfig.isPending ? 'Saving…' : 'Save configuration'}
                    </Button>
                  </div>
                  <p className="sm:col-span-3 text-xs text-muted-foreground">
                    Changing the reporting currency affects future reporting provenance only. Historical conversions already
                    recorded against a payment are immutable and are never recalculated.
                  </p>
                </CardContent>
              </Card>
            </PermissionGate>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
