import { formatRecordMoney } from '@/lib/money';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { PaymentAttachments } from '@/components/payments/PaymentAttachments';
import { ArrowLeft, Loader2, DollarSign, Calendar, CreditCard, FileText, Hash } from 'lucide-react';
import { ApplicationFinancePanel } from '@/components/payments/ApplicationFinancePanel';
import { getApplicationCategory, getApplicationCategoryLabel } from '@/lib/applicationCategory';
import { canIssueReceipt } from '@/lib/receiptIssue';
import { toast } from 'sonner';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline', completed: 'default', success: 'default', failed: 'destructive', refunded: 'secondary',
};

export default function PaymentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const portalContext = useEffectivePortalContext();
  const isAdmin = !!user && !portalContext.loading && portalContext.isInternal;

  const [payment, setPayment] = useState<any>(null);
  const [application, setApplication] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [receiptNo, setReceiptNo] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  const issueReceipt = async () => {
    if (!payment) return;
    setIssuing(true);
    const { data, error } = await supabase.rpc('payment_receipt_issue' as any, { _payment_id: payment.id });
    setIssuing(false);
    if (error) { toast.error(error.message); return; }
    const no = (data as any)?.receipt_number ?? null;
    setReceiptNo(no);
    toast.success(no ? `Receipt ${no} issued` : 'Receipt issued');
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: pData } = await supabase.from('payments' as any).select('*').eq('id', id).single();
      const p = pData as any;
      setPayment(p);
      const { data: rec } = await supabase.from('payment_receipts' as any).select('receipt_number').eq('payment_id', id).maybeSingle();
      setReceiptNo((rec as any)?.receipt_number ?? p?.receipt_number ?? null);
      if (p?.application_id) {
        const appRes = await supabase
          .from('applications')
          .select('id, application_number, license_type, data')
          .eq('id', p.application_id)
          .maybeSingle();
        setApplication(appRes.data);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!payment) {
    return (
      <DashboardLayout>
        <div className="text-center py-20 text-muted-foreground">Payment not found</div>
      </DashboardLayout>
    );
  }

  const formattedAmount = formatRecordMoney(payment.amount, payment.currency);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <PageHeader title="Payment Details" description={`Transaction ${payment.transaction_ref || payment.id}`} />
          </div>
          {application && (
            <Badge
              variant={getApplicationCategory(application.data) === 'post_license' ? 'default' : 'secondary'}
              className="text-sm px-3 py-1"
            >
              {getApplicationCategoryLabel(application.data)} Fee
            </Badge>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Info */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="h-4 w-4 text-primary" />
                Payment Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="Transaction Ref" value={payment.transaction_ref || '—'} mono />
                <div>
                  <InfoRow icon={<FileText className="h-3.5 w-3.5" />} label="Receipt #" value={receiptNo || '—'} mono />
                  {canIssueReceipt({ isStaff: !!isAdmin, status: payment.status, existingReceipt: receiptNo }) && (
                    <Button size="sm" variant="outline" className="mt-2" disabled={issuing} onClick={issueReceipt}>
                      {issuing && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Issue receipt
                    </Button>
                  )}
                </div>
                <InfoRow icon={<DollarSign className="h-3.5 w-3.5" />} label="Amount" value={formattedAmount} bold />
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Status</p>
                  <Badge variant={statusVariant[payment.status] || 'outline'} className="capitalize">
                    {payment.status === 'success' ? 'Paid' : payment.status}
                  </Badge>
                </div>
                <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label="Payment Method" value={payment.payment_method?.replace('_', ' ') || '—'} />
                <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Created" value={new Date(payment.created_at).toLocaleDateString()} />
                {payment.paid_at && (
                  <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Paid At" value={new Date(payment.paid_at).toLocaleString()} />
                )}
                {application && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Application</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm">{application.application_number}</span>
                      <Badge variant="outline" className="text-xs">{getApplicationCategoryLabel(application.data)}</Badge>
                      {application.license_type && (
                        <span className="text-xs text-muted-foreground">· {application.license_type}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* The authoritative fee breakdown lives in the server assessment of
                  record, rendered by ApplicationFinancePanel below. */}
            </CardContent>
          </Card>

          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span>Created: {new Date(payment.created_at).toLocaleDateString()}</span>
              </div>
              {payment.paid_at && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary/70" />
                  <span>Paid: {new Date(payment.paid_at).toLocaleDateString()}</span>
                </div>
              )}
              {payment.status === 'failed' && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-destructive" />
                  <span>Payment failed</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Server-authoritative financial record: assessment, ledger, payments,
            waivers, refunds, reversal, reconciliation and audit. */}
        {payment.application_id && (
          <ApplicationFinancePanel applicationId={payment.application_id} isInternal={!!isAdmin} />
        )}

        {/* Attachments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supporting Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentAttachments paymentId={payment.id} readOnly={!!isAdmin} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function InfoRow({ icon, label, value, mono, bold }: { icon: React.ReactNode; label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1">{icon}{label}</p>
      <p className={`${mono ? 'font-mono' : ''} ${bold ? 'font-semibold text-lg' : ''}`}>{value}</p>
    </div>
  );
}
