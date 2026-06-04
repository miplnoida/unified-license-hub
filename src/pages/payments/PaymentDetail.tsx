import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { PaymentAttachments } from '@/components/payments/PaymentAttachments';
import { ArrowLeft, Loader2, DollarSign, Calendar, CreditCard, FileText, Hash } from 'lucide-react';
import { resolveApplicationFeeBreakdown, type ApplicationFeeLine } from '@/lib/applicationFeeBreakdown';

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
  const [feeComponents, setFeeComponents] = useState<ApplicationFeeLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: pData } = await supabase.from('payments' as any).select('*').eq('id', id).single();
      const p = pData as any;
      setPayment(p);
      if (p?.application_id) {
        const fees = await resolveApplicationFeeBreakdown(p.application_id);
        setFeeComponents(fees);
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

  const formattedAmount = `${payment.currency} ${Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <PageHeader title="Payment Details" description={`Transaction ${payment.transaction_ref || payment.id}`} />
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
                <InfoRow icon={<FileText className="h-3.5 w-3.5" />} label="Receipt #" value={payment.receipt_number || '—'} mono />
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
              </div>

              {/* Fee Breakdown */}
              {feeComponents.length > 0 && (
                <>
                  <Separator />
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
