import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { History, Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import {
  labelForReturnActivity,
  summarizeReturnActivityMetadata,
} from '@/lib/returnActivityLogger';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnId: string;
  title?: string;
}

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  previous_step_id: string | null;
  new_step_id: string | null;
  comments: string | null;
  event_key: string | null;
  performed_by: string | null;
  metadata: Record<string, any> | null;
}

interface ApprovalRow {
  id: string;
  created_at: string;
  action_type: string;
  comments: string | null;
  actor_id: string | null;
}

type Entry =
  | { kind: 'audit'; row: AuditRow }
  | { kind: 'approval'; row: ApprovalRow };

const APPROVAL_LABELS: Record<string, string> = {
  approve: 'Approved',
  approved: 'Approved',
  reject: 'Rejected',
  rejected: 'Rejected',
  forward: 'Forwarded',
  return: 'Returned for edits',
  request_edit: 'Edit requested',
  request_info: 'Information requested',
  submit: 'Submitted',
  resubmit: 'Resubmitted',
};

function actionBadgeClass(kind: 'audit' | 'approval', action: string): string {
  const a = action.toLowerCase();
  if (kind === 'approval') {
    if (a.includes('approve')) return 'bg-success/15 text-success border-success/30';
    if (a.includes('reject')) return 'bg-destructive/15 text-destructive border-destructive/30';
    if (a.includes('return') || a.includes('edit')) return 'bg-warning/15 text-warning border-warning/30';
    return 'bg-info/15 text-info border-info/30';
  }
  if (a.includes('submit') || a.includes('resubmit')) return 'bg-info/15 text-info border-info/30';
  if (a.includes('approve')) return 'bg-success/15 text-success border-success/30';
  if (a.includes('reject') || a.includes('cancel')) return 'bg-destructive/15 text-destructive border-destructive/30';
  if (a.includes('edit') || a.includes('request')) return 'bg-warning/15 text-warning border-warning/30';
  return 'bg-primary/10 text-primary border-primary/30';
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="font-mono text-[11px] rounded bg-muted px-1.5 py-0.5 border border-border">
      {label || '—'}
    </span>
  );
}

/**
 * Return-specific history drawer. Merges `return_audit_log` and
 * `approval_actions` chronologically and renders each event as normal
 * human-readable text — no JSON blocks.
 */
export function ReturnHistoryDrawer({ open, onOpenChange, returnId, title }: Props) {
  const [loading, setLoading] = useState(false);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [aRes, pRes] = await Promise.all([
        (supabase as any)
          .from('return_audit_log')
          .select('*')
          .eq('return_id', returnId)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('approval_actions')
          .select('id, action_type, comments, created_at, actor_id')
          .eq('entity_type', 'return')
          .eq('entity_id', returnId)
          .order('created_at', { ascending: false }),
      ]);
      if (aRes.error) throw aRes.error;
      const auditRows = (aRes.data ?? []) as AuditRow[];
      const approvalRows = (pRes.data ?? []) as ApprovalRow[];
      setAudits(auditRows);
      setApprovals(approvalRows);

      const ids = Array.from(
        new Set(
          [
            ...auditRows.map((r) => r.performed_by),
            ...approvalRows.map((r) => r.actor_id),
          ].filter((v): v is string => !!v),
        ),
      );
      if (ids.length) {
        const { data: profs } = await (supabase as any)
          .from('profiles')
          .select('id, full_name, email')
          .in('id', ids);
        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => {
          map[p.id] = p.full_name || p.email || p.id.slice(0, 8);
        });
        setActorNames(map);
      } else {
        setActorNames({});
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && returnId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, returnId]);

  const timeline = useMemo<Entry[]>(() => {
    const merged: Entry[] = [
      ...audits.map((row) => ({ kind: 'audit' as const, row })),
      ...approvals.map((row) => ({ kind: 'approval' as const, row })),
    ];
    merged.sort((a, b) => (b.kind === 'audit' ? b.row.created_at : b.row.created_at)
      .localeCompare(a.kind === 'audit' ? a.row.created_at : a.row.created_at));
    return merged;
  }, [audits, approvals]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {title ?? 'Return history'}
          </SheetTitle>
          <SheetDescription>
            Complete activity trail for this return.
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
            <p className="text-sm text-muted-foreground">No activity recorded for this return yet.</p>
          )}

          {timeline.map((e) => {
            if (e.kind === 'approval') {
              const r = e.row;
              const label = APPROVAL_LABELS[r.action_type?.toLowerCase()] ??
                r.action_type.replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <div key={`p-${r.id}`} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge variant="outline" className={actionBadgeClass('approval', r.action_type)}>
                      {label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    by <span className="text-foreground">{r.actor_id ? (actorNames[r.actor_id] || 'User') : 'System'}</span>
                  </div>
                  {r.comments && (
                    <p className="mt-2 text-sm bg-muted/40 border border-border rounded px-2 py-1 whitespace-pre-wrap">
                      {r.comments}
                    </p>
                  )}
                </div>
              );
            }

            const a = e.row;
            const label = labelForReturnActivity(a.action);
            const statusChanged = (a.previous_status || a.new_status) && a.previous_status !== a.new_status;
            const metaLines = summarizeReturnActivityMetadata({
              action: a.action,
              metadata: a.metadata || {},
              event_key: a.event_key,
            } as any);

            return (
              <div key={`a-${a.id}`} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Badge variant="outline" className={actionBadgeClass('audit', a.action)}>
                    {label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  by <span className="text-foreground">{a.performed_by ? (actorNames[a.performed_by] || 'User') : 'System'}</span>
                </div>

                {statusChanged && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Status:</span>
                    <StatusPill label={a.previous_status || '—'} />
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <StatusPill label={a.new_status || '—'} />
                  </div>
                )}

                {a.comments && (
                  <p className="mt-2 text-sm bg-muted/40 border border-border rounded px-2 py-1 whitespace-pre-wrap">
                    {a.comments}
                  </p>
                )}

                {metaLines.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {metaLines.map((line, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-muted-foreground/80">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ReturnHistoryDrawer;
