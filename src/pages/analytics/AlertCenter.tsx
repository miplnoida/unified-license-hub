import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { objectRoute } from '@/lib/routes/objectRoutes';
import {
  Loader2,
  AlertTriangle,
  Gavel,
  MessageSquare,
  Shield,
  ClipboardCheck,
  FileText,
  UserCheck,
  Filter,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type AlertItem = {
  id: string;
  source:
    | 'breach'
    | 'enforcement'
    | 'complaint'
    | 'risk'
    | 'inspection'
    | 'return'
    | 'fp_monitor';
  title: string;
  detail?: string;
  severity: Severity;
  created_at: string;
  href: string;
};

const SEV_ORDER: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const SEV_STYLE: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  low: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const SOURCE_META: Record<AlertItem['source'], { label: string; icon: React.ReactNode }> = {
  breach: { label: 'Prudential Breach', icon: <AlertTriangle className="h-4 w-4" /> },
  enforcement: { label: 'Enforcement', icon: <Gavel className="h-4 w-4" /> },
  complaint: { label: 'Complaint', icon: <MessageSquare className="h-4 w-4" /> },
  risk: { label: 'Risk Score', icon: <Shield className="h-4 w-4" /> },
  inspection: { label: 'Inspection', icon: <ClipboardCheck className="h-4 w-4" /> },
  return: { label: 'Overdue Return', icon: <FileText className="h-4 w-4" /> },
  fp_monitor: { label: 'F&P Monitoring', icon: <UserCheck className="h-4 w-4" /> },
};

function toSeverity(v: any): Severity {
  const s = String(v || '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'medium' || s === 'moderate') return 'medium';
  return 'low';
}

export default function AlertCenter() {
  const [sourceFilter, setSourceFilter] = useState<'all' | AlertItem['source']>('all');
  const [sevFilter, setSevFilter] = useState<'all' | Severity>('all');
  const [search, setSearch] = useState('');

  const { data: alerts = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['alert-center'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<AlertItem[]> => {
      const now = Date.now();
      const [breaches, enforcement, complaints, risk, inspections, returns, fpMonitor] =
        await Promise.all([
          // Canonical breach columns: risk_level / detected_at / metric_key / value.
          (supabase.from('v_prudential_current_breaches') as any)
            .select('id, risk_level, detected_at, acknowledged_at, metric_key, value, threshold_value')
            .is('acknowledged_at', null)
            .order('detected_at', { ascending: false })
            .limit(200),
          supabase
            .from('enforcement_actions')
            .select('id, enforcement_type, status, severity, created_at')
            .in('status', ['open', 'investigating', 'notice_issued', 'decision_pending'])
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('complaints')
            .select('id, complaint_number, subject, severity, status, created_at')
            .in('status', ['open', 'investigating', 'pending'])
            .order('created_at', { ascending: false })
            .limit(200),
          (supabase.from('entity_risk_scores') as any)
            .select('id, entity_id, band, score, computed_at')
            .eq('is_current', true)
            .in('band', ['high', 'critical'])
            .limit(200),
          supabase
            .from('inspections')
            .select('id, inspection_type, status, scheduled_date, created_at')
            .eq('status', 'scheduled')
            .lt('scheduled_date', new Date().toISOString())
            .limit(200),
          // EPR-01: overdue returns come from the canonical workflow-state view.
          supabase
            .from('v_return_filing_workflow_state')
            .select('filing_id, entity_name, definition_name, period_label, due_date, days_late, status')
            .eq('is_overdue', true)
            .order('due_date', { ascending: true })
            .limit(200),
          (supabase.from('fp_monitoring_events') as any)
            // Canonical monitoring columns: raised_at / summary.
            .select('id, individual_id, severity, event_type, raised_at, acknowledged_at, summary')
            .is('acknowledged_at', null)
            .order('raised_at', { ascending: false })
            .limit(200),
        ]);

      const items: AlertItem[] = [];

      (breaches.data || []).forEach((b: any) =>
        items.push({
          id: `breach-${b.id}`,
          source: 'breach',
          title: `Breach: ${b.metric_key || 'threshold'}`,
          detail:
            b.value != null && b.threshold_value != null
              ? `${b.value} vs ${b.threshold_value}`
              : undefined,
          severity: toSeverity(b.risk_level),
          created_at: b.detected_at,
          href: '/supervision/breaches',
        }),
      );

      (enforcement.data || []).forEach((e: any) =>
        items.push({
          id: `enf-${e.id}`,
          source: 'enforcement',
          title: `${e.enforcement_type || 'Enforcement'} — ${e.status}`,
          severity: toSeverity(e.severity || 'high'),
          created_at: e.created_at,
          href: `/enforcement/${e.id}`,
        }),
      );

      (complaints.data || []).forEach((c: any) =>
        items.push({
          id: `cmp-${c.id}`,
          source: 'complaint',
          title: c.subject || c.complaint_number || 'Complaint',
          detail: c.status,
          severity: toSeverity(c.severity),
          created_at: c.created_at,
          href: `/complaints/${c.id}`,
        }),
      );

      (risk.data || []).forEach((r: any) =>
        items.push({
          id: `risk-${r.id}`,
          source: 'risk',
          title: `Risk band ${r.band} (score ${r.score})`,
          severity: r.band === 'critical' ? 'critical' : 'high',
          created_at: r.computed_at,
          href: '/supervision/risk',
        }),
      );

      (inspections.data || []).forEach((i: any) => {
        const daysOver = Math.floor(
          (now - new Date(i.scheduled_date).getTime()) / (1000 * 60 * 60 * 24),
        );
        items.push({
          id: `insp-${i.id}`,
          source: 'inspection',
          title: `Overdue inspection (${i.inspection_type || 'general'})`,
          detail: `${daysOver} day(s) overdue`,
          severity: daysOver > 14 ? 'critical' : daysOver > 7 ? 'high' : 'medium',
          created_at: i.scheduled_date,
          href: `/inspections/${i.id}`,
        });
      });

      (returns.data || []).forEach((r: any) => {
        const daysOver = Number(
          r.days_late ?? Math.floor((now - new Date(r.due_date).getTime()) / (1000 * 60 * 60 * 24)),
        );
        items.push({
          id: `ret-${r.filing_id}`,
          source: 'return',
          title: 'Overdue return',
          detail: `${r.entity_name ?? 'Entity'} — ${r.definition_name ?? 'Return'} ${r.period_label ?? ''} · ${daysOver} day(s) past due`,
          severity: daysOver > 30 ? 'critical' : daysOver > 14 ? 'high' : 'medium',
          created_at: r.due_date,
          href: objectRoute.returnFiling(r.filing_id),
        });
      });

      (fpMonitor.data || []).forEach((m: any) =>
        items.push({
          id: `fp-${m.id}`,
          source: 'fp_monitor',
          title: `F&P alert: ${m.event_type || 'monitoring event'}`,
          detail: m.summary || undefined,
          severity: toSeverity(m.severity),
          created_at: m.raised_at,
          href: `/fpa/individuals/${m.individual_id}`,
        }),
      );

      items.sort((a, b) => {
        const sev = SEV_ORDER[b.severity] - SEV_ORDER[a.severity];
        if (sev !== 0) return sev;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      return items;
    },
  });

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (sourceFilter !== 'all' && a.source !== sourceFilter) return false;
      if (sevFilter !== 'all' && a.severity !== sevFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !a.title.toLowerCase().includes(q) &&
          !(a.detail || '').toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [alerts, sourceFilter, sevFilter, search]);

  const counts = useMemo(() => {
    const c = { total: alerts.length, critical: 0, high: 0, medium: 0, low: 0 };
    alerts.forEach((a) => {
      c[a.severity]++;
    });
    return c;
  }, [alerts]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Alert Center</h1>
            <p className="text-sm text-muted-foreground">
              Unified supervisory alerts across breaches, enforcement, complaints, risk, inspections,
              returns and F&P monitoring. Auto-refresh every 60s.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(['total', 'critical', 'high', 'medium', 'low'] as const).map((k) => (
            <Card
              key={k}
              className={
                k === 'critical'
                  ? 'border-red-200 bg-red-50'
                  : k === 'high'
                  ? 'border-orange-200 bg-orange-50'
                  : k === 'medium'
                  ? 'border-amber-200 bg-amber-50'
                  : k === 'low'
                  ? 'border-emerald-200 bg-emerald-50'
                  : ''
              }
            >
              <CardContent className="p-4">
                <div className="text-xs uppercase text-muted-foreground">{k}</div>
                <div className="text-2xl font-bold">{counts[k]}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" /> Alerts ({filtered.length})
              </CardTitle>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-48"
                />
                <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {Object.entries(SOURCE_META).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sevFilter} onValueChange={(v) => setSevFilter(v as any)}>
                  <SelectTrigger className="h-8 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All severities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No alerts match your filters. 
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((a) => {
                  const meta = SOURCE_META[a.source];
                  return (
                    <Link
                      key={a.id}
                      to={a.href}
                      className="flex items-start gap-3 py-3 hover:bg-muted/50 px-2 -mx-2 rounded"
                    >
                      <div className="mt-0.5 text-muted-foreground">{meta.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{a.title}</span>
                          <Badge variant="outline" className={SEV_STYLE[a.severity]}>
                            {a.severity}
                          </Badge>
                          <Badge variant="secondary">{meta.label}</Badge>
                        </div>
                        {a.detail && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {a.detail}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
