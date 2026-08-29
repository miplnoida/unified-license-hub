import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { CreditCard, Loader2, CheckCircle2, AlertCircle, Banknote, FileDown, Clock } from 'lucide-react';
import { logAudit } from '@/hooks/useAuditLog';
import { OfflinePaymentDialog } from '@/components/payments/OfflinePaymentDialog';
import { downloadInvoiceForPayment } from '@/lib/invoice';
import { formatDateTime } from '@/lib/datetime';
import {
  ensureFeeAssessment,
  feeErrorMessage,
  fetchFeeAssessmentPreview,
  fetchFeeAssessmentState,
  money,
  num,
  type FeeAssessmentPreview,
  type FeeAssessmentState,
} from '@/lib/fees/assessmentClient';


interface Props {
  applicationId: string;
  /** When true, the user can initiate the payment (typically owner in editable status). */
  canPay?: boolean;
  /** Optional callback fired after a successful payment. */
  onPaid?: () => void;
}

interface PaymentRow {
  id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
  transaction_ref?: string | null;
  receipt_number?: string | null;
  currency?: string | null;
  payment_channel?: string | null;
  offline_method?: string | null;
  verification_status?: string | null;
  verification_remarks?: string | null;
  payment_date?: string | null;
  bank_name?: string | null;
}

/**
 * Licensee-facing payment panel.
 *
 * Every monetary figure shown here is the server's assessment of record: the
 * immutable line breakdown, assessed total, paid / waived / refunded amounts and
 * the outstanding balance all come from `fee_assessment_ensure` /
 * `fee_assessment_state`. The browser never prices anything, and the amount
 * passed to the payment RPC is financially irrelevant — the server charges the
 * outstanding balance it resolved itself.
 */
export function LicenseePaymentPanel({ applicationId, canPay = false, onPaid }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<FeeAssessmentState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [processing, setProcessing] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setStateError(null);
    try {
      const [assessment, payRes] = await Promise.all([
        ensureFeeAssessment(applicationId, 'Payment surface opened'),
        supabase
          .from('payments')
          .select('id, amount, status, payment_method, paid_at, created_at, transaction_ref, receipt_number, currency, payment_channel, offline_method, verification_status, verification_remarks, payment_date, bank_name')
          .eq('application_id', applicationId)
          .order('created_at', { ascending: false }),
      ]);

      setState(assessment);

      const payments = (payRes.data || []) as unknown as PaymentRow[];
      const successful = payments.find(p => ['success', 'paid', 'completed'].includes((p.status || '').toLowerCase()));
      const awaiting = payments.find(p => p.verification_status === 'pending');
      setPayment(successful || awaiting || payments[0] || null);
    } catch (e) {
      setState(null);
      setStateError(feeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currency = state?.currency || payment?.currency || '';
  const lines = useMemo(() => (Array.isArray(state?.lines) ? state!.lines! : []), [state]);
  const assessedTotal = num(state?.assessed_total);
  const outstanding = num(state?.outstanding);
  const paidTotal = num(state?.paid_total);
  const waivedTotal = num(state?.waived_total);
  const refundedTotal = num(state?.refunded_total);

  const isPaid = useMemo(
    () => !!state?.found && outstanding <= 0 && (paidTotal > 0 || assessedTotal > 0),
    [state, outstanding, paidTotal, assessedTotal],
  );

  const awaitingVerification = useMemo(
    () => !!payment && outstanding > 0 && payment.verification_status === 'pending',
    [payment, outstanding],
  );

  const handleDownloadInvoice = async () => {
    if (!payment) return;
    setInvoiceLoading(true);
    await downloadInvoiceForPayment(payment.id);
    setInvoiceLoading(false);
  };

  const handlePay = async () => {
    if (!user) return;
    setProcessing(true);
    try {
      // `_amount` is retained only for call-signature compatibility. The server
      // resolves the payable amount from the assessment of record and ignores it.
      const { data: paymentResult, error: paymentError } = await (supabase as any).rpc(
        'complete_or_get_application_payment',
        { _application_id: applicationId, _amount: null },
      );
      if (paymentError) throw paymentError;

      const paymentAction = paymentResult?.action as string | undefined;
      const paymentRowId = paymentResult?.payment_id as string | undefined;

      if (paymentAction === 'block') {
        throw new Error(paymentResult?.message || 'Payment could not be processed for this application.');
      }
      if (paymentAction === 'not_required') {
        toast.info(paymentResult?.message || 'No outstanding balance is due for this application.');
        await loadData();
        onPaid?.();
        return;
      }
      if (!paymentRowId || !['paid', 'completed'].includes(paymentAction || '')) {
        throw new Error('Payment could not be completed for this application.');
      }

      toast.success(paymentAction === 'paid'
        ? 'Payment already completed for this application.'
        : 'Payment completed successfully');
      onPaid?.();
      await loadData();
    } catch (e: any) {
      await logAudit({
        action: 'payment.failed',
        entityType: 'payment',
        entityId: applicationId,
        newValue: { error: e?.message || 'Unknown' },
        metadata: { source: 'frontend', application_id: applicationId, error: e?.message || 'Unknown' },
      }).catch(() => {});
      toast.error(feeErrorMessage(e));
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Payment
          {state?.assessment_number && (
            <Badge variant="outline" className="font-mono text-xs">{state.assessment_number}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stateError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-semibold">Financial record unavailable</p>
            <p className="mt-1 text-muted-foreground">{stateError}</p>
          </div>
        ) : (
          <>
            {/* Immutable line breakdown as assessed by the server */}
            {lines.length > 0 && (
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                <p className="text-sm font-medium">Assessed Fee Breakdown</p>
                <div className="space-y-1.5">
                  {lines.map((line, i) => (
                    <div key={`${line.fee_type_code || 'line'}-${i}`} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {line.description || line.fee_type_code || 'Fee'}
                      </span>
                      <span className="font-mono">{money(line.amount, line.currency || currency)}</span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between font-semibold text-sm">
                    <span>Assessed total</span>
                    <span className="font-mono">{money(assessedTotal, currency)}</span>
                  </div>
                  {paidTotal > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Paid</span>
                      <span className="font-mono">{money(paidTotal, currency)}</span>
                    </div>
                  )}
                  {waivedTotal > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Waived</span>
                      <span className="font-mono">{money(waivedTotal, currency)}</span>
                    </div>
                  )}
                  {refundedTotal > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Refunded</span>
                      <span className="font-mono">{money(refundedTotal, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-sm">
                    <span>Outstanding</span>
                    <span className="font-mono">{money(outstanding, currency)}</span>
                  </div>
                </div>
              </div>
            )}

            {isPaid && payment ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">No outstanding balance</p>
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">
                      The assessed amount has been settled. You may continue with the next steps.
                    </p>
                  </div>
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">
                    {state?.status || 'Settled'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-emerald-200 dark:border-emerald-900/40">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount Paid</p>
                    <p className="font-mono font-semibold">{money(payment.amount, payment.currency || currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Method</p>
                    <p className="font-medium capitalize">{payment.payment_method?.replace('_', ' ') || 'Online'}</p>
                  </div>
                  {payment.paid_at && (
                    <div>
                      <p className="text-xs text-muted-foreground">Paid On</p>
                      <p className="text-sm">{formatDateTime(payment.paid_at)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Reference</p>
                    <Link
                      to={`/payments/${payment.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                      title="View payment details"
                    >
                      {payment.transaction_ref || payment.receipt_number || payment.id.substring(0, 8).toUpperCase()}
                    </Link>
                  </div>
                </div>
                <div className="pt-2 border-t border-emerald-200 dark:border-emerald-900/40">
                  <Button variant="outline" size="sm" onClick={handleDownloadInvoice} disabled={invoiceLoading}>
                    {invoiceLoading
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <FileDown className="h-4 w-4 mr-2" />}
                    Download invoice
                  </Button>
                </div>
              </div>
            ) : awaitingVerification && payment ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3 dark:border-amber-900/40 dark:bg-amber-950/30">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-900 dark:text-amber-200">
                      Offline payment awaiting verification
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      The regulator is reviewing your proof of payment. You will be notified once it is verified.
                    </p>
                  </div>
                  <Badge variant="outline">Pending verification</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-amber-200 dark:border-amber-900/40">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount declared</p>
                    <p className="font-mono font-semibold">{money(payment.amount, payment.currency || currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Method</p>
                    <p className="font-medium capitalize">
                      {(payment.offline_method || payment.payment_method || 'offline').replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Payment date</p>
                    <p className="text-sm">
                      {payment.payment_date ? formatDateTime(payment.payment_date) : formatDateTime(payment.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reference</p>
                    <Link to={`/payments/${payment.id}`} className="font-mono text-xs text-primary hover:underline">
                      {payment.transaction_ref || payment.id.substring(0, 8).toUpperCase()}
                    </Link>
                  </div>
                </div>
              </div>
            ) : outstanding <= 0 ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                {state?.basis === 'BUSINESS_CONFIGURATION_ABSENT'
                  ? 'No fee schedule is configured for this matter. The regulator must configure the fee before any payment can be assessed.'
                  : 'No payment is required for this application. You may continue with the next steps.'}
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-4 dark:border-amber-900/40 dark:bg-amber-950/30">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-900 dark:text-amber-200">Payment Pending</p>
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      Pay online, or record a payment made offline for the regulator to verify.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 dark:border-amber-900/40 pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                    <p className="text-2xl font-bold font-mono">{money(outstanding, currency)}</p>
                  </div>
                  {canPay ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={handlePay} disabled={processing} size="lg">
                        {processing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...
                          </>
                        ) : (
                          <>
                            <CreditCard className="h-4 w-4 mr-2" /> Pay Online
                          </>
                        )}
                      </Button>
                      <Button
                        data-rbac="application_management.edit"
                        variant="outline"
                        size="lg"
                        onClick={() => setOfflineOpen(true)}
                        disabled={processing}
                      >
                        <Banknote className="h-4 w-4 mr-2" /> Paid Offline
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground max-w-[180px] text-right">
                      Payment can be initiated once the application is in an editable state.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <OfflinePaymentDialog
        open={offlineOpen}
        onOpenChange={setOfflineOpen}
        applicationId={applicationId}
        onSubmitted={() => { void loadData(); }}
      />
    </Card>
  );
}
