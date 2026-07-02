import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

const TYPE_COLOR: Record<string, string> = {
  'on-site': 'bg-blue-100 text-blue-800 border-blue-300',
  'off-site': 'bg-purple-100 text-purple-800 border-purple-300',
  'desk-review': 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

export default function InspectionsCalendar() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const rangeStart = useMemo(() => cursor, [cursor]);
  const rangeEnd = useMemo(() => addMonths(cursor, 1), [cursor]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['inspections_calendar', cursor.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('id, entity_id, inspection_type, status, scheduled_date, date_conducted, inspector_name')
        .gte('scheduled_date', rangeStart.toISOString().slice(0, 10))
        .lt('scheduled_date', rangeEnd.toISOString().slice(0, 10))
        .order('scheduled_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const entityIds = useMemo(() => Array.from(new Set((rows ?? []).map((r: any) => r.entity_id))), [rows]);
  const { data: licenseeMap } = useQuery({
    queryKey: ['inspections_calendar_licensees', entityIds.join(',')],
    enabled: entityIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('licensees').select('id, name').in('id', entityIds);
      const m = new Map<string, string>();
      (data ?? []).forEach((l: any) => m.set(l.id, l.name));
      return m;
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    (rows ?? []).forEach((r: any) => {
      const k = (r.scheduled_date || r.date_conducted || '').slice(0, 10);
      if (!k) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    });
    return m;
  }, [rows]);

  const firstDow = cursor.getDay(); // 0 = Sun
  const daysCount = daysInMonth(cursor);
  const cells: { date: Date | null }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ date: null });
  for (let d = 1; d <= daysCount; d++) cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d) });
  while (cells.length % 7 !== 0) cells.push({ date: null });

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <DashboardLayout>
      <PageHeader
        title="Inspection calendar"
        description="Monthly view of scheduled inspections"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>Today</Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{monthLabel}</h3>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="grid grid-cols-7 gap-px bg-border rounded overflow-hidden text-xs">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <div key={d} className="bg-muted p-2 text-center font-medium">{d}</div>
            ))}
            {cells.map((c, i) => {
              const key = c.date ? c.date.toISOString().slice(0, 10) : `blank-${i}`;
              const list = c.date ? byDay.get(key) ?? [] : [];
              const today = c.date && c.date.toDateString() === new Date().toDateString();
              return (
                <div key={key} className={`bg-background min-h-[110px] p-1.5 ${!c.date ? 'opacity-40' : ''} ${today ? 'ring-2 ring-primary ring-inset' : ''}`}>
                  <div className="text-xs text-muted-foreground mb-1">{c.date?.getDate() ?? ''}</div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((r: any) => {
                      const cls = TYPE_COLOR[r.inspection_type] ?? 'bg-slate-100 text-slate-800 border-slate-300';
                      return (
                        <Link key={r.id} to={`/inspections/${r.id}`} className={`block truncate rounded border px-1 py-0.5 text-[10px] hover:opacity-80 ${cls}`}>
                          {licenseeMap?.get(r.entity_id) ?? r.inspector_name ?? 'Inspection'}
                        </Link>
                      );
                    })}
                    {list.length > 3 && <div className="text-[10px] text-muted-foreground">+{list.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 mt-3 text-xs">
            {Object.entries(TYPE_COLOR).map(([t, cls]) => (
              <div key={t} className="flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded border ${cls}`} />{t}</div>
            ))}
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
