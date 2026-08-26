/**
 * MC-10 — Supervisory prioritisation workspace.
 *
 * The ranking on this page is arithmetic over recorded conduct facts for the
 * stated window and the sectors the officer is authorised to supervise. It is
 * not a judgement and it is not AI: it orders where to look. Deciding to act
 * is a separate, recorded human step (propose an intervention).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, ArrowRight, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/useCan';
import { formatDateTime } from '@/lib/datetime';
import {
  DRIVER_LABEL, INTERVENTION_TYPE_LABEL, planningErrorMessage,
  usePriorityCompute, usePriorityRegister, useProposeIntervention,
  type InterventionType, type PriorityEntry,
} from '@/hooks/useConductPlanning';

const WINDOWS = [
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 12 months' },
  { value: '730', label: 'Last 24 months' },
];

export default function ConductPrioritisation() {
  const navigate = useNavigate();
  const canAnalytics = useCan('market_conduct', 'run_conduct_analytics');
  const canComplaints = useCan('market_conduct', 'manage_complaints');
  const canOperate = canAnalytics || canComplaints;

  const [windowDays, setWindowDays] = useState('180');
  const [search, setSearch] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [target, setTarget] = useState<PriorityEntry | null>(null);
  const [type, setType] = useState<InterventionType>('SUPERVISORY_ENGAGEMENT');
  const [title, setTitle] = useState('');
  const [basis, setBasis] = useState('');
  const [outcome, setOutcome] = useState('');

  const register = usePriorityRegister(runId, 50);
  const compute = usePriorityCompute();
  const propose = useProposeIntervention();

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (register.data?.entries ?? []).filter(
      (e) => !q || (e.licensee_name ?? '').toLowerCase().includes(q));
  }, [register.data, search]);

  const scope = register.data?.scope?.sectors_in_view;
  const scopeText = scope === 'all'
    ? 'All sectors you supervise'
    : `${Array.isArray(scope) ? scope.length : 0} sector(s) in your remit`;

  const runCompute = () => {
    compute.mutate({ windowDays: Number(windowDays) }, {
      onSuccess: (res) => {
        setRunId(res.run_id);
        toast.success(`Prioritisation computed — ${res.entity_count} entities with recorded conduct facts.`);
      },
      onError: (e: unknown) => toast.error(planningErrorMessage(String((e as Error)?.message ?? ''))),
    });
  };

  const openPropose = (entry: PriorityEntry) => {
    setTarget(entry);
    setType('SUPERVISORY_ENGAGEMENT');
    setTitle('');
    setBasis('');
    setOutcome('');
  };

  const submitPropose = () => {
    if (!target) return;
    propose.mutate({
      interventionType: type,
      title: title.trim(),
      basis: basis.trim(),
      licenseeId: target.licensee_id,
      priorityScoreId: target.score_id,
      expectedOutcome: outcome.trim() || null,
    }, {
      onSuccess: (res) => {
        setTarget(null);
        toast.success(`Intervention ${res.reference} proposed and awaiting a second officer's decision.`);
        navigate(`/conduct/interventions/${res.id}`);
      },
      onError: (e: unknown) => toast.error(planningErrorMessage(String((e as Error)?.message ?? ''))),
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Supervisory Prioritisation"
          description="Where recorded conduct facts are concentrated right now. The ordering is arithmetic over complaints, signals, detected patterns and confirmed sector risks for the stated window — it is not a judgement, and no AI is involved."
          actions={
            <div className="flex items-center gap-2">
              {!canOperate && <Badge variant="outline">View only</Badge>}
              <Button variant="outline" onClick={() => navigate('/conduct/interventions')}>
                Intervention register
              </Button>
            </div>
          }
        />

        <Card>
          <CardContent className="grid gap-3 p-4 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Observation window</Label>
              <Select value={windowDays} onValueChange={setWindowDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WINDOWS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Search entity</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" value={search} placeholder="Entity name"
                       onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex items-end">
              {canOperate ? (
                <Button className="w-full" onClick={runCompute} disabled={compute.isPending}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${compute.isPending ? 'animate-spin' : ''}`} />
                  Compute prioritisation
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  You can read the latest prioritisation. Commissioning a new run requires conduct-analytics authority.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {register.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">The prioritisation register could not be loaded</AlertTitle>
            <AlertDescription className="text-xs">
              {planningErrorMessage(String((register.error as Error)?.message ?? ''))}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Priority ordering</CardTitle>
            {register.data?.run ? (
              <p className="text-xs text-muted-foreground">
                Computed {formatDateTime(register.data.run.computed_at)} ·{' '}
                {register.data.run.window.from} to {register.data.run.window.to} ({register.data.run.window.days} days) ·{' '}
                {scopeText} · {register.data.run.method}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No prioritisation has been computed yet.
              </p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {register.isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead className="text-right">Complaints</TableHead>
                      <TableHead className="text-right">Signals</TableHead>
                      <TableHead className="text-right">Patterns</TableHead>
                      <TableHead className="text-right">Sector risks</TableHead>
                      <TableHead className="text-right">Weighted score</TableHead>
                      <TableHead className="w-40" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                          No entity in your remit has recorded conduct facts for this window.
                        </TableCell>
                      </TableRow>
                    )}
                    {entries.map((e) => (
                      <TableRow key={e.score_id}>
                        <TableCell className="font-mono text-xs">{e.rank}</TableCell>
                        <TableCell className="font-medium">{e.licensee_name ?? '—'}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{e.complaint_count}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{e.signal_count}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{e.pattern_count}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{e.emerging_risk_count}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">{e.score}</TableCell>
                        <TableCell className="text-right">
                          {canOperate && (
                            <Button size="sm" variant="outline" onClick={() => openPropose(e)}>
                              Propose intervention <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Propose a supervisory intervention</DialogTitle>
              <DialogDescription className="text-xs">
                {target?.licensee_name} · rank {target?.rank} · weighted score {target?.score}. A second officer with
                approval authority must decide this proposal — you cannot approve your own.
              </DialogDescription>
            </DialogHeader>

            {target && (
              <div className="rounded-md border p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">What the ranking rests on</p>
                {Object.entries(target.drivers ?? {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{DRIVER_LABEL[k] ?? k}</span>
                    <span className="font-mono">{v?.count ?? 0} × {v?.weight ?? 0}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Intervention</Label>
                <Select value={type} onValueChange={(v) => setType(v as InterventionType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(INTERVENTION_TYPE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)}
                       placeholder="Short description of the intervention" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Supervisory basis (required, at least 20 characters)</Label>
                <Textarea rows={4} value={basis} onChange={(e) => setBasis(e.target.value)}
                          placeholder="The recorded facts that justify acting now." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expected outcome (optional)</Label>
                <Textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
              <Button onClick={submitPropose}
                      disabled={propose.isPending || title.trim().length < 3 || basis.trim().length < 20}>
                Propose for decision
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
