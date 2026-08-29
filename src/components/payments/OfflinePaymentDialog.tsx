import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { PaymentAttachments } from '@/components/payments/PaymentAttachments';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Banknote, Loader2 } from 'lucide-react';
import {
  fetchFeeAssessmentState, feeErrorMessage, money, num,
} from '@/lib/fees/assessmentClient';

export const OFFLINE_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'manager_cheque', label: "Manager's cheque" },
  { value: 'demand_draft', label: 'Demand draft' },
  { value: 'cash', label: 'Cash / over-the-counter' },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  onSubmitted?: () => void;
}

/**
 * Applicant-facing declaration of an offline payment (bank transfer, cheque,
 * cash…). The outstanding balance and the currency are read from the server
 * assessment of record — the declared amount is only a claim about what was
 * paid, and the server refuses anything above the outstanding balance, a
 * mismatched currency, or a duplicate external reference.
 */
export function OfflinePaymentDialog({
  open, onOpenChange, applicationId, onSubmitted,
}: Props) {
  const [method, setMethod] = useState<string>('bank_transfer');
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [bankName, setBankName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    fetchFeeAssessmentState(applicationId)
      .then((state) => {
        if (!active) return;
        const due = num(state?.outstanding);
        setOutstanding(due);
        setCurrency(state?.currency || '');
        setAmount(due > 0 ? String(due) : '');
      })
      .catch((e) => {
        if (!active) return;
        setOutstanding(null);
        toast.error(feeErrorMessage(e));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, applicationId]);

  const reset = () => {
    setPaymentId(null);
    setReference('');
    setBankName('');
    setRemarks('');
    setAmount('');
    setOutstanding(null);
  };


  const submit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('submit_offline_payment', {
        _application_id: applicationId,
        _amount: Number(amount),
        _offline_method: method,
        _payment_date: paymentDate,
        _reference: reference.trim(),
        _bank_name: bankName.trim() || null,
        _remarks: remarks.trim() || null,
      });
      if (error) throw error;
      const result = data as { ok?: boolean; message?: string; payment_id?: string } | null;
      if (!result?.ok) throw new Error(result?.message || 'Could not record the payment.');

      setPaymentId(result.payment_id ?? null);
      toast.success('Offline payment recorded. Attach your proof of payment below.');
      onSubmitted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record the payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" /> Record offline payment
          </DialogTitle>
          <DialogDescription>
            Declare a payment made outside the portal. The regulator will verify it before your
            application can proceed.
          </DialogDescription>
        </DialogHeader>

        {!paymentId ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              {loading ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading outstanding balance…
                </span>
              ) : outstanding === null ? (
                <span className="text-destructive">
                  The outstanding balance could not be read. Recording a payment is unavailable.
                </span>
              ) : (
                <span className="flex justify-between">
                  <span className="text-muted-foreground">Outstanding balance (server assessed)</span>
                  <span className="font-mono font-semibold">{money(outstanding, currency)}</span>
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Payment method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OFFLINE_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="offline-amount">
                  Amount declared{currency ? ` (${currency})` : ''}
                </Label>
                <Input
                  id="offline-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  max={outstanding ?? undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Partial payments are allowed. Amounts above the outstanding balance are refused by
                  the regulator's financial ledger.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="offline-date">Payment date</Label>
                <Input
                  id="offline-date"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offline-bank">Bank / institution</Label>
                <Input
                  id="offline-bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="offline-reference">
                Payment reference / cheque number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="offline-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="offline-remarks">Remarks</Label>
              <Textarea
                id="offline-remarks"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                Awaiting regulator verification
              </p>
              <p className="mt-1 text-amber-800 dark:text-amber-300">
                Attach the deposit slip, cheque image, or transfer confirmation so the regulator can
                verify this payment.
              </p>
            </div>
            <Separator />
            <PaymentAttachments paymentId={paymentId} />
          </div>
        )}

        <DialogFooter>
          {!paymentId ? (
            <>
              <Button variant="outline" onClick={close} disabled={submitting}>Cancel</Button>
              <Button data-rbac="fee_management.edit"
                onClick={submit}
                disabled={
                  submitting ||
                  !Number(amount) ||
                  reference.trim().length < 3 ||
                  !paymentDate
                }
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit for verification
              </Button>
            </>
          ) : (
            <Button onClick={close}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
