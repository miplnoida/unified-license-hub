import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { engagementLabel, engagementMode } from '@/lib/supervisoryEngagement';

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

const TYPE_COLOR: Record<string, string> = {
  ONSITE: 'bg-primary/10 text-primary border-primary/30',
  OFFSITE: 'bg-accent text-accent-foreground border-border',
  MIXED: 'bg-muted text-muted-foreground border-border',
};

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function ExaminationSchedule() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const rangeStart = useMemo(() => cursor, [cursor]);
  const rangeEnd = useMemo(() => addMonths(cursor, 1), [cursor]);

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['examination_schedule', dateKey(cursor)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('examinations')
        .select('id, entity_id, engagement_type, examination_type, stage, fieldwork_start, title, reference')
        .gte('fieldwork_start', dateKey(rangeStart))
        .lt('fieldwork_start', dateKey(rangeEnd))
        .order('fieldwork_start', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const entityIds = useMemo(() => Array.from(new Set((rows ?? []).map((r: any) => r.entity_id))), [rows]);
  const { data: licenseeMap } = useQuery({
    queryKey: ['examination_schedule_licensees', entityIds.join(',')],
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
      const k = (r.fieldwork_start || '').slice(0, 10);
      if (!k) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k)?.push(r);
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
        title="Examination activity schedule"
        description="Scheduled examination start dates"
        actions={
          <div className="flex gap-2">
            <Button aria-label="Previous month" variant="outline" size="sm" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>Today</Button>
            <Button aria-label="Next month" variant="outline" size="sm" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{monthLabel}</h3>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {error && <p role="alert" className="text-destructive">The examination schedule could not be loaded.</p>}

          <div className="grid grid-cols-7 gap-px bg-border rounded overflow-hidden text-xs">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <div key={d} className="bg-muted p-2 text-center font-medium">{d}</div>
            ))}
            {cells.map((c, i) => {
              const key = c.date ? dateKey(c.date) : `blank-${i}`;
              const list = c.date ? byDay.get(key) ?? [] : [];
              const today = c.date && c.date.toDateString() === new Date().toDateString();
              return (
                <div key={key} className={`bg-background min-h-[110px] p-1.5 ${!c.date ? 'opacity-40' : ''} ${today ? 'ring-2 ring-primary ring-inset' : ''}`}>
                  <div className="text-xs text-muted-foreground mb-1">{c.date?.getDate() ?? ''}</div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((r: any) => {
                      const cls = TYPE_COLOR[engagementMode(r.engagement_type ?? r.examination_type)];
                      return (
                        <Link key={r.id} to={`/supervision/examinations/${r.id}`} title={`${r.reference} — ${engagementLabel(r.engagement_type ?? r.examination_type)}`} className={`block truncate rounded border px-1 py-0.5 text-[10px] hover:opacity-80 ${cls}`}>
                          {licenseeMap?.get(r.entity_id) ?? r.title ?? r.reference}
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
