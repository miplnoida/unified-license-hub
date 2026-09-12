/**
 * MC-10 — Supervisory attention register.
 *
 * The single operational entry point for the conduct supervisory loop: what has
 * been raised for attention, how the deterministic calculation ranked it, what a
 * supervisor confirmed, what plan and intervention response exists, and where
 * coverage is missing. Everything shown is a recorded fact; nothing on this page
 * ranks, plans or decides anything.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, ClipboardList, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/useCan';
import { formatDate } from '@/lib/datetime';
import {
  ATTENTION_SOURCE_LABEL, ATTENTION_STATUS_LABEL, MATERIALITY_LABEL, PLAN_STATUS_LABEL,
  PRIORITY_BAND_LABEL, URGENCY_LABEL, attentionErrorMessage,
  useAttentionRegister, useCreateAttention, usePlanningCoverage,
  type AttentionStatus, type PlanStatus, type PriorityBand,
} from '@/hooks/useConductAttention';

const PRIORITY_VARIANT: Record<PriorityBand, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  IMMEDIATE: 'destructive', HIGH: 'destructive', PLANNED: 'default', MONITOR: 'secondary',
};

const STATUS_VARIANT: Record<AttentionStatus, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  OPEN: 'outline', PRIORITISED: 'default', PLANNED: 'default',
  IN_PROGRESS: 'default', MONITORING: 'secondary', CLOSED: 'secondary',
};

const PLAN_VARIANT: Record<PlanStatus, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  DRAFT: 'outline', SUBMITTED: 'default', APPROVED: 'default',
  ACTIVE: 'default', COMPLETED: 'secondary', CANCELLED: 'secondary',
};

const SOURCE_OPTIONS = Object.keys(ATTENTION_SOURCE_LABEL);

function GapList({ title, description, rows, onOpen }: {
  title: string;
  description: string;
  rows: Array<{ id: string; reference: string; title?: string | null }>;
  onOpen?: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing outstanding.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <span className="font-mono text-xs">{r.reference}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{r.title ?? ''}</span>
                {onOpen && (
                  <Button size="sm" variant="ghost" onClick={() => onOpen(r.id)}>Open</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function SupervisoryAttentionRegister() {
  const navigate = useNavigate();
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canOperatePrimary = useCan('market_conduct', 'run_conduct_analytics');
  const canOperateAlternate = useCan('market_conduct', 'manage_complaints');
  const canOperate = canOperatePrimary || canOperateAlternate;
  const [status, setStatus] = useState<string>('all');
  const [priority, setPriority] = useState<string>('all');
  const [search, setSearch] = useState('');

  const register = useAttentionRegister(
    status === 'all' ? null : status,
    priority === 'all' ? null : priority,
  );
  const coverage = usePlanningCoverage();
  const create = useCreateAttention();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState('other');
  const [basis, setBasis] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [materiality, setMateriality] = useState('medium');
  const [urgency, setUrgency] = useState('routine');
  const [reviewDate, setReviewDate] = useState('');

  const items = useMemo(() => {
    const rows = register.data?.attention_items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.title.toLowerCase().includes(q) ||
      r.reference.toLowerCase().includes(q) ||
      (r.theme ?? '').toLowerCase().includes(q));
  }, [register.data, search]);

  const plans = register.data?.plans ?? [];

  const submit = async () => {
    try {
      const result = await create.mutateAsync({
        title: title.trim(),
        sourceType,
        sourceModule: 'market_conduct',
        supervisoryBasis: basis.trim(),
        sourceReference: sourceReference.trim() || null,
        materiality,
        urgency,
        targetReviewDate: reviewDate || null,
      });
      toast.success(`Supervisory attention ${result.reference} recorded.`);
      setOpen(false);
      setTitle(''); setBasis(''); setSourceReference(''); setReviewDate('');
      navigate(`/conduct/attention/${result.id}`);
    } catch (e) {
      toast.error(attentionErrorMessage(String((e as Error)?.message ?? '')));
    }
  };

  const gaps = coverage.data?.gaps;
  const overview = coverage.data?.overview;


  return (
    <DashboardLayout>
      <PageHeader
        title="Supervisory attention"
        description="What has been raised for supervisory attention, how it was prioritised, and the planned response."
        actions={canOperate ? (
          <Button data-rbac="market_conduct.manage_complaints" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Raise attention item
          </Button>
        ) : undefined}
      />

      <Alert className="mb-4">
        <ClipboardList className="h-4 w-4" />
        <AlertTitle className="text-sm">Recorded facts only</AlertTitle>
        <AlertDescription className="text-xs">
          Priority is calculated from recorded supervisory facts and only takes effect once a supervisor confirms it,
          with a rationale. No ranking on this page is produced by AI.
        </AlertDescription>
      </Alert>

      {register.isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            The supervisory attention register could not be loaded.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="attention">
        <TabsList>
          <TabsTrigger value="attention">Attention items ({items.length})</TabsTrigger>
          <TabsTrigger value="plans">Supervisory plans ({plans.length})</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="attention" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="attention-search" className="text-xs">Search</Label>
              <Input
                id="attention-search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Reference, title or theme"
              />
            </div>
            <div className="w-48">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.entries(ATTENTION_STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {Object.entries(PRIORITY_BAND_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {register.isLoading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : items.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No supervisory attention items match this view.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Matter</TableHead>
                        <TableHead>Raised from</TableHead>
                        <TableHead>Calculated</TableHead>
                        <TableHead>Confirmed</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Response</TableHead>
                        <TableHead>Next review</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/conduct/attention/${row.id}`)}
                        >
                          <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                          <TableCell>
                            <p className="font-medium">{row.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.sector_name ?? 'Sector not recorded'}
                              {row.theme ? ` · ${row.theme}` : ''}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs">
                            {ATTENTION_SOURCE_LABEL[row.source_type] ?? row.source_type}
                            {row.source_reference && (
                              <span className="block font-mono text-[11px] text-muted-foreground">
                                {row.source_reference}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.calculated_priority ? (
                              <Badge variant={PRIORITY_VARIANT[row.calculated_priority]}>
                                {PRIORITY_BAND_LABEL[row.calculated_priority]}
                              </Badge>
                            ) : <span className="text-xs text-muted-foreground">Not calculated</span>}
                          </TableCell>
                          <TableCell>
                            {row.confirmed_priority ? (
                              <div className="space-y-1">
                                <Badge variant={PRIORITY_VARIANT[row.confirmed_priority]}>
                                  {PRIORITY_BAND_LABEL[row.confirmed_priority]}
                                </Badge>
                                {row.priority_overridden && (
                                  <span className="block text-[11px] text-muted-foreground">
                                    Supervisor override
                                  </span>
                                )}
                              </div>
                            ) : <span className="text-xs text-muted-foreground">Awaiting supervisor</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[row.status]}>
                              {ATTENTION_STATUS_LABEL[row.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.plan_count} plan{row.plan_count === 1 ? '' : 's'} ·{' '}
                            {row.intervention_count} intervention{row.intervention_count === 1 ? '' : 's'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.target_review_date ? formatDate(row.target_review_date) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans">
          <Card>
            <CardContent className="p-0">
              {plans.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No supervisory plans have been recorded for the sectors in your remit.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Raised from</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Open milestones</TableHead>
                        <TableHead>Interventions</TableHead>
                        <TableHead>Target completion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plans.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/conduct/plans/${row.id}`)}
                        >
                          <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                          <TableCell>
                            <p className="font-medium">{row.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.sector_name ?? 'Sector not recorded'}
                              {row.period_label ? ` · ${row.period_label}` : ''}
                            </p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.attention_reference ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={PLAN_VARIANT[row.status]}>{PLAN_STATUS_LABEL[row.status]}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{row.milestone_open}</TableCell>
                          <TableCell className="text-xs">{row.intervention_count}</TableCell>
                          <TableCell className="text-xs">
                            {row.target_completion ? formatDate(row.target_completion) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coverage" className="space-y-4">
          {coverage.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !gaps ? (
            <p className="text-sm text-muted-foreground">Coverage information is unavailable.</p>
          ) : (
            <>
              {overview && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Where supervisory effort currently sits</CardTitle>
                    <CardDescription>{coverage.data?.caveat}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      ['Open attention', overview.attention_open],
                      ['Plans awaiting approval', overview.plans_awaiting_approval],
                      ['Plans in progress', overview.active_plans],
                      ['Interventions in progress', overview.active_interventions],
                      ['Interventions completed', overview.completed_interventions],
                      ['Entities covered', overview.entities_covered],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                        <p className="font-mono text-2xl">{Number(value ?? 0)}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <GapList
                  title="High priority without a plan"
                  description="Confirmed immediate or high priority with no supervisory plan recorded."
                  rows={gaps.high_priority_without_plan ?? []}
                  onOpen={(id) => navigate(`/conduct/attention/${id}`)}
                />
                <GapList
                  title="Plans awaiting approval"
                  description="Submitted plans that still need a second supervisor's decision."
                  rows={gaps.plans_awaiting_approval ?? []}
                  onOpen={(id) => navigate(`/conduct/plans/${id}`)}
                />
                <GapList
                  title="Approved plans without an intervention"
                  description="Plans approved or active with nothing yet initiated under them."
                  rows={gaps.approved_plan_without_intervention ?? []}
                  onOpen={(id) => navigate(`/conduct/plans/${id}`)}
                />
                <GapList
                  title="Overdue interventions"
                  description="In progress past their planned end date."
                  rows={gaps.overdue_intervention ?? []}
                  onOpen={(id) => navigate(`/conduct/interventions/${id}`)}
                />
                <GapList
                  title="Completed without a recorded outcome"
                  description="Completed interventions where no supervisory outcome has been recorded."
                  rows={gaps.completed_without_outcome ?? []}
                  onOpen={(id) => navigate(`/conduct/interventions/${id}`)}
                />
                <GapList
                  title="Outstanding follow-up"
                  description="Follow-up is due and has not been completed."
                  rows={gaps.outstanding_followup ?? []}
                  onOpen={(id) => navigate(`/conduct/interventions/${id}`)}
                />
                <GapList
                  title="Overdue follow-up"
                  description="Follow-up is past its due date and still outstanding."
                  rows={gaps.followup_overdue ?? []}
                  onOpen={(id) => navigate(`/conduct/interventions/${id}`)}
                />
                <GapList
                  title="Follow-up done, concern not reassessed"
                  description="The loop is not yet closed back to the attention item."
                  rows={gaps.followup_done_awaiting_reassessment ?? []}
                  onOpen={(id) => navigate(`/conduct/interventions/${id}`)}
                />
                <GapList
                  title="Reassessment overdue"
                  description="The target review date for the attention item has passed."
                  rows={gaps.reassessment_overdue ?? []}
                  onOpen={(id) => navigate(`/conduct/attention/${id}`)}
                />
                <GapList
                  title="Confirmed risks without a response"
                  description="Confirmed emerging conduct risks with no attention item raised."
                  rows={gaps.confirmed_risk_without_response ?? []}
                  onOpen={(id) => navigate(`/conduct/emerging-risks/${id}`)}
                />
              </div>
            </>
          )}

        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Raise a supervisory attention item</DialogTitle>
            <DialogDescription>
              Record what has come to supervisory attention and the factual basis for it. Priority is calculated
              afterwards and must be confirmed by a supervisor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="att-title">Matter</Label>
              <Input id="att-title" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="What has come to supervisory attention" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Raised from</Label>
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((k) => (
                      <SelectItem key={k} value={k}>{ATTENTION_SOURCE_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="att-ref">Source record reference (optional)</Label>
                <Input id="att-ref" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)}
                  placeholder="e.g. SIG-2026-0041" />
              </div>
              <div className="space-y-1.5">
                <Label>Materiality</Label>
                <Select value={materiality} onValueChange={setMateriality}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MATERIALITY_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Urgency</Label>
                <Select value={urgency} onValueChange={setUrgency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(URGENCY_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="att-review">Target review date (optional)</Label>
                <Input id="att-review" type="date" value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="att-basis">Supervisory basis</Label>
              <Textarea
                id="att-basis" rows={4} value={basis} onChange={(e) => setBasis(e.target.value)}
                placeholder="The recorded facts that bring this to supervisory attention (at least 20 characters)."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints"
              onClick={submit}
              disabled={create.isPending || title.trim().length < 3 || basis.trim().length < 20}
            >
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record attention item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
