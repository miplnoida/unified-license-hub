// Complaint tracking timeline — aggregates complaint audit logs and any
// linked enforcement case events into a single, human-readable timeline that
// both regulators and complainants/licensees can follow.
//
// Data sources:
//   - audit_logs (action starts with "complaint.")
//   - enforcement_case_events (when the complaint has been escalated)
//
// Read-only view. Uses only tables already exposed to complainants /
// licensee users through existing RLS.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock } from "lucide-react";

interface Props {
  complaintId: string;
  enforcementId?: string | null;
}

interface TimelineEntry {
  id: string;
  when: string;
  actor: string;
  title: string;
  detail?: string | null;
  source: "complaint" | "enforcement";
}

const COMPLAINT_ACTION_LABELS: Record<string, string> = {
  "complaint.filed": "Complaint filed",
  "complaint.submitted": "Complaint submitted",
  "complaint.assigned": "Assigned to investigator",
  "complaint.investigation_started": "Investigation started",
  "complaint.severity_updated": "Severity updated",
  "complaint.resolved": "Marked resolved",
  "complaint.closed": "Complaint closed",
  "complaint.reopened": "Complaint reopened",
  "complaint.licensee_linked": "Licensee mapped",
  "complaint.escalated_to_enforcement": "Escalated to enforcement",
};

const ENFORCEMENT_EVENT_LABELS: Record<string, string> = {
  case_opened: "Enforcement case opened",
  notice_issued: "Notice issued to licensee",
  response_received: "Licensee response recorded",
  decision_recorded: "Decision recorded",
  payment_received: "Penalty payment recorded",
  case_closed: "Enforcement case closed",
  case_withdrawn: "Enforcement case withdrawn",
  appeal_filed: "Appeal filed",
};

function humanLabel(map: Record<string, string>, key: string): string {
  return map[key] || key.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ComplaintTrackingTimeline({ complaintId, enforcementId }: Props) {
  const auditQ = useQuery({
    queryKey: ["complaint_timeline_audit", complaintId],
    enabled: !!complaintId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, created_at, user_id, meta")
        .eq("entity_type", "complaint")
        .eq("entity_id", complaintId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data || []) as any[];
      const actorIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
      const profMap = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", actorIds);
        (profs || []).forEach((p: any) => profMap.set(p.id, p.full_name || p.email || "Staff"));
      }
      return rows
        .filter((r) => typeof r.action === "string" && r.action.startsWith("complaint."))
        .map<TimelineEntry>((r) => ({
          id: `c:${r.id}`,
          when: r.created_at,
          actor: r.user_id ? (profMap.get(r.user_id) || "Staff") : "System",
          title: humanLabel(COMPLAINT_ACTION_LABELS, r.action),
          detail:
            (r.meta && typeof r.meta === "object" && (r.meta.reason || r.meta.note || r.meta.resolution || r.meta.findings)) ||
            null,
          source: "complaint",
        }));
    },
  });

  const enforcementQ = useQuery({
    queryKey: ["complaint_timeline_enforcement", enforcementId],
    enabled: !!enforcementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enforcement_case_events")
        .select("id, event_type, note, created_at, actor_id")
        .eq("case_id", enforcementId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data || []) as any[];
      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean)));
      const profMap = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", actorIds);
        (profs || []).forEach((p: any) => profMap.set(p.id, p.full_name || p.email || "Staff"));
      }
      return rows.map<TimelineEntry>((r) => ({
        id: `e:${r.id}`,
        when: r.created_at,
        actor: r.actor_id ? (profMap.get(r.actor_id) || "Staff") : "System",
        title: humanLabel(ENFORCEMENT_EVENT_LABELS, r.event_type),
        detail: r.note || null,
        source: "enforcement",
      }));
    },
  });

  const loading = auditQ.isLoading || enforcementQ.isLoading;
  const entries: TimelineEntry[] = [
    ...(auditQ.data ?? []),
    ...(enforcementQ.data ?? []),
  ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Progress Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
          </div>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ol className="relative border-l pl-4 space-y-4">
            {entries.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-primary" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{e.title}</span>
                  <Badge variant={e.source === "enforcement" ? "destructive" : "secondary"} className="text-[10px]">
                    {e.source === "enforcement" ? "Enforcement" : "Complaint"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.when).toLocaleString()} · by {e.actor}
                </p>
                {e.detail && (
                  <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{e.detail}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default ComplaintTrackingTimeline;
