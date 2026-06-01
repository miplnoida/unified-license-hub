import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { PaymentAttachments } from '@/components/payments/PaymentAttachments';
import { resolveApplicationFeeBreakdown, type ApplicationFeeLine } from '@/lib/applicationFeeBreakdown';

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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentInfo | null;
  /** If provided, shows admin verification form */
  applicantName?: string;
  applicationNumber?: string;
  applicantId?: string;
  onVerified?: () => void;
  /** When false, hides admin-only controls (remarks, verify button) */
  isAdminView?: boolean;
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
  open, onOpenChange, payment, applicantName, applicationNumber, applicantId, onVerified, isAdminView = true,
}: Props) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [feeComponents, setFeeComponents] = useState<ApplicationFeeLine[]>([]);
  const [existingRemarks, setExistingRemarks] = useState<string>('');

  useEffect(() => {
    if (open && payment?.application_id) {
      resolveApplicationFeeBreakdown(payment.application_id).then(setFeeComponents).catch(() => setFeeComponents([]));
    } else if (!open) {
      setFeeComponents([]);
    }
  }, [open, payment?.application_id]);

  useEffect(() => {
    if (open && payment?.id) {
      (async () => {
        const { data } = await supabase
          .from('payments')
          .select('admin_remarks' as any)
          .eq('id', payment.id)
          .maybeSingle();
        const remarks = ((data as any)?.admin_remarks as string) || '';
        setExistingRemarks(remarks);
        setMessage(remarks);
      })();
    } else if (!open) {
      setMessage('');
      setExistingRemarks('');
    }
  }, [open, payment?.id]);

  if (!payment) return null;


  const normalizedPaymentStatus = normalizePaymentStatus(payment.status);
  const formattedAmount = `${payment.currency} ${Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  const handleVerify = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message/remarks before verifying.');
      return;
    }
    setLoading(true);
    try {
      // Update payment status
      const updateFilter = payment.application_id
        ? supabase.from('payments').update({ status: 'success', paid_at: new Date().toISOString(), admin_remarks: message.trim() } as any).eq('application_id', payment.application_id)
        : supabase.from('payments').update({ status: 'success', paid_at: new Date().toISOString(), admin_remarks: message.trim() } as any).eq('id', payment.id);

      const { error: payErr } = await updateFilter;
      if (payErr) throw payErr;

      // If the application is already approved, this payment verification is the
      // "second" event — provision the licensee/entity now. Safe no-op otherwise.
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

      // Dynamic notification dispatch (fire-and-forget; failures must not block)
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
            comments: message.trim(),
            applicant_id: applicantId,
            application_id: payment.application_id,
          },
        },
      }).catch(() => {});

      toast.success('Payment verified and notification sent to licensee.');
      setMessage('');
      onOpenChange(false);
      onVerified?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify payment.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Payment Details
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

          {/* Admin Message - only shown for admin users */}
          {isAdminView && normalizedPaymentStatus !== 'paid' && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="admin-message">Admin Remarks / Message</Label>
                <Textarea
                  id="admin-message"
                  placeholder="Enter verification remarks or message to send to the licensee..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={6}
                  className="min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  This message will be sent as a notification to the licensee.
                 </p>
               </div>
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
          {isAdminView ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                <XCircle className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
              <Button onClick={handleVerify} disabled={loading || payment.status === 'success'}>
                {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1.5" />}
                {payment.status === 'success' ? 'Already Verified' : 'Received & Verify'}
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
