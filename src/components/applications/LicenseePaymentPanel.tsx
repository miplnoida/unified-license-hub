import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { CreditCard, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { logAudit } from '@/hooks/useAuditLog';
import { resolveApplicationFeeBreakdown, type ApplicationFeeLine } from '@/lib/applicationFeeBreakdown';

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
}

/**
 * Licensee-facing payment panel.
 * - If unpaid → shows itemised fee breakdown, total, and a Pay Now button.
 * - If paid  → shows payment confirmation with breakdown; reference links to payment detail.
 */
export function LicenseePaymentPanel({ applicationId, canPay = false, onPaid }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fees, setFees] = useState<ApplicationFeeLine[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [currency, setCurrency] = useState<string>('USD');
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [resolvedFees, payRes] = await Promise.all([
      resolveApplicationFeeBreakdown(applicationId),
      supabase
        .from('payments')
        .select('id, amount, status, payment_method, paid_at, created_at, transaction_ref, receipt_number, currency')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false }),
    ]);

    setFees(resolvedFees);
    setTotalDue(resolvedFees.reduce((sum, f) => sum + Number(f.amount || 0), 0));

    const payments = (payRes.data || []) as unknown as PaymentRow[];
    const successful = payments.find(p => p.status === 'success' || p.status === 'paid' || p.status === 'completed');
    const chosen = successful || payments[0] || null;
    setPayment(chosen);
    if (chosen?.currency) setCurrency(chosen.currency);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [applicationId]);

  const isPaid = useMemo(
    () => !!payment && ['success', 'paid', 'completed'].includes(payment.status),
    [payment],
  );

  const handlePay = async () => {
    if (!user) return;
    if (totalDue <= 0) {
      toast.info('No payment is required for this application.');
      return;
    }
    setProcessing(true);
    try {
      const { data: existingPayments, error: existingErr } = await supabase
        .from('payments')
        .select('id, amount, status, payment_method, paid_at, created_at, transaction_ref, receipt_number, currency')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false });
      if (existingErr) throw existingErr;

      const existingList = (existingPayments || []) as PaymentRow[];
      const successful = existingList.find(p => ['success', 'paid', 'completed'].includes((p.status || '').toLowerCase()));
      if (successful) {
        setPayment(successful);
        if (successful.currency) setCurrency(successful.currency);
        toast.info('Payment already completed for this application.');
        onPaid?.();
        return;
      }

      const { data: paymentResult, error: paymentError } = await (supabase as any).rpc(
        'complete_or_get_application_payment',
        { _application_id: applicationId, _amount: totalDue },
      );
      if (paymentError) throw paymentError;

      const paymentAction = paymentResult?.action as string | undefined;
      const paymentRowId = paymentResult?.payment_id as string | undefined;

      if (paymentAction === 'block') {
        throw new Error(paymentResult?.message || 'Payment could not be processed for this application.');
      }

      if (!paymentRowId || !['paid', 'completed'].includes(paymentAction || '')) {
        throw new Error('Payment could not be completed for this application.');
      }

      await logAudit({
        action: 'payment_completed',
        entityType: 'payment',
        entityId: paymentRowId,
        metadata: { application_id: applicationId, amount: Number(paymentResult?.amount ?? totalDue), payment_action: paymentAction },
      });

      toast.success(paymentAction === 'paid' ? 'Payment already completed for this application.' : 'Payment completed successfully');
      onPaid?.();
      await loadData();
    } catch (e: any) {
      toast.error(e?.message || 'Payment failed. Please try again.');
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
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fee breakdown — shown in both paid and unpaid states */}
        {fees.length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
            <p className="text-sm font-medium">Fee Breakdown</p>
            <div className="space-y-1.5">
              {fees.map((f) => {
                return (
                  <div key={f.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{f.name}</span>
                    <span className="font-mono">
                      {currency} {Number(f.amount).toFixed(2)}
                    </span>
                  </div>
                );
              })}
              <Separator />
              <div className="flex justify-between font-semibold text-sm">
                <span>Total</span>
                <span className="font-mono">
                  {currency} {totalDue.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {isPaid && payment ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">Payment Completed</p>
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  Your payment has been received. You may continue with the next steps.
                </p>
              </div>
              <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-emerald-200 dark:border-emerald-900/40">
              <div>
                <p className="text-xs text-muted-foreground">Amount Paid</p>
                <p className="font-mono font-semibold">
                  {(payment.currency || currency)} {Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Method</p>
                <p className="font-medium capitalize">{payment.payment_method?.replace('_', ' ') || 'Online'}</p>
              </div>
              {payment.paid_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Paid On</p>
                  <p className="text-sm">{new Date(payment.paid_at).toLocaleString()}</p>
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
          </div>
        ) : totalDue <= 0 ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            No payment is required for this application. You may continue with the next steps.
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-4 dark:border-amber-900/40 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-amber-900 dark:text-amber-200">Payment Pending</p>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Complete the payment to proceed with your application.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-amber-200 dark:border-amber-900/40 pt-3">
              <div>
                <p className="text-xs text-muted-foreground">Total Amount Due</p>
                <p className="text-2xl font-bold font-mono">
                  {currency} {totalDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              {canPay ? (
                <Button onClick={handlePay} disabled={processing} size="lg">
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" /> Pay Now
                    </>
                  )}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground max-w-[180px] text-right">
                  Payment can be initiated once the application is in an editable state.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
