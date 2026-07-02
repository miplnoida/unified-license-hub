import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, PlayCircle, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react';

const SEVERITY_CLASS: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

interface Props { individualId: string; assessmentId?: string | null }

export function FpScreeningPanel({ individualId, assessmentId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const { data: runs } = useQuery({
    queryKey: ['fp_screening_runs', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_screening_runs')
        .select('id, assessment_id, run_type, status, total_checks, total_hits, started_at, completed_at')
        .eq('individual_id', individualId).order('started_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: findings } = useQuery({
    queryKey: ['fp_findings', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_findings')
        .select('id, run_id, check_type, title, severity, summary, source, is_false_positive, review_note, reviewed_at, created_at')
        .eq('individual_id', individualId).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const runScreening = async () => {
    if (!assessmentId) { toast.error('Open an assessment first to run screening.'); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('fp-screening-run', {
        body: { assessment_id: assessmentId, run_type: 'manual', triggered_by: user?.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Screening failed');
      toast.success(`Screening complete — ${data.total_hits} findings from ${data.total_checks} checks`);
      qc.invalidateQueries({ queryKey: ['fp_screening_runs', individualId] });
      qc.invalidateQueries({ queryKey: ['fp_findings', individualId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setRunning(false);
    }
  };

  const markFinding = useMutation({
    mutationFn: async ({ id, isFalse }: { id: string; isFalse: boolean }) => {
      const { error } = await supabase.from('fp_findings').update({
        is_false_positive: isFalse,
        review_note: noteText || null,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Finding updated');
      setNoteFor(null); setNoteText('');
      qc.invalidateQueries({ queryKey: ['fp_findings', individualId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4 flex items-center justify-between">
        <div className="text-sm">
          <div className="font-medium">Screening runs</div>
          <div className="text-xs text-muted-foreground">Runs sanctions / PEP / criminal / financial / regulator watchlist / adverse-media checks configured by admin.</div>
        </div>
        <Button size="sm" onClick={runScreening} disabled={running || !assessmentId}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
          Run screening
        </Button>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-2">
        {(runs ?? []).length === 0 && <p className="text-sm text-muted-foreground">No screening runs yet.</p>}
        {(runs ?? []).map((r: any) => (
          <div key={r.id} className="text-xs border rounded p-2 flex justify-between">
            <div>
              <span className="font-mono">{r.id.slice(0, 8)}</span> · {r.run_type} · {r.status}
              <span className="ml-2 text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
            </div>
            <div>{r.total_hits} hit(s) / {r.total_checks} check(s)</div>
          </div>
        ))}
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">Findings ({(findings ?? []).length})</div>
        {(findings ?? []).length === 0 && <p className="text-sm text-muted-foreground">No findings raised.</p>}
        {(findings ?? []).map((f: any) => (
          <div key={f.id} className={`border rounded p-3 ${f.is_false_positive ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={SEVERITY_CLASS[f.severity] || SEVERITY_CLASS.low}>{f.severity}</Badge>
                  <span className="text-xs text-muted-foreground">{f.check_type}</span>
                  {f.is_false_positive && <Badge variant="outline" className="bg-slate-100 text-slate-700">false positive</Badge>}
                </div>
                <div className="font-medium text-sm mt-1">{f.title}</div>
                {f.summary && <div className="text-xs text-muted-foreground mt-1">{f.summary}</div>}
                {f.review_note && <div className="text-xs italic mt-1">Note: {f.review_note}</div>}
              </div>
              <div className="flex gap-1">
                {!f.is_false_positive && <Button size="sm" variant="ghost" onClick={() => { setNoteFor(f.id); setNoteText(''); }}><ShieldOff className="h-4 w-4 mr-1" /> False positive</Button>}
                {f.is_false_positive && <Button size="sm" variant="ghost" onClick={() => markFinding.mutate({ id: f.id, isFalse: false })}><ShieldAlert className="h-4 w-4 mr-1" /> Restore</Button>}
              </div>
            </div>
            {noteFor === f.id && (
              <div className="mt-2 space-y-2">
                <Textarea rows={2} placeholder="Optional review note" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setNoteFor(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => markFinding.mutate({ id: f.id, isFalse: true })} disabled={markFinding.isPending}>
                    <ShieldCheck className="h-4 w-4 mr-1" /> Confirm
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
