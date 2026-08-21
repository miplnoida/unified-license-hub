/**
 * EPR-02 — restricted prudential engine operations console.
 *
 * Detection, monitoring and overdue sweeps run on the platform schedule. This
 * administration surface exists only for legitimate diagnostic reprocessing:
 * every manual run requires a reason, is attributed to the actor and is logged
 * by the underlying edge function (run id, cutoff, result counts, errors).
 * Supervisory dashboards show outcomes only — they are not engine consoles.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Clock, Play, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { formatDateTime } from '@/lib/datetime';
import { useSweepSchedule, useFeedLogs } from '@/hooks/usePrudentialSupervision';

function EngineRun({
  title, description, fn, rbac, icon,
}: { title: string; description: string; fn: string; rbac: string; icon: 'play' | 'refresh' }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const run = async () => {
    if (reason.trim().length < 10) {
      toast.error('Record a reason of at least 10 characters before running the engine.');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { trigger: 'manual', reason: reason.trim() },
      });
      if (error) throw error;
      const payload = data as any;
      if (payload?.skipped) {
        toast.info('A run is already in progress. Wait for it to finish.');
      } else {
        toast.success(`${title} completed.`, {
          description: Object.entries(payload ?? {})
            .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
            .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
            .join('\n') || 'No counts reported.',
        });
      }
      setReason('');
      qc.invalidateQueries({ queryKey: ['prudential_data_feed_logs'] });
      qc.invalidateQueries({ queryKey: ['prudential_sweep_schedule'] });
      qc.invalidateQueries({ queryKey: ['prudential_portfolio'] });
      qc.invalidateQueries({ queryKey: ['prudential_work_queue'] });
      qc.invalidateQueries({ queryKey: ['prudential_work_queue_counts'] });
    } catch (e: any) {
      toast.error(e?.message || 'Engine run failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{description}</p>
        <div>
          <Label>Reason for the manual run <span className="text-destructive">*</span></Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Reprocessing after a corrected Q2 filing was accepted" />
        </div>
        <Button data-rbac={rbac} size="sm" disabled={busy} onClick={run}>
          {icon === 'play' ? <Play className="mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {busy ? 'Running…' : `Run ${title.toLowerCase()}`}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PrudentialEngineOperations() {
  const { data: schedule } = useSweepSchedule();
  const { data: feeds = [] } = useFeedLogs();

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Prudential engine operations</h1>
          <p className="text-sm text-muted-foreground">
            Restricted diagnostic surface. Detection and monitoring run automatically on schedule —
            use these controls only when a reprocessing run is genuinely required.
          </p>
        </div>

        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div>
              <div className="font-medium">Manual runs are recorded</div>
              <div className="text-muted-foreground">
                Each run stores the actor, reason, run id, engine configuration version, input cutoff,
                result counts and any errors in the prudential data-feed log and audit trail.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 py-4 text-sm sm:grid-cols-3">
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Last monitoring sweep</div>
                <div className="font-medium">{formatDateTime(schedule?.last_monitoring_sweep?.completed_at || schedule?.last_monitoring_sweep?.started_at)}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Last overdue check</div>
                <div className="font-medium">{formatDateTime(schedule?.last_overdue_check?.completed_at || schedule?.last_overdue_check?.started_at)}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Automatic schedule</div>
                <div className="font-medium">Daily at 00:00</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <EngineRun
            title="Monitoring sweep"
            description="Re-evaluates accepted filings against configured thresholds and stress indicators, then refreshes risk scores. Detection mathematics are unchanged."
            fn="prudential-monitoring-sweep"
            rbac="prudential_supervision.manage_config"
            icon="play"
          />
          <EngineRun
            title="Overdue action check"
            description="Marks open supervisory actions whose due date has passed as overdue and records the change in the audit log."
            fn="overdue-action-sweep"
            rbac="prudential_supervision.manage_config"
            icon="refresh"
          />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent engine runs</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {feeds.slice(0, 20).map((f: any) => (
              <div key={f.id} className="flex justify-between border-b py-1">
                <span>{f.source} / {f.feed_type} <span className="text-xs text-muted-foreground">{formatDateTime(f.started_at)}</span></span>
                <span className={f.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{f.status}</span>
              </div>
            ))}
            {!feeds.length && <div className="text-muted-foreground">No runs logged.</div>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
