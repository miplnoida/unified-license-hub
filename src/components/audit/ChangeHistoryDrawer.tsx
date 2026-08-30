import { forwardRef, useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { fetchOverridesForEntity, type RuleOverrideRow } from '@/lib/ruleOverrides';
import { humanizeAction, summarizeSingle } from './humanizeAudit';
import { historyChanges, dayHeading, timeOfDay } from '@/lib/complaintHistoryLabels';

import { History, Loader2, RefreshCw, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityId: string;
  title?: string;
}

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  user_id: string | null;
  user_role: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown> | null;
}

interface ComplianceRow {
  entry_id: string;
  timestamp: string;
  action_type: string;
  user_id: string | null;
  user_role: string | null;
  before_value: unknown;
  after_value: unknown;
  metadata: Record<string, unknown> | null;
}

type TimelineEntry =
  | { kind: 'audit'; row: AuditRow }
  | { kind: 'compliance'; row: ComplianceRow }
  | { kind: 'override'; row: RuleOverrideRow };

function ts(e: TimelineEntry): string {
  if (e.kind === 'compliance') return e.row.timestamp;
  return e.row.created_at;
}

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-success/15 text-success border-success/30',
  UPDATE: 'bg-info/15 text-info border-info/30',
  DELETE: 'bg-destructive/15 text-destructive border-destructive/30',
  APPROVE: 'bg-success/15 text-success border-success/30',
  REJECT: 'bg-destructive/15 text-destructive border-destructive/30',
  RULE_OVERRIDE: 'bg-warning/15 text-warning border-warning/30',
  OVERRIDE: 'bg-warning/15 text-warning border-warning/30',
  EXPORT: 'bg-primary/15 text-primary border-primary/30',
  WORKFLOW_TRANSITION: 'bg-info/15 text-info border-info/30',
};

function badgeClass(action: string): string {
  if (ACTION_BADGE[action]) return ACTION_BADGE[action];
  const a = action.toLowerCase();
  if (a.includes('approve') || a.includes('submit') || a.includes('create')) return ACTION_BADGE.CREATE;
  if (a.includes('reject') || a.includes('delete') || a.includes('withdraw')) return ACTION_BADGE.REJECT;
  if (a.includes('override')) return ACTION_BADGE.RULE_OVERRIDE;
  if (a.includes('status') || a.includes('workflow') || a.includes('assign')) return ACTION_BADGE.WORKFLOW_TRANSITION;
  return 'bg-muted text-muted-foreground border-border';
}

/**
 * Change list written as sentences for non-technical readers. Internal
 * identifiers are hidden; the raw payload stays behind a "Technical details"
 * toggle.
 */
const ChangeSummary = forwardRef<HTMLDivElement, { before: unknown; after: unknown }>(function ChangeSummary(
  { before, after },
  ref,
) {
  const [showRaw, setShowRaw] = useState(false);
  const changes = useMemo(() => historyChanges(before, after), [before, after]);
  const singleAfter = changes.length === 0 ? summarizeSingle(after) : null;
  const singleBefore = changes.length === 0 && !singleAfter ? summarizeSingle(before) : null;
  const hasRaw = (before !== null && before !== undefined) || (after !== null && after !== undefined);

  if (changes.length === 0 && !singleAfter && !singleBefore && !hasRaw) {
    return null;
  }

  return (
    <div ref={ref} className="mt-2 space-y-1.5">
      {changes.length > 0 && (
        <ul className="space-y-1 rounded bg-muted/40 p-2 text-xs">
          {changes.map((c) => (
            <li key={c.key}>
              <span className="font-medium text-foreground/80">{c.label}:</span>{' '}
              {c.before ? (
                <span className="text-muted-foreground">
                  changed from <span className="text-foreground">{c.before}</span> to{' '}
                  <span className="font-medium text-foreground">{c.after ?? 'not set'}</span>
                </span>
              ) : (
                <span className="font-medium text-foreground">{c.after ?? 'not set'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {singleAfter && (
        <div className="rounded bg-muted/40 p-2 text-sm text-foreground whitespace-pre-wrap">
          {singleAfter}
        </div>
      )}
      {singleBefore && !singleAfter && (
        <div className="rounded bg-muted/40 p-2 text-sm text-muted-foreground whitespace-pre-wrap">
          {singleBefore}
        </div>
      )}
      {changes.length === 0 && !singleAfter && !singleBefore && (
        <p className="text-xs text-muted-foreground">No business fields changed in this entry.</p>
      )}
      {hasRaw && (
        <button
          type="button"
          onClick={() => setShowRaw((s) => !s)}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Technical details
        </button>
      )}
      {showRaw && (
        <pre className="rounded bg-muted/60 p-2 text-[10px] leading-tight overflow-auto max-h-48">
{JSON.stringify({ before, after }, null, 2)}
        </pre>
      )}
    </div>
  );
});


/**
 * Right-side drawer showing the change timeline for a single domain entity,
 * merging audit_logs + compliance_audit_logs + rule_overrides. Rows render
 * as plain English (action label, actor name, key/value change list) instead
 * of raw JSON — the raw payload is still available under a "Technical
 * details" toggle for power users.
 */
export function ChangeHistoryDrawer({ open, onOpenChange, entityType, entityId, title }: Props) {
  const [loading, setLoading] = useState(false);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [overrides, setOverrides] = useState<RuleOverrideRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [aRes, cRes, oRes] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('id, created_at, action, user_id, user_role, old_value, new_value, metadata')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
          .limit(200),
        (supabase.from('compliance_audit_logs') as any)
          .select('entry_id, timestamp, action_type, user_id, user_role, before_value, after_value, metadata')
          .eq('object_type', entityType)
          .eq('object_id', entityId)
          .order('timestamp', { ascending: false })
          .limit(200),
        fetchOverridesForEntity(entityType, entityId).catch(() => [] as RuleOverrideRow[]),
      ]);
      if (aRes.error) throw aRes.error;
      const auditRows = (aRes.data ?? []) as AuditRow[];
      const complianceRows = (cRes.data ?? []) as ComplianceRow[];
      setAudits(auditRows);
      setCompliance(complianceRows);
      setOverrides(oRes);

      // Resolve user names in one batch
      const ids = new Set<string>();
      auditRows.forEach((r) => r.user_id && ids.add(r.user_id));
      complianceRows.forEach((r) => r.user_id && ids.add(r.user_id));
      oRes.forEach((r) => r.user_id && ids.add(r.user_id));
      if (ids.size > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', Array.from(ids));
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => {
          const name = (p.full_name || '').trim() || p.email || '';
          if (name) map[p.id] = name;
        });
        setNameById(map);
      } else {
        setNameById({});
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && entityType && entityId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityType, entityId]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const overrideIds = new Set(overrides.map((o) => o.id));
    const filteredAudits = audits.filter((a) => {
      const mid = (a.metadata as any)?.override_id;
      return !(a.action === 'RULE_OVERRIDE' && typeof mid === 'string' && overrideIds.has(mid));
    });
    /** Same event written to both audit tables — keep one copy. */
    const auditSignatures = new Set(
      filteredAudits.map((a) => `${String(a.action).toLowerCase()}|${a.created_at.slice(0, 16)}`),
    );
    const filteredCompliance = compliance.filter(
      (c) => !auditSignatures.has(`${String(c.action_type).toLowerCase()}|${String(c.timestamp).slice(0, 16)}`),
    );
    const merged: TimelineEntry[] = [
      ...filteredAudits.map((row) => ({ kind: 'audit' as const, row })),
      ...filteredCompliance.map((row) => ({ kind: 'compliance' as const, row })),
      ...overrides.map((row) => ({ kind: 'override' as const, row })),
    ];
    merged.sort((a, b) => ts(b).localeCompare(ts(a)));
    return merged;
  }, [audits, compliance, overrides]);

  function actorLabel(userId: string | null, userRole: string | null): string {
    if (!userId) return 'System';
    return nameById[userId] || userRole || 'User';
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {title ?? 'Change history'}
          </SheetTitle>
          <SheetDescription>Full technical audit trail, including field-level changes and overrides.</SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${timeline.length} event${timeline.length === 1 ? '' : 's'}`}
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {!loading && timeline.length === 0 && (
            <p className="text-sm text-muted-foreground">No history recorded for this record yet.</p>
          )}

          {timeline.map((e, idx) => {
            const day = dayHeading(ts(e));
            const showDay = idx === 0 || dayHeading(ts(timeline[idx - 1])) !== day;
            const key =
              e.kind === 'override' ? `o-${e.row.id}` : e.kind === 'compliance' ? `c-${e.row.entry_id}` : `a-${e.row.id}`;
            return (
              <div key={key} className="space-y-2">
                {showDay && (
                  <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</p>
                )}
                {e.kind === 'override' ? (
                  <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-warning" />
                        <Badge variant="outline" className={badgeClass('RULE_OVERRIDE')}>Rule override</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{timeOfDay(e.row.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      By {actorLabel(e.row.user_id, e.row.user_role)} · rule{' '}
                      {String(e.row.rule_key || '').replace(/[._]/g, ' ')} ({String(e.row.module || '').replace(/_/g, ' ')})
                    </div>
                    <div className="mt-2 rounded bg-background/70 p-2 text-sm">
                      <div className="text-[10px] uppercase text-muted-foreground">Reason given</div>
                      <div className="whitespace-pre-wrap">{e.row.reason}</div>
                    </div>
                    <ChangeSummary before={e.row.original_value} after={e.row.overridden_value} />
                  </div>
                ) : e.kind === 'compliance' ? (
                  <div className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="outline" className={badgeClass(e.row.action_type)}>
                        {humanizeAction(e.row.action_type)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{timeOfDay(e.row.timestamp)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      By {actorLabel(e.row.user_id, e.row.user_role)}
                    </div>
                    <ChangeSummary before={e.row.before_value} after={e.row.after_value} />
                  </div>
                ) : (
                  <div className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="outline" className={badgeClass(e.row.action)}>
                        {humanizeAction(e.row.action)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{timeOfDay(e.row.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      By {actorLabel(e.row.user_id, e.row.user_role)}
                    </div>
                    <ChangeSummary before={e.row.old_value} after={e.row.new_value} />
                  </div>
                )}
              </div>
            );
          })}

        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ChangeHistoryDrawer;
