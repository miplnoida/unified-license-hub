import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Radar, RefreshCw } from 'lucide-react';
import { fpMonitoringEventAcknowledge } from '@/lib/fpGovernedOps';

const SEV_META: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

interface Props { individualId: string }

export function FpMonitoringPanel({ individualId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [ackNote, setAckNote] = useState<Record<string, string>>({});
  const [rechecking, setRechecking] = useState(false);

  const triggerRecheck = async () => {
    setRechecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('fp-monitoring-sweep', { body: {} });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Sweep failed');
      toast.success(`Sweep complete — ${data.rescreened ?? 0} rescreened, ${data.alerts ?? 0} alert(s) raised`);
      await logFpAction('fp.monitoring.recheck_triggered', 'fp_individual', individualId, {
        after: { rescreened: data.rescreened ?? 0, alerts: data.alerts ?? 0 },
        context: { individualId },
      });
      qc.invalidateQueries({ queryKey: ['fp_monitoring_events', individualId] });
      qc.invalidateQueries({ queryKey: ['fp_screening_runs_timeline', individualId] });
    } catch (e: any) {
      toast.error(e?.message || 'Recheck failed');
    } finally {
      setRechecking(false);
    }
  };

  const { data: events, isLoading } = useQuery({
    queryKey: ['fp_monitoring_events', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_monitoring_events')
        .select('*').eq('individual_id', individualId).order('raised_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: runs } = useQuery({
    queryKey: ['fp_screening_runs_timeline', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_screening_runs')
        .select('id, run_type, status, started_at, completed_at, total_hits, total_checks')
        .eq('individual_id', individualId)
        .order('started_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const acknowledge = useMutation({
    mutationFn: async (eventId: string) => {
      const note = ackNote[eventId]?.trim();
      if (!note || note.length < 5) throw new Error('Acknowledgement note required (min 5 chars)');
      await fpMonitoringEventAcknowledge(eventId, note);
    },
    onSuccess: () => {
      toast.success('Alert acknowledged');
      qc.invalidateQueries({ queryKey: ['fp_monitoring_events', individualId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Radar className="h-4 w-4" /> Monitoring alerts</span>
            <Button data-rbac="fit_and_proper.edit" size="sm" variant="outline" disabled={rechecking} onClick={triggerRecheck}>
              {rechecking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Trigger recheck
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <div className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div>}
          {!isLoading && (events ?? []).length === 0 && <p className="text-sm text-muted-foreground">No monitoring alerts raised.</p>}
          {(events ?? []).map((e: any) => (
            <div key={e.id} className="border rounded p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={SEV_META[e.severity] || SEV_META.low}>{e.severity}</Badge>
                <span className="font-medium">{e.event_type}</span>
                <span className="text-xs text-muted-foreground">{new Date(e.raised_at).toLocaleString()}</span>
                {e.acknowledged_at && <Badge variant="outline" className="bg-green-100 text-green-800">acknowledged</Badge>}
              </div>
              <div className="text-xs whitespace-pre-wrap">{e.summary}</div>
              {e.acknowledged_at ? (
                <div className="text-xs text-muted-foreground border-t pt-2">
                  Acknowledged {new Date(e.acknowledged_at).toLocaleString()}
                  {e.acknowledgement_note && <> · {e.acknowledgement_note}</>}
                </div>
              ) : (
                <div className="flex gap-2 items-end">
                  <Textarea rows={1} placeholder="Acknowledgement note…"
                    value={ackNote[e.id] || ''}
                    onChange={(ev) => setAckNote((p) => ({ ...p, [e.id]: ev.target.value }))} />
                  <Button data-rbac="fit_and_proper.edit" size="sm" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate(e.id)}>Acknowledge</Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Re-check timeline</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(runs ?? []).length === 0 && <p className="text-sm text-muted-foreground">No screening runs recorded.</p>}
          {(runs ?? []).map((r: any) => (
            <div key={r.id} className="border rounded p-2 text-xs flex items-center justify-between">
              <div>
                <Badge variant="outline">{r.run_type}</Badge>
                <span className="ml-2">{r.status}</span>
                <span className="ml-2 text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
              </div>
              <div className="text-muted-foreground">
                {r.total_hits ?? 0} hits / {r.total_checks ?? 0} checks
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
