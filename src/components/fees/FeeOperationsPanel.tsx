import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  decideFeeRefund,
  decideFeeWaiver,
  executeFeeRefund,
  feeErrorMessage,
  ingestReconciliation,
  money,
  resolveReconciliationItem,
} from '@/lib/fees/assessmentClient';

type Row = Record<string, any>;

/**
 * Regulator financial operations queue on /admin/fees.
 *
 * Reads are scoped by RLS; every mutation goes through the governed F6 RPC
 * adapter (maker-checker waiver / refund decisions, refund execution,
 * reconciliation ingest and exception resolution). No amount is computed here.
 */
export function FeeOperationsPanel() {
  const [waivers, setWaivers] = useState<Row[]>([]);
  const [refunds, setRefunds] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [source, setSource] = useState('BANK_STATEMENT');
  const [statementRef, setStatementRef] = useState('');
  // No currency literal is seeded here: the example is primed from the governed
  // monetary configuration so the screen can never imply a default currency.
  const [itemsJson, setItemsJson] = useState('[{"reference":"TXN-0001","amount":1000}]');

  const load = useCallback(async () => {
    setLoading(true);
    const [w, r, i, ru] = await Promise.all([
      supabase.from('fee_waivers' as any).select('*').order('requested_at', { ascending: false }).limit(50),
      supabase.from('refunds' as any).select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('fee_reconciliation_items' as any).select('*').in('status', ['UNMATCHED', 'EXCEPTION']).order('created_at', { ascending: false }).limit(50),
      supabase.from('fee_reconciliation_runs' as any).select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    setWaivers((w.data as Row[]) || []);
    setRefunds((r.data as Row[]) || []);
    setItems((i.data as Row[]) || []);
    setRuns((ru.data as Row[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Prime the reconciliation example with the configured base currency.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await (supabase as any).rpc('monetary_config_resolve');
      const cfg = Array.isArray(data) ? data[0] : data;
      const code = cfg?.base_currency;
      if (cancelled || !code) return;
      setItemsJson(`[{"reference":"TXN-0001","amount":1000,"currency":"${code}"}]`);
    })();
    return () => { cancelled = true; };
  }, []);


  const guarded = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(feeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Card><CardContent className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" /> Refresh
        </Button>
      </div>

      {/* Waivers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Waivers &amp; exemptions</CardTitle>
          <CardDescription>Maker-checker: the requester can never approve their own waiver.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Justification</TableHead>
                <TableHead className="text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waivers.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No waiver requests.</TableCell></TableRow>
              )}
              {waivers.map(w => (
                <TableRow key={w.id}>
                  <TableCell className="text-xs">{w.waiver_kind}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{money(w.requested_amount, w.currency)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{w.approved_amount == null ? '—' : money(w.approved_amount, w.currency)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{w.status}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate">{w.request_reason}</TableCell>
                  <TableCell className="text-right">
                    {w.status === 'PENDING' && (
                      <PermissionGate module="fee_management" action="edit">
                        <div className="flex justify-end gap-1">
                          <Button
                            data-rbac="fee_management.edit" size="sm" variant="outline" disabled={busy}
                            onClick={() => guarded(() => decideFeeWaiver(w.id, true, 'Approved after review of the waiver justification'), 'Waiver approved')}
                          >Approve</Button>
                          <Button
                            data-rbac="fee_management.edit" size="sm" variant="ghost" disabled={busy}
                            onClick={() => guarded(() => decideFeeWaiver(w.id, false, 'Rejected: justification does not meet waiver policy'), 'Waiver rejected')}
                          >Reject</Button>
                        </div>
                      </PermissionGate>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Refunds */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Refunds</CardTitle>
          <CardDescription>Decision then execution; execution writes a compensating ledger entry.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No refund requests.</TableCell></TableRow>
              )}
              {refunds.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    <Link to={`/payments/${r.payment_id}`} className="text-primary hover:underline">
                      {String(r.payment_id).slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{money(r.amount, r.currency)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{r.status}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{r.refund_reference || '—'}</TableCell>
                  <TableCell className="text-right">
                    <PermissionGate module="fee_management" action="edit">
                      <div className="flex justify-end gap-1">
                        {r.status === 'pending' && (
                          <>
                            <Button data-rbac="fee_management.edit" size="sm" variant="outline" disabled={busy}
                              onClick={() => guarded(() => decideFeeRefund(r.id, 'approved', 'Approved after refund eligibility review'), 'Refund approved')}
                            >Approve</Button>
                            <Button data-rbac="fee_management.edit" size="sm" variant="ghost" disabled={busy}
                              onClick={() => guarded(() => decideFeeRefund(r.id, 'rejected', 'Rejected: refund not payable under policy'), 'Refund rejected')}
                            >Reject</Button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <Button data-rbac="fee_management.edit" size="sm" disabled={busy}
                            onClick={() => guarded(() => executeFeeRefund(r.id, `RFD-${Date.now()}`), 'Refund executed')}
                          >Execute</Button>
                        )}
                      </div>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reconciliation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reconciliation</CardTitle>
          <CardDescription>
            Ingest a statement, then resolve unmatched items and exceptions. Matching is server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PermissionGate module="fee_management" action="edit">
            <div className="rounded-lg border p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Source</Label>
                  <Input value={source} onChange={e => setSource(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Statement reference</Label>
                  <Input value={statementRef} onChange={e => setStatementRef(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Statement items (JSON array: reference, amount, currency, value_date)</Label>
                <Textarea rows={4} className="font-mono text-xs" value={itemsJson} onChange={e => setItemsJson(e.target.value)} />
              </div>
              <Button
                data-rbac="fee_management.edit" size="sm" disabled={busy || !statementRef.trim()}
                onClick={() => guarded(async () => {
                  let parsed: unknown;
                  try { parsed = JSON.parse(itemsJson); } catch { throw new Error('Statement items must be a valid JSON array.'); }
                  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Provide at least one statement item.');
                  const res = await ingestReconciliation(source.trim(), statementRef.trim(), parsed as any);
                  toast.info(`Matched ${res.matched} · unmatched ${res.unmatched} · exceptions ${res.exceptions}`);
                }, 'Statement ingested')}
              >
                Ingest statement
              </Button>
            </div>
          </PermissionGate>

          {runs.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Latest runs:{' '}
              {runs.map(r => (
                <span key={r.id} className="mr-3 font-mono">
                  {r.statement_reference || r.source}: {r.matched_items}/{r.total_items} matched
                </span>
              ))}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>External reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Exception</TableHead>
                <TableHead className="text-right">Resolve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No open reconciliation items.</TableCell></TableRow>
              )}
              {items.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.external_reference}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{money(i.external_amount, i.external_currency)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{i.status}</Badge></TableCell>
                  <TableCell className="text-xs">{i.exception_code || '—'}</TableCell>
                  <TableCell className="text-right">
                    <PermissionGate module="fee_management" action="edit">
                      <Button data-rbac="fee_management.edit" size="sm" variant="outline" disabled={busy}
                        onClick={() => guarded(() => resolveReconciliationItem(i.id, 'Resolved after statement review'), 'Item resolved')}
                      >Resolve</Button>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
