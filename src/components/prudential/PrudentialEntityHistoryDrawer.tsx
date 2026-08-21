import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchCanonicalEntityFilingHistory } from '@/lib/returns/canonicalReturnsSummary';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName?: string;
}

type Event = {
  id: string;
  ts: string; // ISO
  kind: 'submission' | 'ratio' | 'breach' | 'action' | 'escalation' | 'assessment' | 'stress' | 'audit';
  title: string;
  detail?: string;
  badge?: string;
  tone?: string;
};

const TONE: Record<string, string> = {
  breach: 'bg-destructive/10 text-destructive border-destructive/30',
  warn: 'bg-amber-500/10 text-amber-700 border-amber-200',
  info: 'bg-blue-500/10 text-blue-700 border-blue-200',
  ok: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  neutral: 'bg-muted text-foreground border-muted-foreground/20',
};

/**
 * Aggregates every prudential-relevant timeline event for an entity:
 * return submissions, ratio computations (grouped per return), threshold breaches,
 * prudential actions/escalations/assessments/stress events, plus compliance audit.
 */
export function PrudentialEntityHistoryDrawer({ open, onOpenChange, entityId, entityName }: Props) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const [returns, actionsR, escR, assessR, stressR, auditR] = await Promise.all([
        // EPR-01: canonical filing history (return_filings + versions/metrics).
        fetchCanonicalEntityFilingHistory(entityId),
        supabase.from('prudential_actions').select('*').eq('entity_id', entityId),
        supabase.from('prudential_escalations').select('*').eq('entity_id', entityId),
        supabase.from('prudential_assessments').select('*').eq('entity_id', entityId),
        supabase.from('prudential_stress_events')
          .select('*, prudential_stress_indicators(label)').eq('entity_id', entityId),
        supabase.rpc('prudential_entity_audit_history', { _entity_id: entityId }),
      ]);

      const filingIds = returns.map((r) => r.filing_id);

      const breachesR = filingIds.length
        ? await supabase.from('return_threshold_breaches')
            .select('id, return_filing_id, metric_key, level, risk_level, value, threshold_value, detected_at')
            .in('return_filing_id', filingIds).order('detected_at', { ascending: false })
        : { data: [] as any[] };

      const returnsById: Record<string, any> = Object.fromEntries(returns.map((r) => [r.filing_id, r]));

      const list: Event[] = [];

      // Canonical filing submissions / acceptances
      for (const r of returns) {
        if (r.submitted_at) {
          list.push({
            id: `sub-${r.filing_id}`,
            ts: r.submitted_at,
            kind: 'submission',
            title: `Return submitted (${r.period_label ?? r.period_end ?? '—'})`,
            detail: `${r.filing_reference ?? r.filing_id.slice(0, 8)} · v${r.current_version_number ?? 1} · ${r.metric_count} metrics`,
            badge: r.status_label || r.status || undefined,
            tone: 'info',
          });
        }
        if (r.accepted_at) {
          list.push({
            id: `acc-${r.filing_id}`,
            ts: r.accepted_at,
            kind: 'submission',
            title: `Return accepted (${r.period_label ?? r.period_end ?? '—'})`,
            detail: r.filing_reference ?? r.filing_id.slice(0, 8),
            badge: 'Accepted',
            tone: 'neutral',
          });
        }
      }

      // Breaches
      for (const b of (breachesR.data ?? []) as any[]) {
        const rf = returnsById[b.return_filing_id];
        list.push({
          id: `br-${b.id}`,
          ts: b.detected_at,
          kind: 'breach',
          title: `${b.level === 'breach' ? 'Breach' : 'Warning'}: ${b.metric_key}`,
          detail: `${b.value} vs threshold ${b.threshold_value}${rf ? ` · Period ${rf.period_label ?? rf.period_end}` : ''}`,
          badge: b.risk_level || b.level,
          tone: b.level === 'breach' ? 'breach' : 'warn',
        });
      }


      // Actions / escalations / assessments / stress
      for (const a of (actionsR.data ?? []) as any[]) {
        list.push({
          id: `act-${a.id}`, ts: a.created_at, kind: 'action',
          title: `Action: ${a.title}`, badge: a.status, tone: 'info',
        });
      }
      for (const e of (escR.data ?? []) as any[]) {
        list.push({
          id: `esc-${e.id}`, ts: e.created_at, kind: 'escalation',
          title: `Escalation: ${e.escalation_type}`, detail: e.reason, badge: e.status, tone: 'warn',
        });
      }
      for (const a of (assessR.data ?? []) as any[]) {
        list.push({
          id: `ass-${a.id}`, ts: a.created_at, kind: 'assessment',
          title: `Assessment ${a.period_start ?? ''} → ${a.period_end ?? ''}`,
          badge: a.overall_rating || a.status, tone: 'neutral',
        });
      }
      for (const s of (stressR.data ?? []) as any[]) {
        list.push({
          id: `str-${s.id}`, ts: s.triggered_at, kind: 'stress',
          title: `Stress event: ${s.prudential_stress_indicators?.label || s.indicator_id}`,
          detail: `Observed ${s.observed_value ?? '—'}`, tone: 'warn',
        });
      }
      for (const a of ((auditR.data ?? []) as any[])) {
        list.push({
          id: `aud-${a.entry_id}`, ts: a.timestamp, kind: 'audit',
          title: `${a.action_type} · ${a.object_type}`,
          detail: a.justification || undefined,
          tone: 'neutral',
        });
      }

      list.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
      setEvents(list);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && entityId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const day = e.ts ? new Date(e.ts).toLocaleDateString() : '—';
      const arr = map.get(day) ?? [];
      arr.push(e);
      map.set(day, arr);
    }
    return Array.from(map.entries());
  }, [events]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {entityName ? `${entityName} — Prudential history` : 'Prudential history'}
          </SheetTitle>
          <SheetDescription>
            Timeline of submissions, ratios, breaches, actions, escalations, assessments and audit events.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${events.length} event${events.length === 1 ? '' : 's'}`}
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Refresh
          </Button>
        </div>

        {error && <div className="mt-3 text-sm text-destructive">{error}</div>}

        <div className="mt-4 space-y-4">
          {grouped.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground py-8 text-center">No history yet.</div>
          )}
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{day}</div>
              <div className="space-y-2">
                {items.map((e) => (
                  <div key={e.id} className={`border rounded-md p-3 text-sm ${TONE[e.tone ?? 'neutral']}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{e.title}</div>
                        {e.detail && <div className="text-xs opacity-80 mt-0.5">{e.detail}</div>}
                      </div>
                      {e.badge && <Badge variant="outline" className="whitespace-nowrap">{e.badge}</Badge>}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide opacity-70 mt-1">
                      {new Date(e.ts).toLocaleTimeString()} · {e.kind}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default PrudentialEntityHistoryDrawer;
