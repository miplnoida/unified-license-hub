import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, User, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { logFpAction } from '@/lib/fpAudit';

// ── Badge helpers ────────────────────────────────────────────────────────────

const SEVERITY_CLASS: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

const STATUS_CLASS: Record<string, string> = {
  UNASSIGNED: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-green-100 text-green-800',
};

const OUTCOME_CLASS: Record<string, string> = {
  CLEARED: 'bg-green-100 text-green-800',
  CONFIRMED_ADVERSE: 'bg-red-100 text-red-800',
};

function isOverdue(dueDateStr: string | null | undefined): boolean {
  if (!dueDateStr) return false;
  return new Date(dueDateStr) < new Date(new Date().toDateString());
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ManualScreeningQueue() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['fp_manual_screening_tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_manual_screening_tasks')
        .select(
          '*, fp_individuals(id, full_name), fp_findings(id, title, severity, check_type, confidence_score)',
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ── Assign-to-me mutation ───────────────────────────────────────────────────

  const assignToMe = useMutation({
    mutationFn: async (taskId: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('fp_manual_screening_tasks')
        .update({ assigned_to: user.id, status: 'IN_PROGRESS' })
        .eq('id', taskId);
      if (error) throw error;
      await logFpAction('fp.manual_task.assigned', 'fp_manual_screening_task', taskId, {
        after: { assigned_to: user.id, status: 'IN_PROGRESS' },
        context: {},
      });
    },
    onSuccess: () => {
      toast.success('Task assigned to you');
      qc.invalidateQueries({ queryKey: ['fp_manual_screening_tasks'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to assign task'),
  });

  // ── Derived / filtered data ─────────────────────────────────────────────────

  const filtered = (tasks ?? []).filter((t: any) => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    const sev = t.fp_findings?.severity ?? '';
    if (severityFilter !== 'ALL' && sev !== severityFilter) return false;
    return true;
  });

  const unassignedCount = (tasks ?? []).filter((t: any) => t.status === 'UNASSIGNED').length;
  const inProgressCount = (tasks ?? []).filter((t: any) => t.status === 'IN_PROGRESS').length;
  const completedCount = (tasks ?? []).filter((t: any) => t.status === 'COMPLETED').length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Manual Screening Queue"
          description="Tasks requiring human review of adverse-finding hits from automated screening runs."
        />

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Unassigned</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{isLoading ? '—' : unassignedCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{isLoading ? '—' : inProgressCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{isLoading ? '—' : completedCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter toolbar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Status:</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Severity:</span>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(statusFilter !== 'ALL' || severityFilter !== 'ALL') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setStatusFilter('ALL'); setSeverityFilter('ALL'); }}
                >
                  Clear filters
                </Button>
              )}

              <span className="ml-auto text-sm text-muted-foreground">
                {isLoading ? '…' : `${filtered.length} task${filtered.length !== 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading tasks…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">No tasks match the selected filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Individual</TableHead>
                      <TableHead>Finding</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Check Type</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((task: any) => {
                      const finding = task.fp_findings ?? {};
                      const individual = task.fp_individuals ?? {};
                      const title: string = finding.title ?? '—';
                      const truncatedTitle = title.length > 60 ? title.slice(0, 57) + '…' : title;
                      const overdue = isOverdue(task.due_date);

                      return (
                        <TableRow key={task.id}>
                          {/* Individual */}
                          <TableCell className="font-medium">
                            {individual.id ? (
                              <Link
                                to={`/fpa/individuals/${individual.id}`}
                                className="text-blue-600 hover:underline text-sm"
                              >
                                {individual.full_name ?? individual.id.slice(0, 8)}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>

                          {/* Finding title */}
                          <TableCell className="text-sm max-w-xs">
                            <span title={title}>{truncatedTitle}</span>
                          </TableCell>

                          {/* Severity */}
                          <TableCell>
                            {finding.severity ? (
                              <Badge
                                variant="outline"
                                className={SEVERITY_CLASS[finding.severity] ?? 'bg-slate-100 text-slate-700'}
                              >
                                {finding.severity}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>

                          {/* Check type */}
                          <TableCell className="text-xs text-muted-foreground">
                            {finding.check_type ?? '—'}
                          </TableCell>

                          {/* Confidence */}
                          <TableCell className="text-sm">
                            {finding.confidence_score != null
                              ? `${Math.round(Number(finding.confidence_score))}%`
                              : '—'}
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={STATUS_CLASS[task.status] ?? 'bg-slate-100 text-slate-700'}
                            >
                              {task.status}
                            </Badge>
                          </TableCell>

                          {/* Assigned to */}
                          <TableCell className="text-xs font-mono">
                            {task.assigned_to
                              ? task.assigned_to.slice(0, 8)
                              : <span className="text-muted-foreground not-italic font-sans">Unassigned</span>}
                          </TableCell>

                          {/* Due date */}
                          <TableCell className={`text-sm ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                            {task.due_date
                              ? new Date(task.due_date).toLocaleDateString()
                              : '—'}
                          </TableCell>

                          {/* Outcome */}
                          <TableCell>
                            {task.outcome ? (
                              <Badge
                                variant="outline"
                                className={OUTCOME_CLASS[task.outcome] ?? 'bg-slate-100 text-slate-700'}
                              >
                                {task.outcome === 'CONFIRMED_ADVERSE' ? 'Adverse' : task.outcome}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {task.status === 'UNASSIGNED' && (
                                <Button data-rbac="fit_and_proper.edit"
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                  disabled={assignToMe.isPending}
                                  onClick={() => assignToMe.mutate(task.id)}
                                >
                                  {assignToMe.isPending && (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  )}
                                  Assign to Me
                                </Button>
                              )}
                              <Link to={`/fit-and-proper/screening-queue/${task.id}`}>
                                <Button size="sm" variant="ghost">View</Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
