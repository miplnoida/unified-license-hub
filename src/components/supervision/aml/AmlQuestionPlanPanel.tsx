/**
 * Question scope for one assessment (AML-04).
 *
 * The plan is a server-owned snapshot. This panel shows what the server decided,
 * why (reason code, rule summary, evaluated inputs), and offers the two governed
 * actions — resolve/rebuild the plan, and record a justified scope override.
 * Nothing here computes inclusion, and "not applicable" never appears as a scope
 * state: it is an officer's answer.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  OVERRIDE_STATES, PLAN_STATES,
  useAmlQuestionPlan, useAmlQuestionPlanContext,
  useApplyQuestionPlanOverride, useMaterialiseQuestionPlan,
  type QuestionPlanRow,
} from '@/hooks/useAmlQuestionPlan';
import { titleCase } from '@/lib/amlLabels';

const ALL = 'all';

const stateTone = (s: string) =>
  s.startsWith('INCLUDED')
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : s === 'NOT_TRIGGERED'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-slate-200 bg-slate-50 text-slate-600';

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function OverrideDialog({
  assessmentId, row, onClose,
}: { assessmentId: string; row: QuestionPlanRow | null; onClose: () => void }) {
  const [toState, setToState] = useState(OVERRIDE_STATES[0]);
  const [reason, setReason] = useState('');
  const apply = useApplyQuestionPlanOverride();

  const submit = async () => {
    if (!row) return;
    try {
      await apply.mutateAsync({ assessmentId, questionId: row.question_id, toState, reason });
      toast.success(`${row.question_code} scope override recorded`);
      setReason('');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The override could not be recorded');
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust scope for {row?.question_code}</DialogTitle>
          <DialogDescription>
            The resolved plan stays on the record. Your override is stored alongside it with your justification, and only
            takes effect while the assessment is a draft.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Move this question to</Label>
            <Select value={toState} onValueChange={setToState}>
              <SelectTrigger aria-label="Override state"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OVERRIDE_STATES.map((s) => <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="override-reason">Supervisory justification (at least 20 characters)</Label>
            <Input id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={apply.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={apply.isPending || reason.trim().length < 20}
                  data-rbac="aml_supervision.approve">
            {apply.isPending ? 'Recording…' : 'Record override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({
  assessmentId, rebuild, open, onClose,
}: { assessmentId: string; rebuild: boolean; open: boolean; onClose: () => void }) {
  const [rationale, setRationale] = useState('');
  const run = useMaterialiseQuestionPlan();

  const submit = async () => {
    try {
      await run.mutateAsync({ assessmentId, rationale: rationale.trim() || null });
      toast.success(rebuild ? 'Question plan rebuilt' : 'Question plan resolved');
      setRationale('');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The question plan could not be resolved');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rebuild ? 'Rebuild the question plan' : 'Resolve the question plan'}</DialogTitle>
          <DialogDescription>
            The server resolves scope from the exact methodology version and assessment programme bound to this
            assessment. {rebuild
              ? 'A rebuild is only possible on a draft with no recorded answers, and needs a reason.'
              : 'The result is recorded in the assessment history.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="plan-rationale">
            Reason{rebuild ? ' (at least 10 characters)' : ' (optional)'}
          </Label>
          <Input id="plan-rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={run.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={run.isPending || (rebuild && rationale.trim().length < 10)}
                  data-rbac="aml_supervision.edit">
            {run.isPending ? 'Working…' : rebuild ? 'Rebuild plan' : 'Resolve plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AmlQuestionPlanPanel({
  assessmentId, status,
}: { assessmentId: string; status?: string | null }) {
  const [search, setSearch] = useState('');
  const [planState, setPlanState] = useState(ALL);
  const [questionClass, setQuestionClass] = useState(ALL);
  const [override, setOverride] = useState<QuestionPlanRow | null>(null);
  const [resolving, setResolving] = useState(false);

  const { data, isLoading, error } = useAmlQuestionPlan(assessmentId, {
    search,
    planState: planState === ALL ? null : planState,
    questionClass: questionClass === ALL ? null : questionClass,
  });
  const context = useAmlQuestionPlanContext(assessmentId);
  const isDraft = (status ?? '').toLowerCase() === 'draft';

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Question scope unavailable</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  const s = data?.summary;
  const rows = data?.rows ?? [];
  const unmaterialised = (s?.planned_total ?? 0) === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">Question scope resolved by the server</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {s?.legacy_mode ? <Badge variant="outline">Legacy methodology compatibility</Badge> : null}
            <Badge variant="secondary">{titleCase(s?.mode ?? 'UNKNOWN')}</Badge>
            <Button size="sm" variant="outline" onClick={() => setResolving(true)} data-rbac="aml_supervision.edit">
              {unmaterialised ? 'Resolve question plan' : 'Rebuild question plan'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {unmaterialised ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>No question plan has been resolved for this assessment</AlertTitle>
              <AlertDescription>
                Assessments created before question scope existed carry no plan, and none has been guessed for them.
                Resolving the plan records exactly what the bound methodology version and programme decide.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Tile label="In methodology" value={s?.methodology_total ?? 0} />
              <Tile label="In scope" value={s?.included_total ?? 0}
                    hint={`${s?.included_core ?? 0} core · ${s?.included_conditional ?? 0} conditional · ${s?.included_enhanced ?? 0} enhanced`} />
              <Tile label="Not triggered" value={s?.not_triggered ?? 0} />
              <Tile label="Out of scope" value={s?.out_of_scope ?? 0} />
              <Tile label="Answered" value={s?.answered ?? 0} />
              <Tile label="Still to answer" value={s?.unanswered_in_scope ?? 0} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">{data?.note}</p>
        </CardContent>
      </Card>

      {context.data ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Facts the server used</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-3">
              {Object.entries(context.data).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{titleCase(k.replace(/[._]/g, ' '))}</dt>
                  <dd className="mt-0.5 font-mono text-xs">{v ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Questions ({data?.row_count ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="h-9 w-64"
              placeholder="Search code or prompt"
              aria-label="Search questions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={planState} onValueChange={setPlanState}>
              <SelectTrigger className="h-9 w-[13rem]" aria-label="Filter by scope state"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Scope: any</SelectItem>
                {PLAN_STATES.map((st) => <SelectItem key={st} value={st}>{titleCase(st)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={questionClass} onValueChange={setQuestionClass}>
              <SelectTrigger className="h-9 w-[12rem]" aria-label="Filter by question class"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Class: any</SelectItem>
                {['CORE', 'CONDITIONAL', 'ENHANCED'].map((c) => <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Dimension</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead>Answer</TableHead>
                  {isDraft ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isDraft ? 7 : 6} className="text-sm text-muted-foreground">
                      No question matches this filter.
                    </TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.question_id}>
                    <TableCell className="max-w-sm">
                      <div className="font-mono text-xs">{r.question_code}</div>
                      <div className="text-sm">{r.prompt}</div>
                    </TableCell>
                    <TableCell className="text-xs">{r.dimension_code ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline">{titleCase(r.question_class)}</Badge></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={stateTone(r.effective_state)}>{titleCase(r.effective_state)}</Badge>
                      {r.overridden ? <div className="mt-1 text-[11px] text-muted-foreground">Overridden from {titleCase(r.plan_state)}</div> : null}
                    </TableCell>
                    <TableCell className="max-w-sm text-xs">
                      <div className="font-mono">{r.reason_code ?? '—'}</div>
                      {r.reason_text ? <div className="text-muted-foreground">{r.reason_text}</div> : null}
                      {r.rule_summary ? <div className="mt-0.5">{r.rule_summary}</div> : null}
                      {r.override_reason ? <div className="mt-0.5 italic">{r.override_reason}</div> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{titleCase(r.response_status)}</div>
                      {r.response ? <div className="font-mono text-muted-foreground">{r.response}</div> : null}
                    </TableCell>
                    {isDraft ? (
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setOverride(r)} data-rbac="aml_supervision.approve">
                          Adjust scope
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <OverrideDialog assessmentId={assessmentId} row={override} onClose={() => setOverride(null)} />
      <ResolveDialog
        assessmentId={assessmentId}
        rebuild={!unmaterialised}
        open={resolving}
        onClose={() => setResolving(false)}
      />
    </div>
  );
}
