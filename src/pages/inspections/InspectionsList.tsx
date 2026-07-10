import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { ClipboardCheck, Loader2, CalendarDays, ExternalLink } from 'lucide-react';

const STATUS_META: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'In progress', className: 'bg-indigo-100 text-indigo-800' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600' },
};

type InspectionRow = any;

function isOverdue(r: InspectionRow): boolean {
  if (r.status !== 'scheduled') return false;
  const sched = r.scheduled_date || r.date_conducted;
  if (!sched) return false;
  return new Date(sched) < new Date(new Date().toDateString());
}

export default function InspectionsList() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<'scheduled' | 'in_progress' | 'completed' | 'overdue' | 'all'>('scheduled');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const status = searchParams.get('status');
    const filter = searchParams.get('filter');
    if (status === 'scheduled' || status === 'in_progress' || status === 'completed') {
      setTab(status);
    } else if (filter === 'overdue') {
      setTab('overdue');
    }
  }, [searchParams]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['inspections_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('id, entity_id, inspection_type, status, date_conducted, scheduled_date, inspector_name, location, scope, compliance_rating')
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const entityIds = useMemo(() => Array.from(new Set((rows ?? []).map((r: any) => r.entity_id))), [rows]);
  const { data: licenseeMap } = useQuery({
    queryKey: ['inspections_licensees', entityIds.join(',')],
    enabled: entityIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('licensees').select('id, name').in('id', entityIds);
      const m = new Map<string, string>();
      (data ?? []).forEach((l: any) => m.set(l.id, l.name));
      return m;
    },
  });

  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (tab === 'overdue') list = list.filter(isOverdue);
    else if (tab !== 'all') list = list.filter((r: any) => r.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r: any) =>
        (licenseeMap?.get(r.entity_id) || '').toLowerCase().includes(q) ||
        (r.inspector_name || '').toLowerCase().includes(q) ||
        (r.location || '').toLowerCase().includes(q) ||
        (r.scope || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, tab, search, licenseeMap]);

  const counts = useMemo(() => ({
    scheduled: (rows ?? []).filter((r: any) => r.status === 'scheduled' && !isOverdue(r)).length,
    in_progress: (rows ?? []).filter((r: any) => r.status === 'in_progress').length,
    completed: (rows ?? []).filter((r: any) => r.status === 'completed').length,
    overdue: (rows ?? []).filter(isOverdue).length,
    all: (rows ?? []).length,
  }), [rows]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Inspections"
        description="Cross-entity inspection queue"
        actions={
          <Button variant="outline" asChild>
            <Link to="/inspections/schedule"><CalendarDays className="h-4 w-4 mr-2" />Calendar</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
            <TabsList>
              <TabsTrigger value="scheduled">Scheduled ({counts.scheduled})</TabsTrigger>
              <TabsTrigger value="in_progress">In progress ({counts.in_progress})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
              <TabsTrigger value="overdue">Overdue ({counts.overdue})</TabsTrigger>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            </TabsList>
          </Tabs>

          <Input placeholder="Search licensee, inspector, location, scope…" value={search} onChange={(e) => setSearch(e.target.value)} />

          {isLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading inspections…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground flex flex-col items-center gap-2">
              <ClipboardCheck className="h-6 w-6" />
              No inspections match this view.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">Licensee</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Scheduled</th>
                    <th className="p-2">Inspector</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => {
                    const meta = STATUS_META[r.status] ?? { label: r.status, className: 'bg-slate-100 text-slate-700' };
                    const overdue = isOverdue(r);
                    const sched = r.scheduled_date || r.date_conducted;
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/40">
                        <td className="p-2 font-medium">{licenseeMap?.get(r.entity_id) ?? '—'}</td>
                        <td className="p-2 capitalize">{r.inspection_type}</td>
                        <td className="p-2">
                          <div>{sched ? new Date(sched).toLocaleDateString() : '—'}</div>
                          {overdue && <div className="text-xs text-red-600">Overdue</div>}
                        </td>
                        <td className="p-2">{r.inspector_name || '—'}</td>
                        <td className="p-2"><Badge className={meta.className}>{meta.label}</Badge></td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/inspections/${r.id}`}><ExternalLink className="h-3 w-3 mr-1" />Open</Link>
                          </Button>
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
    </DashboardLayout>
  );
}
