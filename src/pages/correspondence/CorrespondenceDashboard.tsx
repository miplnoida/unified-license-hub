import { useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricsCards } from '@/components/correspondence/MetricsCards';
import { AgingBuckets } from '@/components/correspondence/AgingBuckets';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { useCorrespondenceThreads } from '@/hooks/useCorrespondence';
import { Link } from 'react-router-dom';

export default function CorrespondenceDashboard() {
  const { data: threads = [], isLoading } = useCorrespondenceThreads();

  const metrics = useMemo(() => {
    const now = Date.now();
    const open = threads.filter((c) => c.status !== 'closed' && c.status !== 'responded');
    const overdue = open.filter((c) => c.due_at && new Date(c.due_at).getTime() < now).length;
    const thisMonth = new Date().getMonth();
    const closedThisMonth = threads.filter((c) => c.closed_at && new Date(c.closed_at).getMonth() === thisMonth).length;
    const responded = threads.filter((c) => c.responded_at);
    const avgResponseDays = responded.length
      ? responded.reduce((s, c) => s + (new Date(c.responded_at!).getTime() - new Date(c.received_at).getTime()) / 86_400_000, 0) / responded.length
      : 0;

    const bucket = (days: number) => (days <= 3 ? '0-3 d' : days <= 7 ? '4-7 d' : days <= 14 ? '8-14 d' : '15+ d');
    const agingMap = new Map<string, number>([['0-3 d', 0], ['4-7 d', 0], ['8-14 d', 0], ['15+ d', 0]]);
    open.forEach((c) => {
      const days = (now - new Date(c.received_at).getTime()) / 86_400_000;
      agingMap.set(bucket(days), (agingMap.get(bucket(days)) ?? 0) + 1);
    });
    const aging = Array.from(agingMap.entries()).map(([b, count]) => ({ bucket: b, count }));

    const byUnitMap = new Map<string, number>();
    open.forEach((c) => {
      const unit = c.assigned_unit ?? 'Unassigned';
      byUnitMap.set(unit, (byUnitMap.get(unit) ?? 0) + 1);
    });
    const byUnit = Array.from(byUnitMap.entries()).map(([unit, count]) => ({ unit, count }));

    const byCategoryMap = new Map<string, number>();
    threads.forEach((c) => byCategoryMap.set(c.category, (byCategoryMap.get(c.category) ?? 0) + 1));
    const byCategory = Array.from(byCategoryMap.entries()).map(([name, value]) => ({ name, value }));

    // Where cases are sitting right now (open workload by lifecycle stage)
    const stages = ['received', 'classified', 'assigned', 'in_review', 'approved'];
    const byStage = stages.map((stage) => {
      const inStage = open.filter((c) => c.status === stage);
      const avgHours = inStage.length
        ? inStage.reduce((s, c) => s + (now - new Date(c.updated_at).getTime()) / 3_600_000, 0) / inStage.length
        : 0;
      return { step: stage.replace('_', ' '), count: inStage.length, avgHours: Math.round(avgHours) };
    });

    return { open, overdue, closedThisMonth, avgResponseDays, aging, byUnit, byCategory, byStage };
  }, [threads]);

  const pieColors = ['hsl(var(--primary))', '#16a34a', '#f59e0b', '#dc2626', '#0ea5e9', '#a855f7', '#64748b', '#f97316'];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Correspondence Dashboard"
          description="Volume, workload, aging, response performance, and operational bottlenecks."
          actions={<Button asChild variant="outline"><Link to="/correspondence/inbox">Open inbox</Link></Button>}
        />

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <MetricsCards
            totalOpen={metrics.open.length}
            overdue={metrics.overdue}
            avgResponseDays={metrics.avgResponseDays}
            closedThisMonth={metrics.closedThisMonth}
          />
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          <AgingBuckets data={metrics.aging} />

          <Card>
            <CardHeader><CardTitle className="text-base">Workload by unit (open cases)</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <BarChart data={metrics.byUnit} layout="vertical" margin={{ left: 30 }}>
                  <XAxis type="number" fontSize={12} allowDecimals={false} />
                  <YAxis dataKey="unit" type="category" fontSize={11} width={140} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Volume by category</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={metrics.byCategory} dataKey="value" nameKey="name" outerRadius={80} label>
                    {metrics.byCategory.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Bottleneck — open cases waiting at each step</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Step</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Avg wait</TableHead>
                    <TableHead className="text-right">Signal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.byStage.map((b) => (
                    <TableRow key={b.step}>
                      <TableCell className="font-medium capitalize">{b.step}</TableCell>
                      <TableCell className="text-right font-mono">{b.count}</TableCell>
                      <TableCell className="text-right font-mono">{b.avgHours}h</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={b.avgHours > 24 ? 'destructive' : b.avgHours > 12 ? 'secondary' : 'outline'}>
                          {b.count === 0 ? 'Clear' : b.avgHours > 24 ? 'Bottleneck' : b.avgHours > 12 ? 'Watch' : 'OK'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
