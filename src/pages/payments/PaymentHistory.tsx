import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { PAYMENT_METHODS, REFUND_STATUS_LABELS, RefundStatus } from '@/types/platform';
import { Search, Loader2, Receipt, RotateCcw, FileText, DollarSign, CheckCircle, Clock, XCircle } from 'lucide-react';

interface Payment {
  id: string;
  application_id: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  transaction_ref: string | null;
  receipt_number: string | null;
  paid_at: string | null;
  created_at: string;
  user_id: string;
}

interface PaymentReceipt {
  id: string;
  payment_id: string;
  receipt_number: string;
  issued_to_name: string;
  issued_to_email: string | null;
  amount: number;
  currency: string;
  fee_breakdown: any[];
  issued_at: string;
  voided_at: string | null;
  voided_reason: string | null;
}

interface Refund {
  id: string;
  payment_id: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  requested_by: string;
  approved_by: string | null;
  processed_at: string | null;
  refund_method: string | null;
  refund_reference: string | null;
  notes: string | null;
  created_at: string;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline', completed: 'default', failed: 'destructive', refunded: 'secondary',
};

export default function PaymentHistory() {
  const { user } = useAuth();
  const isAdmin = user && ['super_admin', 'admin'].includes(user.role);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('payments');
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentReceipt | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [paymentsRes, receiptsRes, refundsRes] = await Promise.all([
      supabase.from('payments' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('payment_receipts' as any).select('*').order('issued_at', { ascending: false }),
      supabase.from('refunds' as any).select('*').order('created_at', { ascending: false }),
    ]);
    if (!paymentsRes.error) setPayments((paymentsRes.data || []) as any);
    if (!receiptsRes.error) setReceipts((receiptsRes.data || []) as any);
    if (!refundsRes.error) setRefunds((refundsRes.data || []) as any);
    setLoading(false);
  };

  const filtered = payments.filter(p => {
    if (!search) return true;
    return (p.transaction_ref?.toLowerCase().includes(search.toLowerCase()) ||
            p.receipt_number?.toLowerCase().includes(search.toLowerCase()) ||
            p.status.toLowerCase().includes(search.toLowerCase()));
  });

  const openRefundDialog = (payment: Payment) => {
    setSelectedPayment(payment);
    setRefundAmount(String(payment.amount));
    setRefundReason('');
    setRefundDialogOpen(true);
  };

  const handleRequestRefund = async () => {
    if (!selectedPayment || !user) return;
    if (!refundReason.trim()) { toast.error('Reason is required'); return; }
    const amount = parseFloat(refundAmount);
    if (isNaN(amount) || amount <= 0) { toast.error('Refund amount must be a positive number'); return; }
    if (amount > Number(selectedPayment.amount)) { toast.error(`Refund amount cannot exceed payment amount (${selectedPayment.currency} ${Number(selectedPayment.amount).toFixed(2)})`); return; }
    setSaving(true);
    const { error } = await supabase.from('refunds' as any).insert({
      payment_id: selectedPayment.id,
      amount,
      reason: refundReason.trim(),
      requested_by: user.id,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Refund requested');
    setSaving(false); setRefundDialogOpen(false); loadAll();
  };

  const handleApproveRefund = async (refund: Refund, action: 'approved' | 'rejected') => {
    if (!user) return;
    const update: any = { status: action };
    if (action === 'approved') update.approved_by = user.id;
    const { error } = await supabase.from('refunds' as any).update(update).eq('id', refund.id);
    if (error) { toast.error(error.message); return; }
    if (action === 'approved') {
      await supabase.from('payments' as any).update({ status: 'refunded' }).eq('id', refund.payment_id);
    }
    toast.success(`Refund ${action}`); loadAll();
  };

  const viewReceipt = (receipt: PaymentReceipt) => {
    setSelectedReceipt(receipt);
    setReceiptDialogOpen(true);
  };

  const totalCollected = payments.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);
  const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0);
  const totalRefunded = refunds.filter(r => r.status === 'processed' || r.status === 'approved').reduce((s, r) => s + Number(r.amount), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Payments & Receipts" description="Manage payments, receipts, and refunds" />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-6 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><DollarSign className="h-5 w-5 text-primary" /></div>
            <div><p className="text-2xl font-bold">{payments.length}</p><p className="text-sm text-muted-foreground">Total Payments</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-2xl font-bold">${totalCollected.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p><p className="text-sm text-muted-foreground">Collected</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10"><Clock className="h-5 w-5 text-yellow-600" /></div>
            <div><p className="text-2xl font-bold">${totalPending.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p><p className="text-sm text-muted-foreground">Pending</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10"><RotateCcw className="h-5 w-5 text-red-600" /></div>
            <div><p className="text-2xl font-bold">${totalRefunded.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p><p className="text-sm text-muted-foreground">Refunded</p></div>
          </CardContent></Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="receipts">Receipts</TabsTrigger>
            <TabsTrigger value="refunds">Refunds</TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by reference..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No payments found</TableCell></TableRow>
                      ) : filtered.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="font-mono">{p.currency} {Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell><Badge variant={statusVariant[p.status] || 'outline'} className="capitalize">{p.status}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground capitalize">{p.payment_method?.replace('_', ' ') || '—'}</TableCell>
                          <TableCell className="text-sm font-mono">{p.transaction_ref || '—'}</TableCell>
                          <TableCell className="text-right space-x-1">
                            {p.status === 'completed' && (
                              <Button variant="ghost" size="sm" onClick={() => openRefundDialog(p)}><RotateCcw className="h-3 w-3 mr-1" />Refund</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="receipts" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt #</TableHead>
                      <TableHead>Issued To</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Issued At</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No receipts generated</TableCell></TableRow>
                    ) : receipts.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono font-medium">{r.receipt_number}</TableCell>
                        <TableCell>{r.issued_to_name}</TableCell>
                        <TableCell className="font-mono">{r.currency} {Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-sm">{new Date(r.issued_at).toLocaleDateString()}</TableCell>
                        <TableCell><Badge variant={r.voided_at ? 'destructive' : 'default'}>{r.voided_at ? 'Voided' : 'Valid'}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => viewReceipt(r)}><FileText className="h-3 w-3 mr-1" />View</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="refunds" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refunds.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No refunds</TableCell></TableRow>
                    ) : refunds.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="font-mono">${Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{r.reason}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'processed' ? 'default' : r.status === 'rejected' ? 'destructive' : 'outline'} className="capitalize">
                            {REFUND_STATUS_LABELS[r.status] || r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">{r.refund_method?.replace('_', ' ') || '—'}</TableCell>
                        <TableCell className="text-right space-x-1">
                          {r.status === 'pending' && isAdmin && (
                            <>
                              <Button variant="ghost" size="sm" className="text-green-600" onClick={() => handleApproveRefund(r, 'approved')}>
                                <CheckCircle className="h-3 w-3 mr-1" />Approve
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleApproveRefund(r, 'rejected')}>
                                <XCircle className="h-3 w-3 mr-1" />Reject
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Refund Request Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Refund</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Original Amount</Label>
              <p className="font-mono text-lg">{selectedPayment?.currency} {Number(selectedPayment?.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="space-y-2">
              <Label>Refund Amount *</Label>
              <Input type="number" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} max={selectedPayment?.amount} />
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder="Why is this refund being requested?" />
            </div>
            <Button onClick={handleRequestRefund} disabled={saving} className="w-full">
              {saving ? 'Submitting...' : 'Submit Refund Request'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt View Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payment Receipt</DialogTitle></DialogHeader>
          {selectedReceipt && (
            <div className="space-y-4">
              <div className="border rounded-lg p-6 space-y-4">
                <div className="text-center border-b pb-4">
                  <h3 className="text-lg font-bold">PAYMENT RECEIPT</h3>
                  <p className="font-mono text-primary">{selectedReceipt.receipt_number}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Issued To:</span><p className="font-medium">{selectedReceipt.issued_to_name}</p></div>
                  <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{selectedReceipt.issued_to_email || '—'}</p></div>
                  <div><span className="text-muted-foreground">Amount:</span><p className="font-mono font-bold text-lg">{selectedReceipt.currency} {Number(selectedReceipt.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></div>
                  <div><span className="text-muted-foreground">Date:</span><p className="font-medium">{new Date(selectedReceipt.issued_at).toLocaleDateString()}</p></div>
                </div>
                {selectedReceipt.fee_breakdown && selectedReceipt.fee_breakdown.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-sm font-medium mb-2">Fee Breakdown</p>
                    {selectedReceipt.fee_breakdown.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{item.name}</span>
                        <span className="font-mono">{selectedReceipt.currency} {Number(item.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedReceipt.voided_at && (
                  <div className="border-t pt-3 text-destructive text-sm">
                    <p className="font-bold">VOIDED</p>
                    <p>{selectedReceipt.voided_reason}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
