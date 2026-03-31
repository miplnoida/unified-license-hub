import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle, DollarSign } from 'lucide-react';

interface PaymentInfo {
  id?: string;
  application_id: string;
  amount: number;
  status: string;
  currency: string;
  payment_method?: string;
  transaction_ref?: string;
  created_at?: string;
  paid_at?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentInfo | null;
  applicantName: string;
  applicationNumber: string;
  applicantId: string;
  onVerified: () => void;
}

export function PaymentVerificationDialog({
  open, onOpenChange, payment, applicantName, applicationNumber, applicantId, onVerified,
}: Props) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  if (!payment) return null;

  const statusColor = payment.status === 'success' ? 'approved' : payment.status === 'pending' ? 'pending' : 'rejected';
  const formattedAmount = `${payment.currency === 'USD' ? '$' : payment.currency} ${Number(payment.amount).toLocaleString()}`;

  const handleVerify = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message/remarks before verifying.');
      return;
    }
    setLoading(true);
    try {
      // Update payment status to success
      const { error: payErr } = await supabase
        .from('payments')
        .update({ status: 'success', paid_at: new Date().toISOString() } as any)
        .eq('application_id', payment.application_id);

      if (payErr) throw payErr;

      // Send notification to licensee
      await supabase.functions.invoke('send-notification', {
        body: {
          action: 'dispatch',
          event_type: 'payment_verified',
          user_id: applicantId,
          title: 'Payment Verified',
          message: `Your payment of ${formattedAmount} for application ${applicationNumber} has been verified. Admin remarks: ${message.trim()}`,
          entity_type: 'payment',
          entity_id: payment.application_id,
        },
      });

      toast.success('Payment verified and notification sent to licensee.');
      setMessage('');
      onOpenChange(false);
      onVerified();
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Payment Details
          </DialogTitle>
          <DialogDescription>
            Review and verify payment for application {applicationNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payment Summary */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Application</p>
                <p className="font-mono font-medium">{applicationNumber}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Applicant</p>
                <p className="font-medium">{applicantName}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Amount</p>
                <p className="font-semibold text-lg">{formattedAmount}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Status</p>
                <Badge variant={statusColor as any} className="mt-1">
                  {payment.status === 'success' ? 'Paid' : payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                </Badge>
              </div>
              {payment.payment_method && (
                <div>
                  <p className="text-muted-foreground text-xs">Payment Method</p>
                  <p className="text-sm">{payment.payment_method}</p>
                </div>
              )}
              {payment.transaction_ref && (
                <div>
                  <p className="text-muted-foreground text-xs">Transaction Ref</p>
                  <p className="font-mono text-sm">{payment.transaction_ref}</p>
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
          </div>

          <Separator />

          {/* Admin Message */}
          <div className="space-y-2">
            <Label htmlFor="admin-message">Admin Remarks / Message</Label>
            <Textarea
              id="admin-message"
              placeholder="Enter verification remarks or message to send to the licensee..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              This message will be sent as a notification to the licensee.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            <XCircle className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
          <Button onClick={handleVerify} disabled={loading || payment.status === 'success'}>
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1.5" />}
            {payment.status === 'success' ? 'Already Verified' : 'Received & Verify'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
