import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { fetchOverridesForEntity, type RuleOverrideRow } from '@/lib/ruleOverrides';
import { DiffViewer } from './DiffViewer';
import { History, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';

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

type TimelineEntry =
  | { kind: 'audit'; row: AuditRow }
  | { kind: 'override'; row: RuleOverrideRow };

function ts(e: TimelineEntry): string {
  return e.kind === 'audit' ? e.row.created_at : e.row.created_at;
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

/**
 * Reusable right-side drawer showing the full change timeline for a single
 * domain entity: audit_logs entries + rule_overrides entries, merged and
 * sorted chronologically. Uses the existing `audit_logs.old_value` /
 * `new_value` JSON blobs — no schema changes to the audit table.
 */
export function ChangeHistoryDrawer({ open, onOpenChange, entityType, entityId, title }: Props) {
  const [loading, setLoading] = useState(false);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [overrides, setOverrides] = useState<RuleOverrideRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [aRes, oRes] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('id, created_at, action, user_id, user_role, old_value, new_value, metadata')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
          .limit(200),
        fetchOverridesForEntity(entityType, entityId).catch(() => [] as RuleOverrideRow[]),
      ]);
      if (aRes.error) throw aRes.error;
      setAudits((aRes.data ?? []) as AuditRow[]);
      setOverrides(oRes);
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
    // De-dupe: the RPC mirrors overrides into audit_logs with action=RULE_OVERRIDE and
    // metadata.override_id. Drop the mirrored audit row so the override renders once,
    // richer, with rule_key + reason.
    const filteredAudits = audits.filter((a) => {
      const mid = (a.metadata as any)?.override_id;
      return !(a.action === 'RULE_OVERRIDE' && typeof mid === 'string' && overrideIds.has(mid));
    });
    const merged: TimelineEntry[] = [
      ...filteredAudits.map((row) => ({ kind: 'audit' as const, row })),
      ...overrides.map((row) => ({ kind: 'override' as const, row })),
    ];
    merged.sort((a, b) => ts(b).localeCompare(ts(a)));
    return merged;
  }, [audits, overrides]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {title ?? 'Change history'}
          </SheetTitle>
          <SheetDescription>
            {entityType} · <span className="font-mono text-xs">{entityId}</span>
          </SheetDescription>
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

          {timeline.map((e) => {
            if (e.kind === 'override') {
              const o = e.row;
              return (
                <div key={`o-${o.id}`} className="rounded-md border border-warning/40 bg-warning/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-warning" />
                      <Badge variant="outline" className={ACTION_BADGE.RULE_OVERRIDE}>
                        Override
                      </Badge>
                      <span className="text-xs font-mono">{o.rule_key}</span>
                      <Badge variant="outline" className="text-[10px]">{o.module}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {o.user_role ?? 'user'} · <span className="font-mono">{o.user_id?.slice(0, 8) ?? '—'}</span>
                  </div>
                  <div className="mt-2 rounded bg-background/70 p-2 text-sm">
                    <div className="text-[10px] uppercase text-muted-foreground">Reason</div>
                    <div className="whitespace-pre-wrap">{o.reason}</div>
                  </div>
                  <div className="mt-2">
                    <DiffViewer before={o.original_value} after={o.overridden_value} compact />
                  </div>
                </div>
              );
            }
            const a = e.row;
            return (
              <div key={`a-${a.id}`} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={ACTION_BADGE[a.action] ?? 'bg-muted text-muted-foreground'}
                    >
                      {a.action}
                    </Badge>
                    {a.user_role && <Badge variant="outline" className="text-[10px]">{a.user_role}</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground font-mono">
                  {a.user_id ? a.user_id.slice(0, 8) : 'system'}
                </div>
                <div className="mt-2">
                  <DiffViewer before={a.old_value} after={a.new_value} compact />
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ChangeHistoryDrawer;
