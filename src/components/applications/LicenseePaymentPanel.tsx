import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { CreditCard, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { logAudit } from '@/hooks/useAuditLog';

interface Props {
  applicationId: string;
  /** When true, the user can initiate the payment (typically owner in editable status). */
  canPay?: boolean;
  /** Optional callback fired after a successful payment. */
  onPaid?: () => void;
}

interface FeeComponentRow {
  id: string;
  amount: number;
}

interface PaymentRow {
  id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
}

/**
 * Licensee-facing payment panel. Hides itemised fee breakdown.
 * - If unpaid → shows total amount due and a Pay Now button.
 * - If paid  → shows payment confirmation (amount, date, reference).
 */
export function LicenseePaymentPanel({ applicationId, canPay = false, onPaid }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalDue, setTotalDue] = useState(0);
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [feesRes, payRes] = await Promise.all([
      supabase
        .from('fee_components' as any)
        .select('id, amount')
        .eq('application_id', applicationId),
      supabase
        .from('payments')
        .select('id, amount, status, payment_method, paid_at, created_at')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false }),
    ]);

    const fees = (feesRes.data || []) as unknown as FeeComponentRow[];
    setTotalDue(fees.reduce((sum, f) => sum + Number(f.amount || 0), 0));

    const payments = (payRes.data || []) as unknown as PaymentRow[];
    const successful = payments.find(p => p.status === 'success' || p.status === 'paid' || p.status === 'completed');
    setPayment(successful || payments[0] || null);
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
      const txnRef = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const { data: created, error: createErr } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          application_id: applicationId,
          amount: totalDue,
          status: 'pending',
          payment_method: 'online',
          transaction_ref: txnRef,
        } as any)
        .select('id')
        .single();
      if (createErr || !created) throw createErr || new Error('Failed to create payment');

      // Simulated gateway processing (matches NewApplication flow)
      const { error: updErr } = await supabase
        .from('payments')
        .update({
          status: 'completed',
          paid_at: new Date().toISOString(),
        } as any)
        .eq('id', (created as any).id);
      if (updErr) throw updErr;

      await logAudit({
        action: 'payment_completed',
        entityType: 'payment',
        entityId: (created as any).id,
        metadata: { application_id: applicationId, amount: totalDue },
      });

      toast.success('Payment completed successfully');
      onPaid?.();
      loadData();
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
                  {Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Method</p>
                <p className="font-medium capitalize">{payment.payment_method || 'Online'}</p>
              </div>
              {payment.paid_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Paid On</p>
                  <p className="text-sm">{new Date(payment.paid_at).toLocaleString()}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Reference</p>
                <p className="font-mono text-xs">{payment.id.substring(0, 8).toUpperCase()}</p>
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
                  {totalDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
