import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Gavel, Loader2, ExternalLink } from 'lucide-react';

export const ENFORCEMENT_STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: 'Opened', className: 'bg-blue-100 text-blue-800' },
  opened: { label: 'Opened', className: 'bg-blue-100 text-blue-800' },
  notice_issued: { label: 'Notice issued', className: 'bg-amber-100 text-amber-800' },
  response_received: { label: 'Response received', className: 'bg-indigo-100 text-indigo-800' },
  decided: { label: 'Decided', className: 'bg-purple-100 text-purple-800' },
  appealed: { label: 'Appealed', className: 'bg-orange-100 text-orange-800' },
  closed: { label: 'Closed', className: 'bg-slate-200 text-slate-800' },
  withdrawn: { label: 'Withdrawn', className: 'bg-slate-100 text-slate-600' },
};

const ALL_STATUSES = ['open', 'notice_issued', 'response_received', 'decided', 'appealed', 'closed', 'withdrawn'];

export default function EnforcementList() {
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'opened_desc' | 'opened_asc' | 'penalty_desc' | 'penalty_asc'>('opened_desc');
  const dashboardFilter = searchParams.get('filter'); // 'pending_action' | 'new_this_month'

  useEffect(() => {
    const status = searchParams.get('status');
    if (status && ALL_STATUSES.includes(status)) {
      setStatusFilter(status);
    } else if (searchParams.get('filter') === 'pending_action') {
      setStatusFilter('all');
    }
  }, [searchParams]);

  const { data: cases, isLoading } = useQuery({
    queryKey: ['enforcement_cases_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('enforcement_actions')
        .select('id, case_number, entity_id, enforcement_type, status, date_opened, penalty_amount, penalty_paid_amount, penalty_currency, decision_outcome, notice_issued_at, closed_at, description')
        .order('date_opened', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: licensees } = useQuery({
    queryKey: ['enforcement_licensees_map'],
    queryFn: async () => {
      const { data } = await supabase.from('licensees').select('id, name');
      const map = new Map<string, string>();
      (data ?? []).forEach((l: any) => map.set(l.id, l.name));
      return map;
    },
  });

  const types = useMemo(() => Array.from(new Set((cases ?? []).map((c: any) => c.enforcement_type))).sort(), [cases]);

  const filtered = useMemo(() => {
    let list = cases ?? [];
    if (statusFilter === 'active') list = list.filter((c: any) => !['closed', 'withdrawn'].includes(c.status));
    else if (statusFilter !== 'all') list = list.filter((c: any) => c.status === statusFilter);
    if (dashboardFilter === 'pending_action') {
      list = list.filter((c: any) => ['notice_issued', 'response_received', 'appealed'].includes(c.status));
    } else if (dashboardFilter === 'new_this_month') {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      list = list.filter((c: any) => c.date_opened && new Date(c.date_opened) >= monthStart);
    }
    if (typeFilter !== 'all') list = list.filter((c: any) => c.enforcement_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c: any) =>
        (c.case_number || '').toLowerCase().includes(q) ||
        (licensees?.get(c.entity_id) || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === 'opened_desc') sorted.sort((a: any, b: any) => (b.date_opened || '').localeCompare(a.date_opened || ''));
    else if (sort === 'opened_asc') sorted.sort((a: any, b: any) => (a.date_opened || '').localeCompare(b.date_opened || ''));
    else if (sort === 'penalty_desc') sorted.sort((a: any, b: any) => Number(b.penalty_amount || 0) - Number(a.penalty_amount || 0));
    else if (sort === 'penalty_asc') sorted.sort((a: any, b: any) => Number(a.penalty_amount || 0) - Number(b.penalty_amount || 0));
    return sorted;
  }, [cases, statusFilter, typeFilter, search, sort, licensees, dashboardFilter]);

  const stats = useMemo(() => {
    const total = (cases ?? []).length;
    const active = (cases ?? []).filter((c: any) => !['closed', 'withdrawn'].includes(c.status)).length;
    const totalPenalty = (cases ?? []).reduce((s: number, c: any) => s + Number(c.penalty_amount || 0), 0);
    const collected = (cases ?? []).reduce((s: number, c: any) => s + Number(c.penalty_paid_amount || 0), 0);
    return { total, active, totalPenalty, collected, outstanding: totalPenalty - collected };
  }, [cases]);

  const daysOpen = (d: string | null) => {
    if (!d) return '—';
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    return `${days}d`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Enforcement Queue"
          description="Cross-licensee enforcement caseload — from case opening through final decision."
          actions={<Badge variant="outline" className="text-sm"><Gavel className="h-3 w-3 mr-1" /> {stats.active} active</Badge>}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total cases</div><div className="text-2xl font-semibold">{stats.total}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Active</div><div className="text-2xl font-semibold text-blue-700">{stats.active}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Penalties collected</div><div className="text-2xl font-semibold text-green-700">${stats.collected.toLocaleString()}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-2xl font-semibold text-red-700">${stats.outstanding.toLocaleString()}</div></CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Search case #, licensee, description…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="all">All statuses</SelectItem>
                  {ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{ENFORCEMENT_STATUS_META[s]?.label || s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {types.map((t: any) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v: any) => setSort(v)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="opened_desc">Newest first</SelectItem>
                  <SelectItem value="opened_asc">Oldest first</SelectItem>
                  <SelectItem value="penalty_desc">Largest penalty</SelectItem>
                  <SelectItem value="penalty_asc">Smallest penalty</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No cases match the current filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Case #</th>
                      <th className="py-2 pr-3">Licensee</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Opened</th>
                      <th className="py-2 pr-3">Days open</th>
                      <th className="py-2 pr-3 text-right">Penalty</th>
                      <th className="py-2 pr-3 text-right">Paid</th>
                      <th className="py-2 pr-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c: any) => {
                      const meta = ENFORCEMENT_STATUS_META[c.status] || ENFORCEMENT_STATUS_META.opened;
                      const currency = c.penalty_currency || 'USD';
                      return (
                        <tr key={c.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 pr-3 font-medium">{c.case_number}</td>
                          <td className="py-2 pr-3">
                            {c.entity_id ? (
                              <Link className="underline" to={`/admin/licensees/${c.entity_id}`}>{licensees?.get(c.entity_id) || `${String(c.entity_id).slice(0, 8)}…`}</Link>
                            ) : '—'}
                          </td>
                          <td className="py-2 pr-3">{c.enforcement_type}</td>
                          <td className="py-2 pr-3"><Badge variant="outline" className={meta.className}>{meta.label}</Badge></td>
                          <td className="py-2 pr-3 text-xs">{c.date_opened || '—'}</td>
                          <td className="py-2 pr-3 text-xs">{['closed', 'withdrawn'].includes(c.status) ? '—' : daysOpen(c.date_opened)}</td>
                          <td className="py-2 pr-3 text-right">{c.penalty_amount != null ? `${currency} ${Number(c.penalty_amount).toLocaleString()}` : '—'}</td>
                          <td className="py-2 pr-3 text-right text-green-700">{c.penalty_paid_amount ? `${currency} ${Number(c.penalty_paid_amount).toLocaleString()}` : '—'}</td>
                          <td className="py-2 pr-3">
                            <Button asChild variant="ghost" size="sm"><Link to={`/enforcement/${c.id}`}>Open <ExternalLink className="h-3 w-3 ml-1" /></Link></Button>
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
