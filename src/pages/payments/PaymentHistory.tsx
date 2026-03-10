import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2 } from 'lucide-react';

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
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline', completed: 'default', failed: 'destructive', refunded: 'secondary',
};

export default function PaymentHistory() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.from('payments' as any).select('*').order('created_at', { ascending: false });
      if (!error) setPayments((data || []) as any);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = payments.filter(p => {
    if (!search) return true;
    return (p.transaction_ref?.toLowerCase().includes(search.toLowerCase()) ||
            p.receipt_number?.toLowerCase().includes(search.toLowerCase()));
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Payment History" description="View all payment transactions and receipts" />
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
                    <TableHead>Receipt</TableHead>
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
                      <TableCell className="text-sm text-muted-foreground">{p.payment_method || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{p.transaction_ref || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{p.receipt_number || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
