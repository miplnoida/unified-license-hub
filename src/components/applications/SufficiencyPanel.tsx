import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, Play, RefreshCw, MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { logAction } from '@/hooks/useAuditLog';
import { useAuth } from '@/contexts/AuthContext';
import { RaiseRfiDialog, type RfiInitialItem } from '@/components/applications/RaiseRfiDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  SUFFICIENCY_CHECKLIST,
  useSufficiencyDeterminations,
  useRecordSufficiencyDetermination,
  type SufficiencyDecision,
} from '@/hooks/useSufficiencyDetermination';

interface Props { applicationId: string }

type EvalRow = { id: string; overall_status: string; blocker_count: number; warning_count: number; pass_count: number; evaluated_at: string; triggered_by: string };
type ResultRow = { id: string; status: string; severity: string; detail: any; rule_snapshot: any; auto_rfi_item_id: string | null };

function statusIcon(s: string) {
  if (s === 'sufficient') return <ShieldCheck className="h-4 w-4 text-green-600" />;
  if (s === 'warning') return <ShieldQuestion className="h-4 w-4 text-amber-600" />;
  return <ShieldAlert className="h-4 w-4 text-red-600" />;
}

export function SufficiencyPanel({ applicationId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [override, setOverride] = useState<{ result: ResultRow | null; reason: string }>({ result: null, reason: '' });
  const [rfiOpen, setRfiOpen] = useState(false);
  const [determineOpen, setDetermineOpen] = useState(false);
  const [decision, setDecision] = useState<SufficiencyDecision>('sufficient');
  const [determinationReason, setDeterminationReason] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const { data: determinations = [] } = useSufficiencyDeterminations(applicationId);
  const recordDetermination = useRecordSufficiencyDetermination(applicationId);
  const latestDetermination = determinations[0] ?? null;

  const { data: latest } = useQuery({
    queryKey: ['sufficiency_latest', applicationId],
    queryFn: async () => {
      const { data } = await supabase.from('sufficiency_evaluations' as any)
        .select('*').eq('application_id', applicationId)
        .order('evaluated_at', { ascending: false }).limit(1).maybeSingle();
      return data as unknown as EvalRow | null;
    },
  });

  const { data: results = [], refetch: refetchResults } = useQuery({
    queryKey: ['sufficiency_results', latest?.id],
    enabled: !!latest?.id,
    queryFn: async () => {
      const { data } = await supabase.from('sufficiency_evaluation_results' as any)
        .select('*').eq('evaluation_id', latest!.id).order('created_at');
      return (data || []) as unknown as ResultRow[];
    },
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ['sufficiency_overrides', latest?.id],
    enabled: !!latest?.id && results.length > 0,
    queryFn: async () => {
      const ids = results.map((r) => r.id);
      const { data } = await supabase.from('sufficiency_overrides' as any).select('*').in('evaluation_result_id', ids);
      return (data || []) as any[];
    },
  });

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-application-sufficiency', {
        body: { application_id: applicationId, triggered_by: 'manual' },
      });
      if (error) throw error;
      toast.success(`Evaluation complete: ${data.overall_status}${data.generated_rfi_id ? ' — RFI auto-created' : ''}`);
      qc.invalidateQueries({ queryKey: ['sufficiency_latest', applicationId] });
      qc.invalidateQueries({ queryKey: ['application_rfis'] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setRunning(false); }
  };

  const submitOverride = async () => {
    if (!override.result || !user) return;
    if (override.reason.trim().length < 10) return toast.error('Reason must be at least 10 characters');
    const { error } = await supabase.from('sufficiency_overrides' as any).insert({
      evaluation_result_id: override.result.id,
      overridden_by: user.id,
      reason: override.reason.trim(),
    });
    if (error) return toast.error(error.message);
    await logAction('sufficiency.override.recorded', 'sufficiency_evaluation_result', override.result.id, {
      after: { reason: override.reason.trim(), rule: override.result.rule_snapshot?.code },
      meta: { application_id: applicationId },
    });
    toast.success('Override recorded');
    setOverride({ result: null, reason: '' });
    qc.invalidateQueries({ queryKey: ['sufficiency_overrides', latest?.id] });
  };

  const submitDetermination = async () => {
    if (determinationReason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }
    if (decision === 'sufficient' && SUFFICIENCY_CHECKLIST.some((c) => !checklist[c.key])) {
      toast.error('Confirm every checklist item before declaring the application sufficient');
      return;
    }
    try {
      await recordDetermination.mutateAsync({
        decision,
        reason: determinationReason.trim(),
        checklist: SUFFICIENCY_CHECKLIST.map((c) => ({
          key: c.key,
          label: c.label,
          checked: !!checklist[c.key],
        })),
      });
      toast.success('Sufficiency determination recorded');
      setDetermineOpen(false);
      setDeterminationReason('');
      setChecklist({});
    } catch (e) {
      const err = e as Error & { code?: string };
      toast.error(
        err.code === 'SUFFICIENCY_GATES_UNMET'
          ? err.message
          : err.message || 'Failed to record determination',
      );
    }
  };

  const autoRfiCandidates = useMemo(() => {
    return results.filter(
      (r) => (r.status === 'fail' || r.status === 'warning') && r.rule_snapshot?.auto_rfi === true,
    );
  }, [results]);

  const initialRfiItems: RfiInitialItem[] = useMemo(
    () =>
      autoRfiCandidates.map((r) => ({
        prompt: r.rule_snapshot?.rfi_prompt_template || r.rule_snapshot?.name || 'Please provide the required information.',
        question_type: (r.rule_snapshot?.rfi_question_type || 'text') as 'text' | 'document' | 'both',
        required: true,
        source_rule_id: r.rule_snapshot?.code,
      })),
    [autoRfiCandidates],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {latest ? statusIcon(latest.overall_status) : <ShieldQuestion className="h-4 w-4" />}
          Sufficiency Review
          {latest && <Badge variant={latest.overall_status === 'sufficient' ? 'default' : latest.overall_status === 'warning' ? 'secondary' : 'destructive'}>{latest.overall_status}</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          {autoRfiCandidates.length > 0 && (
            <Button data-rbac="application_management.edit" size="sm" variant="outline" onClick={() => setRfiOpen(true)}>
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Create RFI from Failed Rules ({autoRfiCandidates.length})
            </Button>
          )}
          {latest && (
            <Button data-rbac="application_management.approve" size="sm" variant="outline" onClick={() => setDetermineOpen(true)}>
              Record determination
            </Button>
          )}
          <Button size="sm" onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : latest ? <RefreshCw className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {latest ? 'Re-evaluate' : 'Run Evaluation'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!latest ? (
          <p className="text-sm text-muted-foreground">No sufficiency evaluation yet. Click "Run Evaluation" to check this application against the configured rule set.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>Last evaluated: {new Date(latest.evaluated_at).toLocaleString()}</span>
              <span>Trigger: {latest.triggered_by}</span>
              <span>Passed: {latest.pass_count}</span>
              <span>Warnings: {latest.warning_count}</span>
              <span>Blockers: {latest.blocker_count}</span>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Rule</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Detail</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {results.map((r) => {
                  const ov = overrides.find((o: any) => o.evaluation_result_id === r.id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.rule_snapshot?.name || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.rule_snapshot?.rule_type}</TableCell>
                      <TableCell><Badge variant={r.severity === 'blocker' ? 'destructive' : r.severity === 'warning' ? 'default' : 'secondary'}>{r.severity}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'pass' ? 'default' : r.status === 'warning' ? 'secondary' : r.status === 'fail' ? 'destructive' : 'outline'}>{r.status}</Badge>
                        {ov && <Badge variant="outline" className="ml-2">overridden</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">{r.detail ? JSON.stringify(r.detail) : '—'}</TableCell>
                      <TableCell className="text-right">
                        {(r.status === 'fail' || r.status === 'warning') && !ov && (
                          <Button data-rbac="application_management.approve" size="sm" variant="outline" onClick={() => setOverride({ result: r, reason: '' })}>Override</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {results.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No rule results.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </>
        )}

        {determinations.length > 0 && (
          <>
            <Separator className="my-4" />
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Reviewer determinations ({determinations.length})
            </p>
            <div className="space-y-2">
              {determinations.map((d) => (
                <div key={d.id} className="rounded-md border p-3 text-xs space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={d.decision === 'sufficient' ? 'default' : d.decision === 'deferred' ? 'secondary' : 'destructive'}>
                      {d.decision}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(d.determined_at).toLocaleString()}
                    </span>
                    <span className="text-muted-foreground ml-auto">
                      Blockers at decision: {d.unresolved_blocker_count} · Open RFIs: {d.open_rfi_count}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{d.reason}</p>
                  {Array.isArray(d.checklist) && d.checklist.length > 0 && (
                    <ul className="text-[11px] text-muted-foreground list-disc pl-4">
                      {d.checklist.map((c) => (
                        <li key={c.key}>{c.checked ? '✓' : '✗'} {c.label}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!override.result} onOpenChange={(v) => !v && setOverride({ result: null, reason: '' })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Override Sufficiency Rule</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">Rule: <strong>{override.result?.rule_snapshot?.name}</strong></p>
            <Label>Reason (minimum 10 characters, will be audited)</Label>
            <Textarea rows={4} value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverride({ result: null, reason: '' })}>Cancel</Button>
            <Button data-rbac="application_management.approve" onClick={submitOverride}>Record Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={determineOpen} onOpenChange={setDetermineOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Sufficiency Determination</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground">
              The outcome is validated on the server: a “sufficient” determination is rejected while
              unresolved blockers or open RFIs remain, even if every box below is ticked.
            </div>
            <div className="space-y-2">
              <Label>Reviewer checklist</Label>
              {SUFFICIENCY_CHECKLIST.map((c) => (
                <label key={c.key} className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!checklist[c.key]}
                    onCheckedChange={(v) => setChecklist((prev) => ({ ...prev, [c.key]: !!v }))}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
            <div>
              <Label>Determination</Label>
              <div className="flex gap-2 mt-1">
                {(['sufficient', 'insufficient', 'deferred'] as SufficiencyDecision[]).map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={decision === d ? 'default' : 'outline'}
                    onClick={() => setDecision(d)}
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Reason (minimum 10 characters, audited)</Label>
              <Textarea rows={3} value={determinationReason} onChange={(e) => setDeterminationReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetermineOpen(false)}>Cancel</Button>
            <Button data-rbac="application_management.approve" onClick={submitDetermination} disabled={recordDetermination.isPending}>
              {recordDetermination.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record determination
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {user && (
        <RaiseRfiDialog
          applicationId={applicationId}
          raisedBy={user.id}
          hideTrigger
          open={rfiOpen}
          onOpenChange={setRfiOpen}
          initialItems={initialRfiItems}
          sufficiencyEvaluationId={latest?.id ?? null}
          sufficiencyResultIds={autoRfiCandidates.map((r) => r.id)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['application_rfis'] });
            qc.invalidateQueries({ queryKey: ['sufficiency_latest', applicationId] });
          }}
        />
      )}
    </Card>
  );
}
