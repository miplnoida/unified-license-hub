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
            <Button size="sm" variant="outline" onClick={() => setRfiOpen(true)}>
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Create RFI from Failed Rules ({autoRfiCandidates.length})
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
                          <Button size="sm" variant="outline" onClick={() => setOverride({ result: r, reason: '' })}>Override</Button>
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
            <Button onClick={submitOverride}>Record Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
