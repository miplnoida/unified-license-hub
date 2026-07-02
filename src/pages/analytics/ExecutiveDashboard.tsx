import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2,
  FileText,
  Award,
  AlertTriangle,
  Gavel,
  ClipboardCheck,
  MessageSquare,
  Shield,
  UserCheck,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useMemo } from 'react';

type Band = 'low' | 'medium' | 'high' | 'critical';
const BAND_COLOR: Record<Band, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

function KpiCard({
  label,
  value,
  sub,
  icon,
  href,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  href?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-200 bg-red-50'
      : tone === 'warning'
      ? 'border-amber-200 bg-amber-50'
      : tone === 'success'
      ? 'border-emerald-200 bg-emerald-50'
      : 'bg-card';
  const inner = (
    <Card className={`${toneClass} transition hover:shadow-md`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}

export default function ExecutiveDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['executive-dashboard'],
    queryFn: async () => {
      const now = new Date();
      const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        apps,
        licenses,
        breaches,
        enforcement,
        inspections,
        complaints,
        fpInd,
        risk,
        returnsFiled,
      ] = await Promise.all([
        supabase.from('applications').select('id, status, created_at', { count: 'exact' }),
        supabase.from('licenses').select('id, status', { count: 'exact' }),
        (supabase.from('return_threshold_breaches') as any).select(
          'id, acknowledged_at, severity, created_at',
        ),
        supabase.from('enforcement_actions').select('id, status, penalty_amount, penalty_paid_amount, created_at'),
        supabase.from('inspections').select('id, status, scheduled_date'),
        supabase.from('complaints').select('id, status, severity, created_at, resolved_at'),
        (supabase.from('fp_individuals') as any).select('id, status'),
        (supabase.from('entity_risk_scores') as any)
          .select('band, score, entity_id')
          .eq('is_current', true),
        supabase.from('returns_filed').select('id, status, submitted_at, created_at').gte('created_at', thirtyAgo),
      ]);

      return {
        apps: apps.data || [],
        appsCount: apps.count || 0,
        licenses: licenses.data || [],
        licensesCount: licenses.count || 0,
        breaches: (breaches.data || []) as any[],
        enforcement: enforcement.data || [],
        inspections: inspections.data || [],
        complaints: complaints.data || [],
        fpInd: (fpInd.data || []) as any[],
        risk: (risk.data || []) as any[],
        returnsFiled: returnsFiled.data || [],
      };
    },
    refetchInterval: 60_000,
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const openApps = data.apps.filter((a: any) =>
      ['submitted', 'under_review', 'rfi_raised', 'assigned'].includes(a.status),
    ).length;
    const activeLicenses = data.licenses.filter((l: any) => l.status === 'active').length;
    const openBreaches = data.breaches.filter((b: any) => !b.acknowledged_at).length;
    const openEnforcement = data.enforcement.filter((e: any) =>
      ['open', 'investigating', 'notice_issued', 'decision_pending'].includes(e.status),
    ).length;
    const totalPenalty = data.enforcement.reduce(
      (sum: number, e: any) => sum + Number(e.penalty_amount || 0),
      0,
    );
    const collectedPenalty = data.enforcement.reduce(
      (sum: number, e: any) => sum + Number(e.penalty_paid_amount || 0),
      0,
    );
    const upcomingInspections = data.inspections.filter(
      (i: any) => i.status === 'scheduled' && i.scheduled_date && new Date(i.scheduled_date) >= new Date(),
    ).length;
    const openComplaints = data.complaints.filter((c: any) =>
      ['open', 'investigating', 'pending'].includes(c.status),
    ).length;
    const fpActive = data.fpInd.filter((f: any) => f.status === 'active').length;
    const criticalRisk = data.risk.filter((r: any) => r.band === 'critical').length;
    const highRisk = data.risk.filter((r: any) => r.band === 'high').length;

    const bandCounts: Record<Band, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    data.risk.forEach((r: any) => {
      if (r.band in bandCounts) bandCounts[r.band as Band]++;
    });

    // Application status distribution
    const appStatusCounts: Record<string, number> = {};
    data.apps.forEach((a: any) => {
      appStatusCounts[a.status] = (appStatusCounts[a.status] || 0) + 1;
    });

    return {
      openApps,
      activeLicenses,
      openBreaches,
      openEnforcement,
      totalPenalty,
      collectedPenalty,
      upcomingInspections,
      openComplaints,
      fpActive,
      criticalRisk,
      highRisk,
      bandCounts,
      appStatusCounts,
    };
  }, [data]);

  if (isLoading || !data || !stats) {
    return (
      <DashboardLayout>
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const bandData = (Object.entries(stats.bandCounts) as [Band, number][]).map(([band, count]) => ({
    band: band.charAt(0).toUpperCase() + band.slice(1),
    count,
    color: BAND_COLOR[band],
  }));

  const appStatusData = Object.entries(stats.appStatusCounts)
    .map(([status, count]) => ({ status: status.replace(/_/g, ' '), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const currency = (v: number) =>
    v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Executive Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Cross-module supervisory intelligence • auto-refreshes every 60s
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <TrendingUp className="h-3 w-3" /> Live
          </Badge>
        </div>

        {/* Top KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <KpiCard
            label="Open Applications"
            value={stats.openApps}
            sub={`${data.appsCount} total`}
            icon={<FileText className="h-4 w-4" />}
            href="/admin/applications"
          />
          <KpiCard
            label="Active Licenses"
            value={stats.activeLicenses}
            sub={`${data.licensesCount} issued`}
            icon={<Award className="h-4 w-4" />}
            href="/licenses"
            tone="success"
          />
          <KpiCard
            label="Open Breaches"
            value={stats.openBreaches}
            icon={<AlertTriangle className="h-4 w-4" />}
            href="/supervision/breaches"
            tone={stats.openBreaches > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Open Enforcement"
            value={stats.openEnforcement}
            sub={`${currency(stats.collectedPenalty)} / ${currency(stats.totalPenalty)}`}
            icon={<Gavel className="h-4 w-4" />}
            href="/enforcement"
            tone={stats.openEnforcement > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="Critical Risk"
            value={stats.criticalRisk}
            sub={`${stats.highRisk} high risk`}
            icon={<Shield className="h-4 w-4" />}
            href="/supervision/risk"
            tone={stats.criticalRisk > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="Upcoming Inspections"
            value={stats.upcomingInspections}
            icon={<ClipboardCheck className="h-4 w-4" />}
            href="/inspections"
          />
          <KpiCard
            label="Open Complaints"
            value={stats.openComplaints}
            icon={<MessageSquare className="h-4 w-4" />}
            href="/complaints"
            tone={stats.openComplaints > 0 ? 'warning' : 'default'}
          />
          <KpiCard
            label="F&P Active"
            value={stats.fpActive}
            icon={<UserCheck className="h-4 w-4" />}
            href="/fit-and-proper"
          />
          <KpiCard
            label="Returns (30d)"
            value={data.returnsFiled.length}
            sub={`${data.returnsFiled.filter((r: any) => r.submitted_at).length} submitted`}
            icon={<FileText className="h-4 w-4" />}
            href="/returns-mgmt"
          />
          <KpiCard
            label="Penalty Recovery"
            value={
              stats.totalPenalty > 0
                ? `${Math.round((stats.collectedPenalty / stats.totalPenalty) * 100)}%`
                : '—'
            }
            sub={currency(stats.totalPenalty - stats.collectedPenalty) + ' outstanding'}
            icon={<Gavel className="h-4 w-4" />}
            href="/billing/penalties"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Risk Band Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {bandData.every((b) => b.count === 0) ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No risk scores computed yet.{' '}
                  <Link className="text-primary ml-1 underline" to="/supervision/risk">
                    Recompute
                  </Link>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={bandData}
                      dataKey="count"
                      nameKey="band"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label
                    >
                      {bandData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Application Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              {appStatusData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No applications yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={appStatusData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#1E3A8A" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/supervision/breaches">Breach Inbox</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/enforcement">Enforcement Queue</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/supervision/risk">Risk Heatmap</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/supervision/plans">Supervisory Plans</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/inspections">Inspections</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/complaints/analytics">Complaints Analytics</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
