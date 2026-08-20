import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle, DollarSign, FileDown } from 'lucide-react';
import { PaymentAttachments } from '@/components/payments/PaymentAttachments';
import { PaymentRemarksThread } from '@/components/payments/PaymentRemarksThread';
import { resolveApplicationFeeBreakdown, type ApplicationFeeLine } from '@/lib/applicationFeeBreakdown';
import { getApplicationCategory, getApplicationCategoryLabel } from '@/lib/applicationCategory';
import { downloadInvoiceForPayment } from '@/lib/invoice';
import { formatDateTime } from '@/lib/datetime';
import { applicationPaymentVerify } from '@/lib/applicationLifecycleGovernedOps';

export interface PaymentInfo {
  id?: string;
  application_id?: string;
  amount: number;
  status: string;
  currency: string;
  payment_method?: string | null;
  transaction_ref?: string | null;
  receipt_number?: string | null;
  created_at?: string;
  paid_at?: string | null;
  payment_channel?: string | null;
  offline_method?: string | null;
  verification_status?: string | null;
  verification_remarks?: string | null;
  payment_date?: string | null;
  bank_name?: string | null;
}


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentInfo | null;
  applicantName?: string;
  applicationNumber?: string;
  applicantId?: string;
  onVerified?: () => void;
  /** When false, hides admin-only controls (add/edit remarks, verify button) */
  isAdminView?: boolean;
  /** Application data used to derive Pre/Post-Licensee category badge */
  applicationData?: any;
}

const normalizePaymentStatus = (status?: string | null) => {
  const normalized = (status || '').toLowerCase();
  if (['completed', 'success', 'paid'].includes(normalized)) return 'paid';
  if (['pending', 'processing', 'initiated'].includes(normalized)) return 'pending';
  if (normalized === 'failed') return 'failed';
  return normalized || 'unknown';
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline', paid: 'default', completed: 'default', success: 'default', failed: 'destructive', refunded: 'secondary',
};

export function PaymentVerificationDialog({
  open, onOpenChange, payment, applicantName, applicationNumber, applicantId, onVerified, isAdminView = true, applicationData,
}: Props) {
  const { user } = useAuth();
  const [draftRemark, setDraftRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [feeComponents, setFeeComponents] = useState<ApplicationFeeLine[]>([]);

  useEffect(() => {
    if (open && payment?.application_id) {
      resolveApplicationFeeBreakdown(payment.application_id).then(setFeeComponents).catch(() => setFeeComponents([]));
    } else if (!open) {
      setFeeComponents([]);
      setDraftRemark('');
    }
  }, [open, payment?.application_id]);

  const reviewOffline = async (approve: boolean) => {
    if (!payment?.id) return;
    if (!approve && draftRemark.trim().length < 10) {
      toast.error('Enter a rejection reason of at least 10 characters.');
      return;
    }
    setOfflineBusy(true);
    try {
      const { data, error } = await supabase.rpc('verify_offline_payment', {
        _payment_id: payment.id,
        _approve: approve,
        _remarks: draftRemark.trim() || null,
        _fee_breakdown: feeComponents.length
          ? feeComponents.map((fc) => ({ label: fc.name, amount: Number(fc.amount) }))
          : null,
      });
      if (error) throw error;
      const result = data as { ok?: boolean; message?: string } | null;
      if (!result?.ok) throw new Error(result?.message || 'Could not update the payment.');

      toast.success(approve ? 'Offline payment verified and invoice issued.' : 'Offline payment rejected.');
      setDraftRemark('');
      onOpenChange(false);
      onVerified?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the payment.');
    } finally {
      setOfflineBusy(false);
    }
  };

  const handleInvoice = async () => {
    if (!payment?.id) return;
    setInvoiceBusy(true);
    await downloadInvoiceForPayment(payment.id, { applicationNumber });
    setInvoiceBusy(false);
  };

  if (!payment) return null;

  const isOfflinePending =
    payment.payment_channel === 'offline' && payment.verification_status === 'pending';


  const normalizedPaymentStatus = normalizePaymentStatus(payment.status);
  const formattedAmount = `${payment.currency} ${Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  const handleVerify = async () => {
    if (!draftRemark.trim()) {
      toast.error('Please enter a remark before verifying.');
      return;
    }
    setLoading(true);
    try {
      // 1. Insert the remark as a new entry in the thread
      if (payment.id && user) {
        const { error: remarkErr } = await supabase.from('payment_remarks' as any).insert({
          payment_id: payment.id,
          author_id: user.id,
          author_name: user.fullName || user.email || 'Admin',
          author_role: user.role || null,
          remark: draftRemark.trim(),
        } as any);
        if (remarkErr) throw remarkErr;
      }

      // 2. Mark the payment verified via the governed operation: the verifier,
      //    timestamp and audit entry are derived server-side.
      await applicationPaymentVerify({
        payment_id: payment.application_id ? null : payment.id,
        application_id: payment.application_id ?? null,
        note: draftRemark.trim(),
      });

      // Entity provisioning (if applicable)
      if (payment.application_id) {
        try {
          const { data: prov } = await supabase.rpc(
            'provision_application_entity' as any,
            { _application_id: payment.application_id },
          );
          if ((prov as any)?.success && (prov as any)?.licensee_id) {
            await supabase.functions.invoke('approve-pre-licensee', {
              body: { application_id: payment.application_id },
            });
          }
        } catch (e) {
          console.error('entity provisioning after payment failed', e);
        }
      }

      // Notification dispatch
      supabase.functions.invoke('dispatch-notification-event', {
        body: {
          event_key: 'payment.received',
          entity_type: 'payment',
          entity_id: payment.application_id || payment.id,
          payload: {
            receipt_number: payment.receipt_number || payment.transaction_ref || '',
            amount: String(payment.amount),
            currency: payment.currency,
            application_number: applicationNumber || '',
            comments: draftRemark.trim(),
            applicant_id: applicantId,
            application_id: payment.application_id,
          },
        },
      }).catch(() => {});

      toast.success('Payment verified and notification sent to licensee.');
      setDraftRemark('');
      onOpenChange(false);
      onVerified?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify payment.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setDraftRemark('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <DollarSign className="h-5 w-5 text-primary" />
            Payment Details
            {applicationData && (
              <Badge
                variant={getApplicationCategory(applicationData) === 'post_license' ? 'default' : 'secondary'}
                className="ml-1"
              >
                {getApplicationCategoryLabel(applicationData)} Fee
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {applicationNumber
              ? `Review and verify payment for application ${applicationNumber}`
              : `Review payment information${payment.transaction_ref ? ` — ${payment.transaction_ref}` : ''}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payment Summary */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {applicationNumber && (
                <div>
                  <p className="text-muted-foreground text-xs">Application</p>
                  <p className="font-mono font-medium">{applicationNumber}</p>
                </div>
              )}
              {applicantName && (
                <div>
                  <p className="text-muted-foreground text-xs">Applicant</p>
                  <p className="font-medium">{applicantName}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs">Amount</p>
                <p className="font-semibold text-lg">{formattedAmount}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Status</p>
                <Badge variant={(statusVariant[normalizedPaymentStatus] || 'outline') as any} className="capitalize mt-1">
                  {normalizedPaymentStatus === 'paid'
                    ? 'Paid'
                    : normalizedPaymentStatus.charAt(0).toUpperCase() + normalizedPaymentStatus.slice(1)}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Payment Method</p>
                <p className="text-sm capitalize">{payment.payment_method?.replace('_', ' ') || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Transaction Ref</p>
                <p className="font-mono text-sm">{payment.transaction_ref || '—'}</p>
              </div>
              {payment.receipt_number && (
                <div>
                  <p className="text-muted-foreground text-xs">Receipt #</p>
                  <p className="font-mono text-sm">{payment.receipt_number}</p>
                </div>
              )}
              {payment.created_at && (
                <div>
                  <p className="text-muted-foreground text-xs">Payment Date</p>
                  <p className="text-sm">{new Date(payment.created_at).toLocaleDateString()}</p>
                </div>
              )}
              {payment.paid_at && (
                <div>
                  <p className="text-muted-foreground text-xs">Paid At</p>
                  <p className="text-sm">{new Date(payment.paid_at).toLocaleString()}</p>
                </div>
              )}
            </div>

            {feeComponents.length > 0 && (
              <>
                <Separator className="my-3" />
                <div>
                  <h4 className="text-sm font-medium mb-2">Fee Breakdown</h4>
                  <div className="space-y-1.5">
                    {feeComponents.map((fc) => (
                      <div key={fc.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{fc.name}</span>
                        <span className="font-mono">{payment.currency} {Number(fc.amount).toFixed(2)}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between font-semibold text-sm">
                      <span>Total</span>
                      <span className="font-mono">{formattedAmount}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Offline payment declaration */}
          {payment.payment_channel === 'offline' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-amber-900 dark:text-amber-200">Offline payment declaration</p>
                <Badge variant="outline" className="capitalize">
                  {payment.verification_status || 'pending'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Offline method</p>
                  <p className="capitalize">{(payment.offline_method || '—').replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Declared payment date</p>
                  <p>{payment.payment_date ? formatDateTime(payment.payment_date) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bank / institution</p>
                  <p>{payment.bank_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Applicant remarks</p>
                  <p>{payment.verification_remarks || '—'}</p>
                </div>
              </div>
              {isOfflinePending && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Review the attached proof of payment below, then approve or reject. A rejection
                  requires a reason of at least 10 characters entered in the remarks above.
                </p>
              )}
            </div>
          )}

          {/* Admin Remarks Thread */}
          {payment.id && (
            <>
              <Separator />
              <PaymentRemarksThread
                paymentId={payment.id}
                isAdminView={isAdminView}
                draft={isAdminView && normalizedPaymentStatus !== 'paid' ? draftRemark : undefined}
                onDraftChange={isAdminView && normalizedPaymentStatus !== 'paid' ? setDraftRemark : undefined}
              />
            </>
          )}

           {/* Attachments from licensee/user */}
           {payment.id && (
             <>
               <Separator />
               <PaymentAttachments paymentId={payment.id} readOnly={isAdminView} />
             </>
           )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {normalizedPaymentStatus === 'paid' && payment.id && (
            <Button variant="outline" onClick={handleInvoice} disabled={invoiceBusy}>
              {invoiceBusy
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <FileDown className="h-4 w-4 mr-1.5" />}
              Download invoice
            </Button>
          )}
          {isAdminView && isOfflinePending ? (
            <>
              <Button data-rbac="application_management.edit" variant="outline" onClick={() => reviewOffline(false)} disabled={offlineBusy}>
                <XCircle className="h-4 w-4 mr-1.5" />
                Reject payment
              </Button>
              <Button data-rbac="application_management.edit" onClick={() => reviewOffline(true)} disabled={offlineBusy}>
                {offlineBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1.5" />}
                Verify & issue invoice
              </Button>
            </>
          ) : isAdminView && normalizedPaymentStatus !== 'paid' ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                <XCircle className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
              <Button data-rbac="application_management.edit" onClick={handleVerify} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1.5" />}
                Received & Verify
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
