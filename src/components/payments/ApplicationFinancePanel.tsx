import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { toast } from 'sonner';
import { Loader2, RefreshCw, ShieldCheck, Undo2 } from 'lucide-react';
import {
  decideFeeRefund,
  decideFeeWaiver,
  executeFeeRefund,
  feeErrorMessage,
  fetchFeeAssessmentOverview,
  money,
  num,
  requestFeeRefund,
  requestFeeWaiver,
  resolveReconciliationItem,
  reverseFeePayment,
  type FeeAssessmentOverview,
} from '@/lib/fees/assessmentClient';

interface Props {
  applicationId: string;
  /** Regulator/internal staff see provenance, ledger, audit and governed actions. */
  isInternal: boolean;
}

const row = (o: Record<string, unknown>, k: string) => (o?.[k] ?? null) as any;

/**
 * Regulator operational finance surface for a single application.
 *
 * Reads ONLY the F6 server model through the governed RPC adapter
 * (`fee_assessment_overview`) and mutates ONLY through governed RPCs
 * (waiver / refund / reversal / reconciliation resolution). Nothing is priced,
 * summed or decided in the browser, and entity users never receive the
 * regulator-only ledger / audit / reconciliation sections — the server omits
 * them for non-internal callers.
 */
export function ApplicationFinancePanel({ applicationId, isInternal }: Props) {
  const [ov, setOv] = useState<FeeAssessmentOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // action inputs
  const [waiverAmount, setWaiverAmount] = useState('');
  const [waiverReason, setWaiverReason] = useState('');
  const [refundPaymentId, setRefundPaymentId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [reversalPaymentId, setReversalPaymentId] = useState('');
  const [reversalReason, setReversalReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOv(await fetchFeeAssessmentOverview(applicationId));
    } catch (e) {
      setOv(null);
      setError(feeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => { void load(); }, [load]);

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
    return (
      <Card><CardContent className="py-8 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Financial record unavailable</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    );
  }

  const currency = ov?.currency || '';
  const payments = (ov?.payments || []) as Record<string, unknown>[];
  const allocations = (ov?.allocations || []) as Record<string, unknown>[];
  const waivers = (ov?.waivers || []) as Record<string, unknown>[];
  const refunds = (ov?.refunds || []) as Record<string, unknown>[];
  const ledger = (ov?.ledger || []) as Record<string, unknown>[];
  const exceptions = (ov?.reconciliation_exceptions || []) as Record<string, unknown>[];
  const audit = (ov?.audit || []) as Record<string, unknown>[];
  const unallocatedCredit = ledger
    .filter(l => row(l, 'entry_type') === 'CREDIT')
    .reduce((s, l) => s + num(row(l, 'amount')), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Financial record
              {ov?.assessment_number && (
                <Badge variant="outline" className="font-mono text-xs">{ov.assessment_number}</Badge>
              )}
              {ov?.status && <Badge variant="secondary" className="text-xs">{ov.status}</Badge>}
            </CardTitle>
            <CardDescription>
              Server assessment of record, append-only ledger and governed financial operations.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!ov?.found ? (
          <p className="text-sm text-muted-foreground py-4">
            No assessment of record exists for this application yet. One is raised at the governed
            financial boundary (payment initiation, offline declaration, waiver request or submission).
          </p>
        ) : (
          <Tabs defaultValue="assessment">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="assessment">Assessment</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="waivers">Waivers</TabsTrigger>
              <TabsTrigger value="refunds">Refunds</TabsTrigger>
              {isInternal && <TabsTrigger value="ledger">Ledger</TabsTrigger>}
              {isInternal && <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>}
              {isInternal && <TabsTrigger value="audit">Audit</TabsTrigger>}
            </TabsList>

            {/* ---------------- Assessment ---------------- */}
            <TabsContent value="assessment" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {[
                  ['Assessed', ov.assessed_total],
                  ['Paid', ov.paid_total],
                  ['Waived', ov.waived_total],
                  ['Refunded', ov.refunded_total],
                  ['Reversed', ov.reversed_total],
                  ['Outstanding', ov.outstanding],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{String(label)}</p>
                    <p className="font-mono font-semibold">{money(value, currency)}</p>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground space-x-4">
                <span>Basis: <span className="font-mono">{ov.basis || '—'}</span></span>
                <span>Source: <span className="font-mono">{ov.resolution_source || '—'}</span></span>
                {ov.assessed_at && <span>Assessed: {new Date(ov.assessed_at).toLocaleString()}</span>}
              </div>
              <Separator />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Payable</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ov.lines || []).map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.description || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{l.fee_type_code || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={l.blocking === false ? 'secondary' : 'outline'} className="text-xs">
                          {l.blocking === false ? 'informational' : 'payable'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{money(l.amount, l.currency || currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isInternal && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Configuration / provenance snapshot</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3">
                    {JSON.stringify((ov as any).config_snapshot ?? {}, null, 2)}
                  </pre>
                </details>
              )}
            </TabsContent>

            {/* ---------------- Payments ---------------- */}
            <TabsContent value="payments" className="space-y-4 pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">No payments recorded.</TableCell></TableRow>
                  )}
                  {payments.map(p => (
                    <TableRow key={String(row(p, 'id'))}>
                      <TableCell className="font-mono text-xs">{row(p, 'transaction_ref') || String(row(p, 'id')).slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">
                        {row(p, 'payment_channel') || row(p, 'payment_method') || '—'}
                        {row(p, 'offline_method') ? ` / ${row(p, 'offline_method')}` : ''}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row(p, 'status')}
                        {row(p, 'verification_status') ? ` (${row(p, 'verification_status')})` : ''}
                      </TableCell>
                      <TableCell className="text-right font-mono">{money(row(p, 'amount'), row(p, 'currency') || currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="rounded-lg border p-3 text-sm space-y-1">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Allocated to this assessment</span>
                  <span className="font-mono">{money(ov.paid_total, currency)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Unallocated credit (overpayment / currency mismatch)</span>
                  <span className="font-mono">{money(unallocatedCredit, currency)}</span>
                </p>
                <p className="text-xs text-muted-foreground">Allocations recorded: {allocations.length}</p>
              </div>

              {isInternal && (
                <PermissionGate module="fee_management" action="edit">
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2"><Undo2 className="h-4 w-4" /> Governed reversal</p>
                    <p className="text-xs text-muted-foreground">
                      Creates compensating ledger entries. Settled history is never edited or deleted.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input placeholder="Payment ID" value={reversalPaymentId} onChange={e => setReversalPaymentId(e.target.value)} />
                      <Textarea
                        placeholder="Mandatory rationale (min 10 characters)"
                        value={reversalReason}
                        onChange={e => setReversalReason(e.target.value)}
                      />
                    </div>
                    <Button
                      data-rbac="fee_management.edit"
                      size="sm"
                      variant="destructive"
                      disabled={busy || !reversalPaymentId || reversalReason.trim().length < 10}
                      onClick={() => guarded(
                        () => reverseFeePayment(reversalPaymentId.trim(), reversalReason.trim()),
                        'Payment reversed with compensating entries',
                      )}
                    >
                      Reverse payment
                    </Button>
                  </div>
                </PermissionGate>
              )}
            </TabsContent>

            {/* ---------------- Waivers ---------------- */}
            <TabsContent value="waivers" className="space-y-4 pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    {isInternal && <TableHead className="text-right">Decision</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waivers.length === 0 && (
                    <TableRow><TableCell colSpan={isInternal ? 6 : 5} className="text-sm text-muted-foreground">No waiver or exemption requests.</TableCell></TableRow>
                  )}
                  {waivers.map(w => (
                    <TableRow key={String(row(w, 'id'))}>
                      <TableCell className="text-xs">{row(w, 'waiver_kind')}</TableCell>
                      <TableCell className="font-mono text-xs">{money(row(w, 'requested_amount'), row(w, 'currency') || currency)}</TableCell>
                      <TableCell className="font-mono text-xs">{row(w, 'approved_amount') === null ? '—' : money(row(w, 'approved_amount'), currency)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{row(w, 'status')}</Badge></TableCell>
                      <TableCell className="text-xs max-w-[220px] truncate">{row(w, 'request_reason')}</TableCell>
                      {isInternal && (
                        <TableCell className="text-right">
                          {row(w, 'status') === 'PENDING' && (
                            <PermissionGate module="fee_management" action="edit">
                              <div className="flex justify-end gap-1">
                                <Button
                                  data-rbac="fee_management.edit"
                                  size="sm" variant="outline" disabled={busy}
                                  onClick={() => guarded(
                                    () => decideFeeWaiver(String(row(w, 'id')), true, 'Approved after review of the waiver justification'),
                                    'Waiver approved',
                                  )}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Approve
                                </Button>
                                <Button
                                  data-rbac="fee_management.edit"
                                  size="sm" variant="ghost" disabled={busy}
                                  onClick={() => guarded(
                                    () => decideFeeWaiver(String(row(w, 'id')), false, 'Rejected: the waiver justification does not meet policy'),
                                    'Waiver rejected',
                                  )}
                                >
                                  Reject
                                </Button>
                              </div>
                            </PermissionGate>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium">Request a waiver / exemption</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Amount ({currency || 'currency'})</Label>
                    <Input type="number" min="0" step="0.01" value={waiverAmount} onChange={e => setWaiverAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Justification (min 10 characters)</Label>
                    <Textarea value={waiverReason} onChange={e => setWaiverReason(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  The server caps the request at the outstanding balance and refuses self-approval.
                </p>
                <PermissionGate module="fee_management" action="edit">
                  <Button
                    size="sm" data-rbac="fee_management.edit"
                    disabled={busy || !Number(waiverAmount) || waiverReason.trim().length < 10}
                    onClick={() => guarded(
                      () => requestFeeWaiver(applicationId, Number(waiverAmount), waiverReason.trim()),
                      'Waiver request submitted',
                    )}
                  >
                    Submit request
                  </Button>
                </PermissionGate>
              </div>
            </TabsContent>

            {/* ---------------- Refunds ---------------- */}
            <TabsContent value="refunds" className="space-y-4 pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                    {isInternal && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refunds.length === 0 && (
                    <TableRow><TableCell colSpan={isInternal ? 5 : 4} className="text-sm text-muted-foreground">No refund requests.</TableCell></TableRow>
                  )}
                  {refunds.map(r => (
                    <TableRow key={String(row(r, 'id'))}>
                      <TableCell className="font-mono text-xs">{String(row(r, 'payment_id')).slice(0, 8)}</TableCell>
                      <TableCell className="text-right font-mono">{money(row(r, 'amount'), row(r, 'currency') || currency)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{row(r, 'status')}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{row(r, 'refund_reference') || '—'}</TableCell>
                      {isInternal && (
                        <TableCell className="text-right">
                          <PermissionGate module="fee_management" action="edit">
                            <div className="flex justify-end gap-1">
                              {row(r, 'status') === 'pending' && (
                                <>
                                  <Button
                                    data-rbac="fee_management.edit" size="sm" variant="outline" disabled={busy}
                                    onClick={() => guarded(
                                      () => decideFeeRefund(String(row(r, 'id')), 'approved', 'Approved after refund eligibility review'),
                                      'Refund approved',
                                    )}
                                  >Approve</Button>
                                  <Button
                                    data-rbac="fee_management.edit" size="sm" variant="ghost" disabled={busy}
                                    onClick={() => guarded(
                                      () => decideFeeRefund(String(row(r, 'id')), 'rejected', 'Rejected: refund not payable under policy'),
                                      'Refund rejected',
                                    )}
                                  >Reject</Button>
                                </>
                              )}
                              {row(r, 'status') === 'approved' && (
                                <Button
                                  data-rbac="fee_management.edit" size="sm" disabled={busy}
                                  onClick={() => guarded(
                                    () => executeFeeRefund(String(row(r, 'id')), `RFD-${Date.now()}`),
                                    'Refund executed with a compensating ledger entry',
                                  )}
                                >Execute</Button>
                              )}
                            </div>
                          </PermissionGate>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium">Request a refund</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input placeholder="Payment ID" value={refundPaymentId} onChange={e => setRefundPaymentId(e.target.value)} />
                  <Input type="number" min="0" step="0.01" placeholder="Amount" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} />
                  <Input placeholder="Reason (min 10 characters)" value={refundReason} onChange={e => setRefundReason(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  The server checks refund eligibility against the settled receipt and refuses excess refunds.
                </p>
                <PermissionGate module="fee_management" action="edit">
                  <Button size="sm" data-rbac="fee_management.edit"
                    disabled={busy || !refundPaymentId || !Number(refundAmount) || refundReason.trim().length < 10}
                    onClick={() => guarded(() => requestFeeRefund(refundPaymentId.trim(), Number(refundAmount), refundReason.trim()), 'Refund request submitted')}
                  >Submit refund request</Button>
                </PermissionGate>

              </div>
            </TabsContent>

            {/* ---------------- Ledger (regulator) ---------------- */}
            {isInternal && (
              <TabsContent value="ledger" className="pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Entry</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">No ledger entries.</TableCell></TableRow>
                    )}
                    {ledger.map(l => (
                      <TableRow key={String(row(l, 'id'))}>
                        <TableCell className="text-xs">{row(l, 'created_at') ? new Date(row(l, 'created_at')).toLocaleString() : '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{row(l, 'entry_type')}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{money(row(l, 'amount'), row(l, 'currency') || currency)}</TableCell>
                        <TableCell className="text-xs max-w-[280px] truncate">{row(l, 'reason') || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-xs text-muted-foreground pt-2">
                  Append-only: corrections are compensating entries, never edits.
                </p>
              </TabsContent>
            )}

            {/* ---------------- Reconciliation (regulator) ---------------- */}
            {isInternal && (
              <TabsContent value="reconciliation" className="pt-4 space-y-3">
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
                    {exceptions.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No unmatched or exception items for this application.</TableCell></TableRow>
                    )}
                    {exceptions.map(i => (
                      <TableRow key={String(row(i, 'id'))}>
                        <TableCell className="font-mono text-xs">{row(i, 'external_reference')}</TableCell>
                        <TableCell className="text-right font-mono">{money(row(i, 'external_amount'), row(i, 'external_currency') || currency)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{row(i, 'status')}</Badge></TableCell>
                        <TableCell className="text-xs">{row(i, 'exception_code') || '—'}</TableCell>
                        <TableCell className="text-right">
                          <PermissionGate module="fee_management" action="edit">
                            <Button
                              data-rbac="fee_management.edit" size="sm" variant="outline" disabled={busy}
                              onClick={() => guarded(
                                () => resolveReconciliationItem(String(row(i, 'id')), 'Resolved after statement review'),
                                'Reconciliation item resolved',
                              )}
                            >Resolve</Button>
                          </PermissionGate>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            )}

            {/* ---------------- Audit (regulator) ---------------- */}
            {isInternal && (
              <TabsContent value="audit" className="pt-4">
                <div className="space-y-2">
                  {audit.length === 0 && <p className="text-sm text-muted-foreground">No financial audit entries.</p>}
                  {audit.map((a, i) => (
                    <div key={i} className="flex justify-between gap-3 rounded border p-2 text-xs">
                      <span className="font-mono">{row(a, 'action')}</span>
                      <span className="text-muted-foreground">{row(a, 'at') ? new Date(row(a, 'at')).toLocaleString() : ''}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
