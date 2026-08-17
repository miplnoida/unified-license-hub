import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logFpAction } from '@/lib/fpAudit';
import {
  Loader2,
  Play,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Activity,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import AutoScreeningRulesTab from '@/components/fpa/AutoScreeningRulesTab';

// ─── add-config form types ────────────────────────────────────────────────────

const CHECK_TYPES = ['sanctions', 'pep', 'adverse_media', 'criminal_history', 'regulator_watchlist', 'credit_history', 'custom'] as const;
const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

interface AddConfigForm {
  key: string;
  display_label: string;
  description: string;
  check_type: string;
  provider: string;
  severity_default: string;
  sort_order: string;
  is_active: boolean;
}

const EMPTY_CONFIG_FORM: AddConfigForm = {
  key: '',
  display_label: '',
  description: '',
  check_type: '',
  provider: '',
  severity_default: 'medium',
  sort_order: '0',
  is_active: true,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function severityBadge(s: string | null) {
  if (!s) return <Badge variant="outline">—</Badge>;
  const upper = s.toUpperCase();
  if (upper === 'HIGH') return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">{upper}</Badge>;
  if (upper === 'MEDIUM') return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">{upper}</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">{upper}</Badge>;
}

function runStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Pending</Badge>;
    case 'running':
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">Running</Badge>;
    case 'completed':
      return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Completed</Badge>;
    case 'failed':
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function runTypeBadge(type: string) {
  return (
    <Badge variant="outline" className="capitalize font-medium">
      {type.replace(/_/g, ' ')}
    </Badge>
  );
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—';
  const diff = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (diff < 0) return '—';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

// ─── stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          <p className="text-xl font-semibold tabular-nums leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function FpaScreening() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // add-config dialog state
  const [addConfigOpen, setAddConfigOpen] = useState(false);
  const [addConfigForm, setAddConfigForm] = useState<AddConfigForm>(EMPTY_CONFIG_FORM);

  // run dialog state
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<any>(null);
  const [selectedIndividualId, setSelectedIndividualId] = useState<string>('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');

  // run detail dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<any>(null);

  // ── queries ────────────────────────────────────────────────────────────────

  const { data: configs, isLoading: configsLoading } = useQuery({
    queryKey: ['fp_screening_configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_screening_configs')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: individuals, isLoading: individualsLoading } = useQuery({
    queryKey: ['fp_individuals_dropdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('id, full_name, national_id')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: assessments } = useQuery({
    queryKey: ['fp_assessments_for_individual', selectedIndividualId],
    enabled: !!selectedIndividualId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, assessment_type, status, created_at')
        .eq('individual_id', selectedIndividualId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ['fp_screening_runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_screening_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      if (!rows.length) return rows;
      const indIds = [...new Set(rows.map((r) => r.individual_id).filter(Boolean))];
      const { data: inds } = await supabase
        .from('fp_individuals')
        .select('id, full_name')
        .in('id', indIds);
      const indMap = new Map((inds ?? []).map((i: any) => [i.id, i]));
      return rows.map((r) => ({ ...r, individual: indMap.get(r.individual_id) ?? null }));
    },
  });

  // ── stats ─────────────────────────────────────────────────────────────────

  const totalRuns = runs?.length ?? 0;
  const completedRuns = runs?.filter((r) => r.status === 'completed').length ?? 0;
  const withHits = runs?.filter((r) => (r.total_hits ?? 0) > 0).length ?? 0;
  const failedRuns = runs?.filter((r) => r.status === 'failed').length ?? 0;

  // ── mutations ─────────────────────────────────────────────────────────────

  const runMutation = useMutation({
    mutationFn: async ({
      configId,
      individualId,
      assessmentId,
    }: {
      configId: string;
      individualId: string;
      assessmentId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('fp-screening-run', {
        body: {
          assessment_id: assessmentId,
          run_type: 'manual',
          triggered_by: user?.id ?? null,
        },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error ?? 'Screening run failed');

      await logFpAction('fp.screening.run_triggered', 'fp_screening_run', data?.run_id ?? null, {
        after: { config_id: configId, total_checks: data?.total_checks, total_hits: data?.total_hits },
        context: { individualId, assessmentId, screeningRunId: data?.run_id },
      });

      return data as { ok: boolean; run_id: string; total_checks: number; total_hits: number };
    },
    onSuccess: async (data, variables) => {
      const hits = data?.total_hits ?? 0;
      toast.success(
        hits > 0
          ? `Screening complete — ${hits} finding${hits !== 1 ? 's' : ''} flagged`
          : 'Screening complete — no findings',
        {
          // The AI Analysis screen otherwise defaults to whichever assessment
          // across the whole system was created most recently — deep-link
          // straight to the one that was actually just screened.
          action: {
            label: 'View in AI Analysis',
            onClick: () => navigate(`/fpa/ai-analysis?assessment_id=${variables.assessmentId}`),
          },
        },
      );
      setRunDialogOpen(false);
      setSelectedIndividualId('');
      setSelectedAssessmentId('');
      setSelectedConfig(null);

      await qc.invalidateQueries({ queryKey: ['fp_screening_runs'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to run screening'),
  });

  const cancelRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await supabase
        .from('fp_screening_runs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', runId);
      if (error) throw error;

      await logFpAction('fp.screening.run_cancelled', 'fp_screening_run', runId, {
        after: { status: 'failed' },
        context: { screeningRunId: runId },
      });
    },
    onSuccess: () => {
      toast.success('Run cancelled');
      qc.invalidateQueries({ queryKey: ['fp_screening_runs'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to cancel run'),
  });

  const toggleConfigMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { authorizedAction } = await import('@/lib/rbac/authorizedAction');
      await authorizedAction('fit_and_proper_screening', 'edit', { config_id: id, is_active: isActive });
      const { error } = await supabase
        .from('fp_screening_configs')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;

    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fp_screening_configs'] });
      toast.success('Configuration updated');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to update configuration'),
  });

  const addConfigMutation = useMutation({
    mutationFn: async (form: AddConfigForm) => {
      if (!form.key.trim()) throw new Error('Key is required.');
      if (!form.display_label.trim()) throw new Error('Display label is required.');
      if (!form.check_type) throw new Error('Check type is required.');
      const sortOrder = parseInt(form.sort_order, 10);
      if (isNaN(sortOrder)) throw new Error('Sort order must be a number.');
      const { authorizedAction } = await import('@/lib/rbac/authorizedAction');
      await authorizedAction('fit_and_proper_screening', 'create', { key: form.key.trim() });
      const { error } = await supabase.from('fp_screening_configs').insert({
        key: form.key.trim(),
        display_label: form.display_label.trim(),

        description: form.description.trim() || null,
        check_type: form.check_type,
        provider: form.provider.trim() || null,
        severity_default: form.severity_default,
        sort_order: sortOrder,
        is_active: form.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Screening configuration added.');
      qc.invalidateQueries({ queryKey: ['fp_screening_configs'] });
      setAddConfigOpen(false);
      setAddConfigForm(EMPTY_CONFIG_FORM);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to add configuration.'),
  });

  const openRunDialog = useCallback((config: any) => {
    setSelectedConfig(config);
    setSelectedIndividualId('');
    setSelectedAssessmentId('');
    setRunDialogOpen(true);
  }, []);

  const handleRunSubmit = () => {
    if (!selectedConfig || !selectedIndividualId) {
      toast.error('Select an individual to run screening');
      return;
    }
    if (!selectedAssessmentId) {
      toast.error('Select an assessment to link this screening run');
      return;
    }
    runMutation.mutate({
      configId: selectedConfig.id,
      individualId: selectedIndividualId,
      assessmentId: selectedAssessmentId,
    });
  };

  // When individual changes, reset assessment
  const handleIndividualChange = (val: string) => {
    setSelectedIndividualId(val);
    setSelectedAssessmentId('');
  };

  const openRunDetail = (run: any) => {
    setSelectedRun(run);
    setDetailDialogOpen(true);
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="Screening Hub"
          description="Configure screening checks and run automated adverse media/sanctions screening — FPA-005"
        />

        <Tabs defaultValue="runs" className="space-y-5">
          <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger
              value="runs"
              className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Screening Runs
            </TabsTrigger>
            <TabsTrigger
              value="automation"
              className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Automatic Screening Execution
            </TabsTrigger>
          </TabsList>

          <TabsContent value="runs" className="space-y-5 mt-0">
            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="Total Runs"
                value={totalRuns}
                icon={Activity}
                accent="bg-slate-100 text-slate-600"
              />
              <StatCard
                label="Completed"
                value={completedRuns}
                icon={CheckCircle2}
                accent="bg-green-100 text-green-600"
              />
              <StatCard
                label="With Hits"
                value={withHits}
                icon={AlertTriangle}
                accent="bg-amber-100 text-amber-600"
              />
              <StatCard
                label="Failed"
                value={failedRuns}
                icon={XCircle}
                accent="bg-red-100 text-red-600"
              />
            </div>

            {/* Main two-panel layout */}
            <div className="flex flex-col lg:flex-row gap-4 items-start">

              {/* Left panel — Screening Configurations (~40%) */}
              <div className="w-full lg:w-[40%] space-y-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Screening Configurations</h2>
                  </div>
                  <Button data-rbac="fit_and_proper_screening.create" size="sm" variant="outline" onClick={() => setAddConfigOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Config
                  </Button>
                </div>

                {configsLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading configurations…
                  </div>
                )}

                {!configsLoading && (!configs || configs.length === 0) && (
                  <Card className="border-dashed">
                    <CardContent className="p-6 text-center text-sm text-muted-foreground">
                      No screening configurations found.
                    </CardContent>
                  </Card>
                )}

                {(configs ?? []).map((config: any) => (
                  <Card key={config.id} className="border-border/60 hover:border-border transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {config.display_label || config.key}
                          </p>
                          {config.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {config.description}
                            </p>
                          )}
                        </div>
                        <Button data-rbac="fit_and_proper_screening.edit"
                          size="sm"
                          variant="outline"
                          className="flex-shrink-0 gap-1.5 h-7 px-2.5 text-xs"
                          onClick={() => openRunDialog(config)}
                        >
                          <Play className="h-3 w-3" />
                          Run Now
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-3">
                        {config.check_type && (
                          <Badge variant="outline" className="text-xs font-medium">
                            {config.check_type.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        {/* {config.provider && (
                          <Badge variant="secondary" className="text-xs">
                            {config.provider}
                          </Badge>
                        )} */}
                        {severityBadge(config.severity_default)}

                        <div className="ml-auto">
                          <button
                            type="button"
                            disabled={toggleConfigMutation.isPending}
                            onClick={() =>
                              toggleConfigMutation.mutate({ id: config.id, isActive: !config.is_active })
                            }
                            className="focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={config.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                          >
                            {config.is_active ? (
                              <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-200 cursor-pointer">
                                Active
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-200 cursor-pointer">
                                Inactive
                              </Badge>
                            )}
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Vertical separator on desktop */}
              <Separator orientation="vertical" className="hidden lg:block self-stretch" />

              {/* Right panel — Recent Screening Runs (~60%) */}
              <div className="w-full lg:flex-1 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Recent Screening Runs</h2>
                  <span className="text-xs text-muted-foreground">(last 50)</span>
                </div>

                <Card className="border-border/60">
                  <CardContent className="p-0">
                    {runsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading runs…
                      </div>
                    ) : !runs || runs.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        No screening runs yet. Use "Run Now" on a configuration to start.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40">
                              <TableHead className="pl-4">Individual</TableHead>
                              <TableHead>Run Type</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Checks</TableHead>
                              <TableHead className="text-right">Hits</TableHead>
                              <TableHead>Started</TableHead>
                              <TableHead>Duration</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {runs.map((run: any) => {
                              const hits = run.total_hits ?? 0;

                              return (
                                <TableRow
                                  key={run.id}
                                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                                  onClick={() => openRunDetail(run)}
                                >
                                  <TableCell className="pl-4 font-medium text-sm">
                                    {run.individual?.full_name ?? (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell>{runTypeBadge(run.run_type ?? 'manual')}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1.5">
                                      {run.status === 'running' && (
                                        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                                      )}
                                      {runStatusBadge(run.status)}
                                      {run.status === 'running' && (
                                        <button
                                          type="button"
                                          title="Cancel stuck run"
                                          disabled={cancelRunMutation.isPending}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            cancelRunMutation.mutate(run.id);
                                          }}
                                          className="ml-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                                        >
                                          <XCircle className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {run.total_checks != null ? run.total_checks : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm">
                                    {hits > 0 ? (
                                      <span className="font-semibold text-red-600">{hits}</span>
                                    ) : run.total_hits != null ? (
                                      <span className="text-muted-foreground">0</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {formatRelative(run.started_at)}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                                    {run.status === 'running' ? (
                                      <span className="text-blue-500 flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Running…
                                      </span>
                                    ) : (
                                      formatDuration(run.started_at, run.completed_at)
                                    )}
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
            </div>
          </TabsContent>

          <TabsContent value="automation" className="mt-0">
            <AutoScreeningRulesTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Config dialog */}
      <Dialog open={addConfigOpen} onOpenChange={(open) => { setAddConfigOpen(open); if (!open) setAddConfigForm(EMPTY_CONFIG_FORM); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              Add Screening Configuration
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Key <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. sanctions_ofac"
                  value={addConfigForm.key}
                  onChange={(e) => setAddConfigForm((f) => ({ ...f, key: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Unique identifier (no spaces)</p>
              </div>
              <div className="space-y-1.5">
                <Label>Display Label <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. OFAC Sanctions Check"
                  value={addConfigForm.display_label}
                  onChange={(e) => setAddConfigForm((f) => ({ ...f, display_label: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of this screening check…"
                rows={2}
                value={addConfigForm.description}
                onChange={(e) => setAddConfigForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Check Type <span className="text-red-500">*</span></Label>
                <Select value={addConfigForm.check_type} onValueChange={(v) => setAddConfigForm((f) => ({ ...f, check_type: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHECK_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity Default <span className="text-red-500">*</span></Label>
                <Select value={addConfigForm.severity_default} onValueChange={(v) => setAddConfigForm((f) => ({ ...f, severity_default: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_LEVELS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Input
                  placeholder="e.g. internal_rules"
                  value={addConfigForm.provider}
                  onChange={(e) => setAddConfigForm((f) => ({ ...f, provider: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  min={0}
                  value={addConfigForm.sort_order}
                  onChange={(e) => setAddConfigForm((f) => ({ ...f, sort_order: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="config-active"
                checked={addConfigForm.is_active}
                onCheckedChange={(v) => setAddConfigForm((f) => ({ ...f, is_active: v }))}
              />
              <Label htmlFor="config-active" className="cursor-pointer">
                Active (available for screening runs)
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setAddConfigOpen(false); setAddConfigForm(EMPTY_CONFIG_FORM); }} disabled={addConfigMutation.isPending}>
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper_screening.create"
              onClick={() => addConfigMutation.mutate(addConfigForm)}
              disabled={addConfigMutation.isPending || !addConfigForm.key.trim() || !addConfigForm.display_label.trim() || !addConfigForm.check_type}
            >
              {addConfigMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run screening dialog */}
      <Dialog open={runDialogOpen} onOpenChange={(open) => {
        setRunDialogOpen(open);
        if (!open) {
          setSelectedConfig(null);
          setSelectedIndividualId('');
          setSelectedAssessmentId('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-4 w-4 text-primary" />
              Run Screening
              {selectedConfig && (
                <span className="text-muted-foreground font-normal text-sm">
                  — {selectedConfig.display_label || selectedConfig.key}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedConfig && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              {selectedConfig.check_type && (
                <Badge variant="outline" className="text-xs">
                  {selectedConfig.check_type.replace(/_/g, ' ')}
                </Badge>
              )}
              {/* {selectedConfig.provider && (
                <Badge variant="secondary" className="text-xs">
                  {selectedConfig.provider}
                </Badge>
              )} */}
              {severityBadge(selectedConfig.severity_default)}
            </div>
          )}

          <Separator />

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="individual-select">
                Individual <span className="text-red-500">*</span>
              </Label>
              {individualsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading individuals…
                </div>
              ) : (
                <Select value={selectedIndividualId} onValueChange={handleIndividualChange}>
                  <SelectTrigger id="individual-select">
                    <SelectValue placeholder="Select individual to screen" />
                  </SelectTrigger>
                  <SelectContent>
                    {(individuals ?? []).length === 0 && (
                      <SelectItem value="__none__" disabled>
                        No individuals found
                      </SelectItem>
                    )}
                    {(individuals ?? []).map((ind: any) => (
                      <SelectItem key={ind.id} value={ind.id}>
                        {ind.full_name}
                        {ind.national_id && (
                          <span className="text-muted-foreground ml-1 text-xs">
                            ({ind.national_id})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assessment-select">
                Assessment <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedAssessmentId}
                onValueChange={setSelectedAssessmentId}
                disabled={!selectedIndividualId}
              >
                <SelectTrigger id="assessment-select">
                  <SelectValue
                    placeholder={
                      selectedIndividualId
                        ? 'Select an assessment'
                        : 'Select individual first'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(assessments ?? []).length === 0 && selectedIndividualId && (
                    <SelectItem value="__none__" disabled>
                      No assessments for this individual
                    </SelectItem>
                  )}
                  {(assessments ?? []).map((a: any, idx: number, arr: any[]) => {
                    const d = new Date(a.created_at);
                    const dateStr = d.toLocaleDateString();
                    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    // detect if another assessment has same type+status+date → show time to distinguish
                    const hasDuplicate = arr.some(
                      (b) =>
                        b.id !== a.id &&
                        b.assessment_type === a.assessment_type &&
                        b.status === a.status &&
                        new Date(b.created_at).toLocaleDateString() === dateStr,
                    );
                    const shortId = a.id.slice(-6).toUpperCase();
                    return (
                      <SelectItem key={a.id} value={a.id}>
                        {a.assessment_type ?? 'Assessment'}{' '}
                        <span className="text-muted-foreground text-xs">
                          — {a.status} · {dateStr}
                          {hasDuplicate && <>, {timeStr} <span className="opacity-50">#{shortId}</span></>}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {!selectedIndividualId && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2.5">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                Select an individual to proceed with screening.
              </div>
            )}

            {selectedIndividualId && !selectedAssessmentId && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2.5">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                An assessment must be selected — assessment_id is required to create a screening run.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setRunDialogOpen(false)}
              disabled={runMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRunSubmit}
              disabled={runMutation.isPending || !selectedIndividualId || !selectedAssessmentId}
              className="gap-2"
            >
              {runMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Screening
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run detail dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => {
        setDetailDialogOpen(open);
        if (!open) setSelectedRun(null);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Screening Run Details
            </DialogTitle>
          </DialogHeader>

          {selectedRun && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Individual</p>
                  <p className="font-medium">{selectedRun.individual?.full_name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Status</p>
                  {runStatusBadge(selectedRun.status)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Run Type</p>
                  {runTypeBadge(selectedRun.run_type ?? 'manual')}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Assessment ID</p>
                  <p className="font-mono text-xs truncate">{selectedRun.assessment_id ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Total Checks</p>
                  <p className="tabular-nums">{selectedRun.total_checks ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Total Hits</p>
                  <p className={`tabular-nums font-semibold ${(selectedRun.total_hits ?? 0) > 0 ? 'text-red-600' : ''}`}>
                    {selectedRun.total_hits ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Started</p>
                  <p>{formatRelative(selectedRun.started_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Duration</p>
                  <p>{formatDuration(selectedRun.started_at, selectedRun.completed_at)}</p>
                </div>
              </div>

              {selectedRun.error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">Error</p>
                  <p className="text-xs text-red-600">{selectedRun.error}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
