/**
 * Concrete widget renderers, keyed by widget id (matches dashboardRegistry.ts).
 *
 * Each component is responsible for loading its OWN scoped metric/data using
 * the user context passed in. Scoping rules:
 *
 *   - Internal users → platform-wide queries (RLS still applies server-side).
 *   - Licensee/entity users → filter by `licenseeId` / holder.
 *   - Pre-licensee / applicant → filter by `applicant_id = userId`.
 *
 * Adding a new widget = add a new component here + an entry in
 * `dashboardRegistry.ts`. Nothing in `Dashboard.tsx` needs to change.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowUpRight, FileText, Shield, ClipboardList, AlertTriangle, Users, Settings,
  GitBranch, DollarSign, FormInput, BarChart3, Bell, Edit, ScrollText, PlusCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DashboardUserContext, DashboardWidgetDef } from '@/lib/dashboardRegistry';

interface RendererProps {
  widget: DashboardWidgetDef;
  context: DashboardUserContext;
}

/* ──────────────────────────── shared shell ─────────────────────────────── */

function MetricShell({
  widget,
  icon,
  value,
  loading,
  hint,
}: {
  widget: DashboardWidgetDef;
  icon: React.ReactNode;
  value: number | string;
  loading: boolean;
  hint?: string;
}) {
  const inner = (
    <Card className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group h-full">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">{widget.title}</p>
          <p className="text-2xl font-bold mt-1">
            {loading ? <Skeleton className="h-7 w-12" /> : value}
          </p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return widget.route ? <Link to={widget.route}>{inner}</Link> : inner;
}

/* ───────────────────────────── data hooks ──────────────────────────────── */

function useScopedCount(loader: () => Promise<number>, deps: any[] = []) {
  const [value, setValue] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader()
      .then(v => { if (alive) setValue(v); })
      .catch(() => { if (alive) setValue(0); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { value, loading };
}

/* ─────────────────────────────── widgets ───────────────────────────────── */

function PendingApplications({ widget, context }: RendererProps) {
  const { value, loading } = useScopedCount(async () => {
    const q = supabase.from('applications').select('*', { count: 'exact', head: true })
      .in('status', ['submitted', 'in_progress']);
    const { count } = await q;
    return count || 0;
  }, [context.userId]);
  return <MetricShell widget={widget} icon={<FileText className="h-5 w-5" />} value={value} loading={loading} />;
}

function ActiveLicenses({ widget, context }: RendererProps) {
  const { value, loading } = useScopedCount(async () => {
    const { count } = await supabase.from('licenses')
      .select('*', { count: 'exact', head: true }).eq('status', 'active');
    return count || 0;
  }, [context.userId]);
  return <MetricShell widget={widget} icon={<Shield className="h-5 w-5" />} value={value} loading={loading} />;
}

function ReturnsDue({ widget, context }: RendererProps) {
  const { value, loading } = useScopedCount(async () => {
    const { count } = await supabase.from('compliance_returns')
      .select('*', { count: 'exact', head: true }).in('status', ['pending', 'overdue']);
    return count || 0;
  }, [context.userId]);
  return <MetricShell widget={widget} icon={<ClipboardList className="h-5 w-5" />} value={value} loading={loading} />;
}

function Complaints({ widget, context }: RendererProps) {
  const { value, loading } = useScopedCount(async () => {
    const { count } = await supabase.from('complaints')
      .select('*', { count: 'exact', head: true })
      .in('status', ['submitted', 'under_investigation']);
    return count || 0;
  }, [context.userId]);
  return <MetricShell widget={widget} icon={<AlertTriangle className="h-5 w-5" />} value={value} loading={loading} />;
}

function UsersWidget({ widget, context }: RendererProps) {
  const { value, loading } = useScopedCount(async () => {
    const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    return count || 0;
  }, [context.userId]);
  return <MetricShell widget={widget} icon={<Users className="h-5 w-5" />} value={value} loading={loading} hint="Manage employees & web users" />;
}

function RolesWidget({ widget }: RendererProps) {
  return <MetricShell widget={widget} icon={<Shield className="h-5 w-5" />} value="Manage" loading={false} hint="Dynamic roles & permissions" />;
}

function ReportsWidget({ widget }: RendererProps) {
  return <MetricShell widget={widget} icon={<BarChart3 className="h-5 w-5" />} value="Open" loading={false} hint="Operational reports" />;
}

function FeesWidget({ widget }: RendererProps) {
  return <MetricShell widget={widget} icon={<DollarSign className="h-5 w-5" />} value="Configure" loading={false} hint="Fee rules & breakdowns" />;
}

function FormsWidget({ widget }: RendererProps) {
  return <MetricShell widget={widget} icon={<FormInput className="h-5 w-5" />} value="Builder" loading={false} hint="Templates & versions" />;
}

function WorkflowsWidget({ widget }: RendererProps) {
  return <MetricShell widget={widget} icon={<GitBranch className="h-5 w-5" />} value="Configure" loading={false} hint="Approval flows" />;
}

function SettingsAuditWidget({ widget }: RendererProps) {
  return <MetricShell widget={widget} icon={<ScrollText className="h-5 w-5" />} value="Open" loading={false} hint="Audit & system settings" />;
}

/* ───────────── licensee / entity-scoped widgets ────────────── */

function MyLicenses({ widget, context }: RendererProps) {
  const { value, loading } = useScopedCount(async () => {
    const { count } = await supabase.from('licenses')
      .select('*', { count: 'exact', head: true })
      .eq('holder_id', context.userId);
    return count || 0;
  }, [context.userId]);
  return <MetricShell widget={widget} icon={<Shield className="h-5 w-5" />} value={value} loading={loading} />;
}

function MyReturns({ widget, context }: RendererProps) {
  const { value, loading } = useScopedCount(async () => {
    const { count } = await supabase.from('compliance_returns')
      .select('*', { count: 'exact', head: true })
      .eq('submitter_id', context.userId)
      .in('status', ['pending', 'draft', 'overdue', 'resubmission_requested']);
    return count || 0;
  }, [context.userId]);
  return <MetricShell widget={widget} icon={<ClipboardList className="h-5 w-5" />} value={value} loading={loading} hint="Pending or overdue" />;
}

function MyPayments({ widget, context }: RendererProps) {
  const { value, loading } = useScopedCount(async () => {
    const { count } = await supabase.from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', context.userId);
    return count || 0;
  }, [context.userId]);
  return <MetricShell widget={widget} icon={<DollarSign className="h-5 w-5" />} value={value} loading={loading} />;
}

function MyNotifications({ widget, context }: RendererProps) {
  const { value, loading } = useScopedCount(async () => {
    const { count } = await supabase.from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', context.userId)
      .eq('read', false);
    return count || 0;
  }, [context.userId]);
  return <MetricShell widget={widget} icon={<Bell className="h-5 w-5" />} value={value} loading={loading} hint="Unread" />;
}

function NewApplicationWidget({ widget }: RendererProps) {
  return (
    <Link to={widget.route || '/applications/new'} className="md:col-span-2 lg:col-span-2">
      <Card className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group h-full bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <PlusCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-base font-semibold">{widget.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{widget.description}</p>
              </div>
            </div>
            <Button size="sm" className="pointer-events-none">Start Application</Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MyApplications({ widget, context }: RendererProps) {
  const [items, setItems] = useState<Array<{ id: string; application_number: string; license_type: string; status: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    supabase.from('applications')
      .select('id, application_number, license_type, status, created_at')
      .eq('applicant_id', context.userId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => { if (alive) setItems((data || []) as any); })
      .then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [context.userId]);

  return (
    <Card className="md:col-span-2 lg:col-span-3">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> {widget.title}
          </CardTitle>
          {widget.route && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={widget.route}>View All <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No applications yet. Start your first license application.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map(a => (
              <Link
                key={a.id}
                to={`/applications/${a.id}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/40 transition-colors"
              >
                <div>
                  <p className="font-mono text-sm font-medium">{a.application_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.license_type} · {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline" className="capitalize">{a.status.replace(/_/g, ' ')}</Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DraftApplications({ widget, context }: RendererProps) {
  const [drafts, setDrafts] = useState<Array<{ id: string; application_number: string; updated_at: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    supabase.from('applications')
      .select('id, application_number, updated_at, status')
      .eq('applicant_id', context.userId).in('status', ['draft', 'in_progress'])
      .order('updated_at', { ascending: false }).limit(5)
      .then(({ data }) => { if (alive) setDrafts((data || []) as any); })
      .then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [context.userId]);

  return (
    <Card className="md:col-span-2 lg:col-span-3 border-amber-200 dark:border-amber-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Edit className="h-4 w-4 text-amber-600" /> {widget.title}
          </CardTitle>
          {widget.route && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={widget.route}>View All <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No draft or in-progress applications yet.
          </p>
        ) : (
          <div className="space-y-2">
            {drafts.map(d => {
              const continueHref = context.isLicensee
                ? `/post-licensee/applications/${d.id}/forms`
                : `/pre-license/new?draft=${d.id}&mode=continue`;
              return (
                <Link
                  key={d.id}
                  to={continueHref}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/40 transition-colors"
                >
                  <div>
                    <p className="font-mono text-sm font-medium">{d.application_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.status === 'in_progress' ? 'In Progress' : 'Draft'} · Last modified: {new Date(d.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 pointer-events-none">
                    <Edit className="h-3 w-3" /> Continue
                  </Button>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────── exports ───────────────────────────────── */

export const WIDGET_RENDERERS: Record<string, React.FC<RendererProps>> = {
  pending_applications: PendingApplications,
  active_licenses: ActiveLicenses,
  returns_due: ReturnsDue,
  complaints: Complaints,
  users: UsersWidget,
  roles: RolesWidget,
  reports: ReportsWidget,
  fees: FeesWidget,
  forms: FormsWidget,
  workflows: WorkflowsWidget,
  settings_audit: SettingsAuditWidget,

  my_licenses: MyLicenses,
  my_returns: MyReturns,
  my_payments: MyPayments,
  my_notifications: MyNotifications,

  my_applications: MyApplications,
  draft_applications: DraftApplications,
  new_application: NewApplicationWidget,
};
