import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  complaint: any;
}

export function TriageHistoryCard({ complaint }: Props) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rule, setRule] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('conduct_triage_audit_events' as any)
        .select('*')
        .eq('complaint_id', complaint.id)
        .order('created_at', { ascending: false })
        .limit(25);
      if (!alive) return;
      setEvents((data as any[]) || []);
      if (complaint.triage_rule_id) {
        const { data: r } = await supabase
          .from('conduct_triage_rules' as any)
          .select('id, name')
          .eq('id', complaint.triage_rule_id)
          .maybeSingle();
        if (alive) setRule(r);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [complaint.id, complaint.triage_rule_id]);

  const orig = complaint.triage_original_values || null;
  const snap = complaint.triage_result_snapshot || null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Triage History</CardTitle>
        {complaint.triage_override_status && (
          <Badge variant="outline" className="capitalize">{String(complaint.triage_override_status).replace('_', ' ')}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-muted-foreground text-xs">Last evaluated</p>
            <p>{complaint.triage_evaluated_at ? new Date(complaint.triage_evaluated_at).toLocaleString() : '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Source</p>
            <p className="capitalize">{complaint.triage_source || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Matched rule</p>
            <p>{rule?.name || (complaint.triage_rule_id ? complaint.triage_rule_id : '— no rule matched —')}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">SLA due</p>
            <p>{complaint.sla_due_at ? new Date(complaint.sla_due_at).toLocaleString() : '—'}</p>
          </div>
        </div>

        {complaint.triage_last_error && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <strong>Last error:</strong> {complaint.triage_last_error}
          </div>
        )}

        {(orig || snap) && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            {orig && (
              <div>
                <p className="text-muted-foreground mb-1">Original auto-triage values</p>
                <pre className="rounded bg-muted p-2 overflow-auto max-h-40">{JSON.stringify(orig, null, 2)}</pre>
              </div>
            )}
            {snap && (
              <div>
                <p className="text-muted-foreground mb-1">Last applied snapshot</p>
                <pre className="rounded bg-muted p-2 overflow-auto max-h-40">{JSON.stringify(snap, null, 2)}</pre>
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">Recent triage events</p>
            <span className="text-xs text-muted-foreground">{events.length} event(s)</span>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
          ) : events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No triage evaluations recorded yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-auto">
              {events.map((e) => (
                <button
                  key={e.id}
                  className="w-full text-left rounded border p-2 hover:bg-muted/50 text-xs"
                  onClick={() => { setSelected(e); setOpen(true); }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{e.event_type || 'triage.evaluated'}</span>
                    <span className="text-muted-foreground">{e.created_at ? formatDistanceToNow(new Date(e.created_at), { addSuffix: true }) : ''}</span>
                  </div>
                  <div className="text-muted-foreground truncate">
                    {e.triggered_by || 'system'} · rule: {e.triage_rule_id || '—'} · alerts: {Array.isArray(e.metadata?.alerts_created) ? e.metadata.alerts_created.length : 0}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Triage event details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-2 text-xs">
              <div><strong>Event:</strong> {selected.event_type}</div>
              <div><strong>When:</strong> {new Date(selected.created_at).toLocaleString()}</div>
              <div><strong>Triggered by:</strong> {selected.triggered_by || 'system'}</div>
              <div><strong>Rule:</strong> {selected.triage_rule_id || '—'}</div>
              <div>
                <strong>Metadata</strong>
                <pre className="rounded bg-muted p-2 overflow-auto max-h-96 mt-1">{JSON.stringify(selected.metadata || {}, null, 2)}</pre>
              </div>
              <div className="pt-2">
                <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
