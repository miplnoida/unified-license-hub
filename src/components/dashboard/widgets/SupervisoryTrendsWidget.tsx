import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useSupervisoryTrends, type SupervisoryTrendsOptions } from '@/hooks/useSupervisoryTrends';

interface SeriesDef {
  key: 'applications' | 'complaints' | 'enforcement' | 'returns';
  label: string;
  color: string;
}

const ALL_SERIES: SeriesDef[] = [
  { key: 'applications', label: 'Applications', color: '#2563eb' },
  { key: 'complaints', label: 'Complaints', color: '#f59e0b' },
  { key: 'enforcement', label: 'Enforcement', color: '#dc2626' },
  { key: 'returns', label: 'Returns filed', color: '#16a34a' },
];

/**
 * Six-month volume trend across the modules already surfaced as KPI tiles
 * on SupervisoryDashboard.tsx. Each series is only fetched/rendered when the
 * caller has access to that module (same `can.*` gates used elsewhere on
 * this dashboard).
 */
export function SupervisoryTrendsWidget({ enabled }: { enabled: SupervisoryTrendsOptions }) {
  const { trends, isLoading } = useSupervisoryTrends(enabled);
  const series = ALL_SERIES.filter((s) => enabled[s.key]);

  if (series.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> Volume Trends
          <span className="text-xs font-normal text-muted-foreground ml-2">Last 6 months</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <AreaChart data={trends} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`trend-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid hsl(var(--border))' }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#trend-${s.key})`}
                  activeDot={{ r: 4 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
