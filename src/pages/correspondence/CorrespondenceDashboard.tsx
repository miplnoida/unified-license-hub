import { useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricsCards } from '@/components/correspondence/MetricsCards';
import { AgingBuckets } from '@/components/correspondence/AgingBuckets';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { seedCases } from './seed';
import { Link } from 'react-router-dom';

export default function CorrespondenceDashboard() {
  const metrics = useMemo(() => {
    const now = Date.now();
    const open = seedCases.filter((c) => c.status !== 'closed' && c.status !== 'responded');
    const overdue = open.filter((c) => new Date(c.dueAt).getTime() < now).length;
    const closedThisMonth = seedCases.filter((c) => c.closedAt && new Date(c.closedAt).getMonth() === new Date().getMonth()).length;
    const responded = seedCases.filter((c) => c.respondedAt);
    const avgResponseDays = responded.length
      ? responded.reduce((s, c) => s + (new Date(c.respondedAt!).getTime() - new Date(c.receivedAt).getTime()) / 86_400_000, 0) / responded.length
      : 0;

    const bucket = (days: number) => {
      if (days <= 3) return '0-3 d';
      if (days <= 7) return '4-7 d';
      if (days <= 14) return '8-14 d';
      return '15+ d';
    };
    const agingMap = new Map<string, number>([
      ['0-3 d', 0], ['4-7 d', 0], ['8-14 d', 0], ['15+ d', 0],
    ]);
    open.forEach((c) => {
      const days = (now - new Date(c.receivedAt).getTime()) / 86_400_000;
      agingMap.set(bucket(days), (agingMap.get(bucket(days)) ?? 0) + 1);
    });
    const aging = Array.from(agingMap.entries()).map(([bucket, count]) => ({ bucket, count }));

    const byUnitMap = new Map<string, number>();
    open.forEach((c) => byUnitMap.set(c.assignedUnit, (byUnitMap.get(c.assignedUnit) ?? 0) + 1));
    const byUnit = Array.from(byUnitMap.entries()).map(([unit, count]) => ({ unit, count }));

    const byCategoryMap = new Map<string, number>();
    seedCases.forEach((c) => byCategoryMap.set(c.category, (byCategoryMap.get(c.category) ?? 0) + 1));
    const byCategory = Array.from(byCategoryMap.entries()).map(([name, value]) => ({ name, value }));

    // Bottlenecks: median dwell time in each status for open cases (mocked)
    const bottlenecks = [
      { step: 'Classification', avgHours: 3 },
      { step: 'Assignment', avgHours: 6 },
      { step: 'Review', avgHours: 42 },
      { step: 'Approval', avgHours: 28 },
      { step: 'Response dispatch', avgHours: 12 },
    ];

    return { open, overdue, closedThisMonth, avgResponseDays, aging, byUnit, byCategory, bottlenecks };
  }, []);

  const pieColors = ['hsl(var(--primary))', '#16a34a', '#f59e0b', '#dc2626', '#0ea5e9', '#a855f7', '#64748b', '#f97316'];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Correspondence Dashboard"
          description="Volume, workload, aging, response performance, and operational bottlenecks."
          actions={<Button asChild variant="outline"><Link to="/correspondence/inbox">Open inbox</Link></Button>}
        />

        <MetricsCards
          totalOpen={metrics.open.length}
          overdue={metrics.overdue}
          avgResponseDays={metrics.avgResponseDays}
          closedThisMonth={metrics.closedThisMonth}
        />

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
            <CardHeader><CardTitle className="text-base">Bottleneck — average time spent in each step</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Step</TableHead>
                    <TableHead className="text-right">Avg hours</TableHead>
                    <TableHead className="text-right">Signal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.bottlenecks.map((b) => (
                    <TableRow key={b.step}>
                      <TableCell className="font-medium">{b.step}</TableCell>
                      <TableCell className="text-right font-mono">{b.avgHours}h</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={b.avgHours > 24 ? 'destructive' : b.avgHours > 12 ? 'secondary' : 'outline'}>
                          {b.avgHours > 24 ? 'Bottleneck' : b.avgHours > 12 ? 'Watch' : 'OK'}
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
