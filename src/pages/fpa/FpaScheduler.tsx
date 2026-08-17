import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, PlayCircle, Download, CalendarClock, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import { logFpAction } from '@/lib/fpAudit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IndividualRole {
  id: string;
  role_type: string | null;
  role_title: string | null;
  next_reassessment_due: string | null;
  reassessment_cycle_months: number | null;
  is_current: boolean;
  individual_id: string;
  fp_individuals: { id: string; full_name: string } | null;
}

interface CycleAssessment {
  id: string;
  assessment_type: string;
  status: string;
  created_at: string;
  fp_individuals: { id: string; full_name: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AssessmentStatus =
  | 'draft'
  | 'submitted'
  | 'screening'
  | 'awaiting_committee'
  | 'determined'
  | 'closed';

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-800',
  screening: 'bg-amber-100 text-amber-800',
  awaiting_committee: 'bg-purple-100 text-purple-800',
  determined: 'bg-green-100 text-green-800',
  closed: 'bg-slate-100 text-slate-700',
};

function formatType(t: string): string {
  if (!t) return '';
  return t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function dueDateClass(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 7) return 'text-red-600 font-semibold';
  if (days < 30) return 'text-amber-600 font-medium';
  return 'text-green-700';
}

function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function sixtyDaysFromNow(): string {
  return new Date(Date.now() + 60 * 86400 * 1000).toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function exportUpcomingCsv(rows: IndividualRole[]) {
  const headers = ['Individual', 'Role', 'Cycle (months)', 'Due Date', 'Days Until Due'];
  const lines = rows.map(r =>
    [
      (r.fp_individuals as any)?.full_name ?? '',
      r.role_title || r.role_type || '',
      r.reassessment_cycle_months ?? '',
      r.next_reassessment_due ? new Date(r.next_reassessment_due).toLocaleDateString() : '',
      r.next_reassessment_due ? daysUntil(r.next_reassessment_due) : '',
    ]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [headers.join(','), ...lines].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'fp-upcoming-cycles.csv';
  a.click();
}

// ---------------------------------------------------------------------------
// Stat card sub-component
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  loading?: boolean;
  colorClass?: string;
}

function StatCard({ icon, label, value, loading, colorClass = '' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`p-3 rounded-lg bg-muted ${colorClass}`}>{icon}</div>
        <div>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
          )}
          <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FpaScheduler() {
  const [schedulerLoading, setSchedulerLoading] = useState(false);

  const today = todayIso();
  const sixty = sixtyDaysFromNow();
  const monthStart = startOfMonth();

  // All current roles with a reassessment date — used for stat computation
  const { data: allCurrentRoles = [], isLoading: rolesLoading } = useQuery<IndividualRole[]>({
    queryKey: ['fp_scheduler_all_roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individual_roles')
        .select('id, role_type, role_title, next_reassessment_due, reassessment_cycle_months, is_current, individual_id, fp_individuals(id, full_name)')
        .eq('is_current', true)
        .not('next_reassessment_due', 'is', null);
      if (error) throw error;
      return (data ?? []) as unknown as IndividualRole[];
    },
  });

  // Upcoming 60-day roles (ordered, limited)
  const { data: upcomingRoles = [], isLoading: upcomingLoading } = useQuery<IndividualRole[]>({
    queryKey: ['fp_scheduler_upcoming', sixty],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individual_roles')
        .select('id, role_type, role_title, next_reassessment_due, reassessment_cycle_months, is_current, individual_id, fp_individuals(id, full_name)')
        .eq('is_current', true)
        .not('next_reassessment_due', 'is', null)
        .lte('next_reassessment_due', sixty)
        .order('next_reassessment_due', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as IndividualRole[];
    },
  });

  // Recent cycle assessments
  const { data: recentCycles = [], isLoading: cyclesLoading } = useQuery<CycleAssessment[]>({
    queryKey: ['fp_scheduler_recent_cycles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, assessment_type, status, created_at, fp_individuals(id, full_name)')
        .eq('assessment_type', 'cycle')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as CycleAssessment[];
    },
  });

  // This month's cycle assessments count
  const { data: thisMonthCount = 0, isLoading: monthLoading } = useQuery<number>({
    queryKey: ['fp_scheduler_month_count', monthStart],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('fp_assessments')
        .select('id', { count: 'exact', head: true })
        .eq('assessment_type', 'cycle')
        .gte('created_at', monthStart);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Compute stats from allCurrentRoles
  const { dueWithin60, overdue } = useMemo(() => {
    let dueWithin60 = 0;
    let overdue = 0;
    for (const r of allCurrentRoles) {
      if (!r.next_reassessment_due) continue;
      const due = r.next_reassessment_due.slice(0, 10);
      if (due < today) {
        overdue++;
      } else if (due <= sixty) {
        dueWithin60++;
      }
    }
    return { dueWithin60, overdue };
  }, [allCurrentRoles, today, sixty]);

  const runScheduler = async () => {
    setSchedulerLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fp-cycle-scheduler', { body: {} });
      if (error) throw error;
      const opened = data?.opened ?? 0;
      const evaluated = data?.evaluated ?? 0;
      const due = data?.due ?? 0;

      await logFpAction('fp.scheduler.manual_run', 'fp_cycle_scheduler', null, {
        after: { opened, evaluated, due },
      });

      toast.success(
        `Cycle scheduler ran — ${opened} assessment(s) opened, ${evaluated} evaluated, ${due} due`
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to run cycle scheduler');
    } finally {
      setSchedulerLoading(false);
    }
  };

  const statsLoading = rolesLoading || monthLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="FP Cycle Scheduler"
          description="Monitor upcoming reassessment cycles, overdue roles, and run the cycle scheduler to open new assessments automatically."
          backHref="/fpa/individuals"
          backLabel="Register"
          actions={
            <Button data-rbac="fit_and_proper.configure" size="sm" onClick={runScheduler} disabled={schedulerLoading}>
              {schedulerLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Run Cycle Scheduler
            </Button>
          }
        />

        {/* Stats bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<CalendarClock className="h-5 w-5 text-amber-600" />}
            label="Due within 60 days"
            value={dueWithin60}
            loading={statsLoading}
            colorClass="text-amber-600"
          />
          <StatCard
            icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
            label="Overdue"
            value={overdue}
            loading={statsLoading}
            colorClass="text-red-600"
          />
          <StatCard
            icon={<RefreshCw className="h-5 w-5 text-blue-600" />}
            label="Cycle assessments this month"
            value={thisMonthCount}
            loading={monthLoading}
            colorClass="text-blue-600"
          />
        </div>

        {/* Upcoming cycle assessments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <CardTitle className="text-base">Upcoming cycle assessments (next 60 days)</CardTitle>
            <Button data-rbac="fit_and_proper.export"
              size="sm"
              variant="outline"
              onClick={async () => { try { await authorizedExport('fit_and_proper', 'export', { count: upcomingRoles.length }); exportUpcomingCsv(upcomingRoles); } catch (e: any) { toast.error(e?.message ?? 'Not authorized'); } }}
              disabled={upcomingRoles.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {upcomingLoading ? (
              <div className="py-10 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 inline animate-spin mr-2" />
                Loading upcoming roles…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Individual</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Cycle (months)</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Days Until Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingRoles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No roles due within 60 days.
                        </TableCell>
                      </TableRow>
                    ) : (
                      upcomingRoles.map(role => {
                        const days = role.next_reassessment_due
                          ? daysUntil(role.next_reassessment_due)
                          : null;
                        return (
                          <TableRow key={role.id}>
                            <TableCell className="font-medium">
                              {role.fp_individuals ? (
                                <Link
                                  to={`/fpa/individuals/${role.fp_individuals.id}`}
                                  className="text-primary underline-offset-4 hover:underline"
                                >
                                  {role.fp_individuals.full_name}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground italic">Unknown</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {role.role_title || formatType(role.role_type ?? '') || '—'}
                            </TableCell>
                            <TableCell>{role.reassessment_cycle_months ?? '—'}</TableCell>
                            <TableCell
                              className={
                                role.next_reassessment_due
                                  ? dueDateClass(role.next_reassessment_due)
                                  : ''
                              }
                            >
                              {fmtDate(role.next_reassessment_due)}
                            </TableCell>
                            <TableCell
                              className={
                                role.next_reassessment_due
                                  ? dueDateClass(role.next_reassessment_due)
                                  : 'text-muted-foreground'
                              }
                            >
                              {days !== null ? (days === 0 ? 'Today' : `${days} days`) : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent cycle assessments */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">Recent cycle assessments</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {cyclesLoading ? (
              <div className="py-10 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 inline animate-spin mr-2" />
                Loading recent cycles…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Individual</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentCycles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          No cycle assessments found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentCycles.map(assessment => (
                        <TableRow key={assessment.id}>
                          <TableCell className="font-medium">
                            <Link
                              to={`/fpa/assessments/${assessment.id}`}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              {assessment.fp_individuals?.full_name ?? (
                                <span className="text-muted-foreground italic">Unknown</span>
                              )}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`text-xs font-medium ${STATUS_CLASS[assessment.status] ?? 'bg-slate-100 text-slate-700'}`}
                              variant="outline"
                            >
                              {formatType(assessment.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{fmtDate(assessment.created_at)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
