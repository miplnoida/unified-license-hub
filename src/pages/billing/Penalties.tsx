import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, DollarSign, Clock, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';

export default function Penalties() {
  const { data: cases, isLoading } = useQuery({
    queryKey: ['penalties_from_enforcement'],
    queryFn: async () => {
      const { data, error } = await supabase.from('enforcement_actions')
        .select('id, case_number, entity_id, enforcement_type, status, date_opened, penalty_amount, penalty_paid_amount, penalty_currency, appeal_deadline, decision_at, closed_at, resolution_date')
        .not('penalty_amount', 'is', null)
        .gt('penalty_amount', 0)
        .order('date_opened', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: licensees } = useQuery({
    queryKey: ['penalty_licensees_map'],
    queryFn: async () => {
      const { data } = await supabase.from('licensees').select('id, name');
      const map = new Map<string, string>();
      (data ?? []).forEach((l: any) => map.set(l.id, l.name));
      return map;
    },
  });

  const stats = useMemo(() => {
    const totals = { assessed: 0, collected: 0, outstanding: 0, disputed: 0 };
    for (const c of cases ?? []) {
      const amt = Number(c.penalty_amount || 0);
      const paid = Number(c.penalty_paid_amount || 0);
      totals.assessed += amt;
      totals.collected += paid;
      const remaining = Math.max(0, amt - paid);
      if (c.status === 'appealed') totals.disputed += remaining;
      else if (!['closed', 'withdrawn'].includes(c.status)) totals.outstanding += remaining;
    }
    return totals;
  }, [cases]);

  const isOverdue = (c: any) => {
    const paid = Number(c.penalty_paid_amount || 0);
    const amt = Number(c.penalty_amount || 0);
    if (paid >= amt) return false;
    if (!c.decision_at) return false;
    const dueDate = c.appeal_deadline ? new Date(c.appeal_deadline) : new Date(new Date(c.decision_at).getTime() + 30 * 86400000);
    return dueDate.getTime() < Date.now();
  };

  const fmt = (currency: string, n: number) => `${currency || 'USD'} ${Number(n || 0).toLocaleString()}`;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Penalties"
          description="Live view of penalties assessed through enforcement cases — collections, outstanding, and disputes."
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total assessed" value={fmt('USD', stats.assessed)} icon={<AlertTriangle className="h-6 w-6" />} />
          <StatCard title="Collected" value={fmt('USD', stats.collected)} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Outstanding" value={fmt('USD', stats.outstanding)} icon={<DollarSign className="h-6 w-6" />} variant="danger" />
          <StatCard title="Disputed (appealed)" value={fmt('USD', stats.disputed)} icon={<Clock className="h-6 w-6" />} variant="warning" />
        </div>

        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…</div>
            ) : (cases ?? []).length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No penalties have been assessed yet. Penalties appear here when an enforcement case is decided with a monetary penalty.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Case #</th>
                      <th className="py-2 pr-3">Licensee</th>
                      <th className="py-2 pr-3">Reason</th>
                      <th className="py-2 pr-3 text-right">Assessed</th>
                      <th className="py-2 pr-3 text-right">Paid</th>
                      <th className="py-2 pr-3 text-right">Outstanding</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {(cases ?? []).map((c: any) => {
                      const currency = c.penalty_currency || 'USD';
                      const amt = Number(c.penalty_amount || 0);
                      const paid = Number(c.penalty_paid_amount || 0);
                      const outstanding = Math.max(0, amt - paid);
                      const overdue = isOverdue(c);
                      const fullyPaid = outstanding === 0;
                      return (
                        <tr key={c.id} className={`border-b hover:bg-muted/30 ${overdue ? 'bg-red-50/40' : ''}`}>
                          <td className="py-2 pr-3 font-medium">{c.case_number}</td>
                          <td className="py-2 pr-3">{licensees?.get(c.entity_id) || `${String(c.entity_id).slice(0, 8)}…`}</td>
                          <td className="py-2 pr-3">{c.enforcement_type}</td>
                          <td className="py-2 pr-3 text-right">{fmt(currency, amt)}</td>
                          <td className="py-2 pr-3 text-right text-green-700">{fmt(currency, paid)}</td>
                          <td className={`py-2 pr-3 text-right ${outstanding > 0 ? 'text-red-700 font-medium' : 'text-muted-foreground'}`}>{fmt(currency, outstanding)}</td>
                          <td className="py-2 pr-3">
                            {fullyPaid ? <Badge variant="outline" className="bg-green-100 text-green-800">Paid</Badge>
                              : overdue ? <Badge variant="outline" className="bg-red-100 text-red-800">Overdue</Badge>
                              : c.status === 'appealed' ? <Badge variant="outline" className="bg-orange-100 text-orange-800">Disputed</Badge>
                              : <Badge variant="outline">Outstanding</Badge>}
                          </td>
                          <td className="py-2 pr-3">
                            <Button asChild variant="ghost" size="sm"><Link to={`/enforcement/${c.id}`}>Case <ExternalLink className="h-3 w-3 ml-1" /></Link></Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
