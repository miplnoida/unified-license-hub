import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { buildTrend, derivePatternSignals, type AlertRow, type ComplaintRow } from '@/lib/conduct/analytics';

interface Props {
  complaints: ComplaintRow[];
  alerts: AlertRow[];
  days: number;
  labels: {
    product: (id?: string | null) => string;
    channel: (id?: string | null) => string;
    category: (id?: string | null) => string;
    licensee: (id?: string | null) => string;
  };
}

export function ConductTrendsPanel({ complaints, alerts, days, labels }: Props) {
  const { bucketing, points } = useMemo(() => buildTrend(complaints, alerts, days), [complaints, alerts, days]);
  const signals = useMemo(() => derivePatternSignals(points, complaints, labels), [points, complaints, labels]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Volume trend</CardTitle>
          <p className="text-xs text-muted-foreground">Complaints raised and resolved, conduct alerts and SLA breaches per {bucketing}.</p>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer>
            <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Line type="monotone" dataKey="raised" name="Raised" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resolved" name="Resolved" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="alerts" name="Alerts" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="slaBreached" name="SLA breached" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Severity mix over time</CardTitle>
          <p className="text-xs text-muted-foreground">Shows escalation in severity, not just volume.</p>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer>
            <AreaChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Area type="monotone" stackId="sev" dataKey="low" name="Low" stroke="hsl(var(--info))" fill="hsl(var(--info))" fillOpacity={0.25} />
              <Area type="monotone" stackId="sev" dataKey="medium" name="Medium" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} />
              <Area type="monotone" stackId="sev" dataKey="high" name="High" stroke="hsl(var(--warning))" fill="hsl(var(--warning))" fillOpacity={0.3} />
              <Area type="monotone" stackId="sev" dataKey="critical" name="Critical" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.35} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Pattern signals</CardTitle>
          <p className="text-xs text-muted-foreground">Computed from the filtered window — no signal is shown unless the data supports it.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {signals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No spikes, severity shifts or concentrations detected in this window.</p>
          ) : signals.map((s) => (
            <div
              key={s.id}
              className={`rounded-md border p-3 ${s.tone === 'danger' ? 'border-destructive/60 bg-destructive/5' : s.tone === 'warn' ? 'border-amber-500/60 bg-amber-500/5' : 'bg-muted/40'}`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className={`h-4 w-4 mt-0.5 ${s.tone === 'danger' ? 'text-destructive' : s.tone === 'warn' ? 'text-amber-600' : 'text-muted-foreground'}`} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.detail}</div>
                </div>
                <Badge variant="outline" className="capitalize text-xs">{s.kind.replace(/_/g, ' ')}</Badge>
                {s.link && <Link to={s.link} className="text-xs underline shrink-0">Open</Link>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
