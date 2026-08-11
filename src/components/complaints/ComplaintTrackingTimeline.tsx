// Complaint case history (v3) — one plain-language story of the case.
//
// Merges three sources so the tab is never empty for a case that exists:
//   1. workflow actions + enforcement events (`get_complaint_tracking`)
//   2. the complaint audit trail (`audit_logs` via useEntityAuditLog)
// Step progress is rendered as a readable Done / You are here / Next list.
//
// Same public props as the previous component so existing pages don't break.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, CheckCircle2, Circle, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { useEntityAuditLog } from "@/hooks/useEntityAuditLog";
import {
  complaintActionLabel,
  groupByDay,
  historyChanges,
  timeOfDay,
  type CaseHistoryEntry,
} from "@/lib/complaintHistoryLabels";
import { formatDateTime } from "@/lib/datetime";
import { QueryErrorState } from "@/components/complaints/QueryErrorState";

interface Props {
  complaintId: string;
  // Kept for backwards compatibility; ignored — the RPC handles enforcement.
  enforcementId?: string | null;
}

interface Step {
  step_key: string;
  label: string;
  order: number;
  is_current: boolean;
  is_terminal: boolean;
  is_start: boolean;
}

interface Event {
  source: "workflow" | "enforcement";
  when: string;
  title: string;
  note: string | null;
  actor: string | null;
}

interface Tracking {
  complaint_number: string;
  status: string;
  current_step_key: string | null;
  current_step_label: string | null;
  assigned_user_name: string | null;
  assigned_role: string | null;
  due_at: string | null;
  sla_status: string;
  instance_updated_at: string | null;
  steps: Step[];
  events: Event[];
  is_internal: boolean;
  error?: string;
}

export function ComplaintTrackingTimeline({ complaintId }: Props) {
  const q = useQuery({
    queryKey: ["complaint_tracking", complaintId],
    enabled: !!complaintId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_complaint_tracking", { _complaint_id: complaintId });
      if (error) throw error;
      return (data || {}) as Tracking;
    },
  });

  const auditQ = useEntityAuditLog({ entityType: "complaint", entityId: complaintId });

  const t = q.data;

  const entries = useMemo<CaseHistoryEntry[]>(() => {
    const out: CaseHistoryEntry[] = [];
    (t?.events ?? []).forEach((e, idx) => {
      if (!e?.when) return;
      out.push({
        id: `wf-${idx}-${e.when}`,
        when: e.when,
        title: e.title || (e.source === "enforcement" ? "Enforcement activity" : "Workflow action"),
        actor: e.actor,
        note: e.note,
        source: e.source,
        changes: [],
      });
    });
    (auditQ.data ?? []).forEach((r) => {
      out.push({
        id: `au-${r.id}`,
        when: r.created_at,
        title: complaintActionLabel(r.action),
        actor: r.actor_name || null,
        note:
          (r.new_value as any)?.comments ||
          (r.new_value as any)?.reason ||
          (r.metadata as any)?.comments ||
          (r.metadata as any)?.reason ||
          null,
        source: "audit",
        changes: historyChanges(r.old_value, r.new_value),
        raw: { before: r.old_value, after: r.new_value, metadata: r.metadata },
      });
    });
    /** Same event recorded in both the workflow and the audit trail — keep one. */
    const seen = new Set<string>();
    const deduped: CaseHistoryEntry[] = [];
    out
      .sort((a, b) => String(b.when).localeCompare(String(a.when)))
      .forEach((e) => {
        const sig = `${e.title.toLowerCase()}|${String(e.when).slice(0, 16)}`;
        if (seen.has(sig)) return;
        seen.add(sig);
        deduped.push(e);
      });
    return deduped;
  }, [t?.events, auditQ.data]);

  const grouped = useMemo(() => groupByDay(entries), [entries]);

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the case history…
        </CardContent>
      </Card>
    );
  }

  if (q.isError) {
    return (
      <QueryErrorState
        title="We couldn’t load the case history"
        message="The case history could not be loaded. Please try again."
        onRetry={() => q.refetch()}
      />
    );
  }

  if (!t || t.error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {t?.error === "FORBIDDEN"
            ? "You don't have permission to view this complaint's history."
            : "History information is unavailable right now."}
        </CardContent>
      </Card>
    );
  }

  const steps = [...(t.steps || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const currentIdx = steps.findIndex((s) => s.is_current);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Progress so far
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Where this complaint sits today, and what comes next.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Current stage</p>
              <p className="font-medium mt-0.5">{t.current_step_label || "Not started"}</p>
            </div>
            {t.is_internal && (
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Being handled by</p>
                <p className="font-medium mt-0.5">{t.assigned_user_name || t.assigned_role || "Not assigned yet"}</p>
              </div>
            )}
            {t.is_internal && t.due_at && (
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Response due</p>
                <p className="font-medium mt-0.5">{formatDateTime(t.due_at)}</p>
                {t.sla_status && (
                  <Badge
                    className="mt-1"
                    variant={t.sla_status === "overdue" ? "destructive" : t.sla_status === "at_risk" ? "outline" : "secondary"}
                  >
                    {t.sla_status === "overdue" ? "Overdue" : t.sla_status === "at_risk" ? "Due soon" : "On track"}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {steps.length > 0 && (
            <ol className="space-y-1.5">
              {steps.map((s, idx) => {
                const done = currentIdx >= 0 && idx < currentIdx;
                const isCurrent = s.is_current;
                return (
                  <li
                    key={s.step_key}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      isCurrent ? "border-primary bg-primary/5 font-medium" : "border-border"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <Circle className={`h-4 w-4 shrink-0 ${isCurrent ? "text-primary" : "text-muted-foreground"}`} />
                    )}
                    <span className={done ? "text-muted-foreground" : ""}>{s.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {done ? "Done" : isCurrent ? "You are here" : "Not started"}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> What has happened on this case
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Every recorded action, newest first — including intake, triage, assignment and decisions.
            {auditQ.isError ? " Some activity could not be loaded." : ""}
          </p>
        </CardHeader>
        <CardContent className="text-sm">
          {auditQ.isError && entries.length === 0 ? (
            <QueryErrorState
              title="We couldn’t load the case activity"
              message="Recorded activity could not be loaded. Please try again."
              onRetry={() => auditQ.refetch()}
              compact
            />
          ) : auditQ.isLoading && entries.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-muted-foreground">
              Nothing has been recorded on this case yet. Activity will appear here as soon as the first action is taken.
            </p>
          ) : (
            <div className="space-y-5">
              {grouped.map((group) => (
                <div key={group.day}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.day}</p>
                  <ol className="relative border-l pl-4 space-y-3">
                    {group.entries.map((e) => (
                      <li key={e.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full bg-primary" />
                        <HistoryEntryRow entry={e} />
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryEntryRow({ entry }: { entry: CaseHistoryEntry }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{entry.title}</span>
        <span className="text-xs text-muted-foreground">
          {timeOfDay(entry.when)}
          {entry.actor ? ` · by ${entry.actor}` : ""}
        </span>
        {entry.source === "enforcement" && (
          <Badge variant="destructive" className="text-[10px]">Enforcement</Badge>
        )}
      </div>

      {entry.changes.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {entry.changes.slice(0, 6).map((c) => (
            <li key={c.key} className="text-xs text-muted-foreground">
              <span className="text-foreground/80">{c.label}:</span>{" "}
              {c.before ? (
                <>
                  changed from <span className="text-foreground">{c.before}</span> to{" "}
                  <span className="text-foreground font-medium">{c.after ?? "not set"}</span>
                </>
              ) : (
                <span className="text-foreground font-medium">{c.after ?? "not set"}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {entry.note && (
        <p className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted/40 px-2 py-1 text-sm">
          {entry.note}
        </p>
      )}

      {entry.raw && (
        <>
          <button
            type="button"
            onClick={() => setShowRaw((s) => !s)}
            className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Technical details
          </button>
          {showRaw && (
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/60 p-2 text-[10px] leading-tight">
              {JSON.stringify(entry.raw, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

export default ComplaintTrackingTimeline;
