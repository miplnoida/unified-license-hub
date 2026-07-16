// Complaint tracking timeline (v2) — uses the `get_complaint_tracking` RPC so
// that step progress, current assignee, SLA and event visibility are governed
// server-side by the Complaint Management Workflow configuration.
//
// Same public props as the previous component so existing pages don't break.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, CheckCircle2, Dot } from "lucide-react";

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
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_complaint_tracking", { _complaint_id: complaintId });
      if (error) throw error;
      return (data || {}) as Tracking;
    },
  });

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading progress…
        </CardContent>
      </Card>
    );
  }

  const t = q.data;
  if (!t || t.error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {t?.error === "FORBIDDEN" ? "You don't have access to this complaint's tracking." : "Progress information unavailable."}
        </CardContent>
      </Card>
    );
  }

  const steps = t.steps || [];
  const events = t.events || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Current Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Current Step</div>
              <div className="font-medium">{t.current_step_label || "—"}</div>
            </div>
            {t.is_internal && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground">Assignee</div>
                  <div className="font-medium">{t.assigned_user_name || t.assigned_role || "—"}</div>
                </div>
                {t.due_at && (
                  <div>
                    <div className="text-xs text-muted-foreground">SLA Due</div>
                    <div className="font-medium">{new Date(t.due_at).toLocaleString()}</div>
                  </div>
                )}
                {t.sla_status && (
                  <div>
                    <div className="text-xs text-muted-foreground">SLA Status</div>
                    <Badge variant={t.sla_status === "overdue" ? "destructive" : t.sla_status === "at_risk" ? "outline" : "secondary"}>
                      {t.sla_status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                )}
              </>
            )}
          </div>

          {steps.length > 0 && (
            <ol className="flex flex-wrap gap-2 pt-2">
              {steps.map((s) => (
                <li
                  key={s.step_key}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs ${
                    s.is_current
                      ? "border-primary bg-primary/10 font-medium"
                      : s.is_terminal
                      ? "border-muted bg-muted/40 text-muted-foreground"
                      : "border-muted"
                  }`}
                >
                  {s.is_terminal ? <CheckCircle2 className="h-3 w-3" /> : <Dot className="h-3 w-3" />}
                  {s.label}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {events.length === 0 ? (
            <p className="text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ol className="relative border-l pl-4 space-y-4">
              {events.map((e, idx) => (
                <li key={idx} className="relative">
                  <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-primary" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{e.title}</span>
                    <Badge variant={e.source === "enforcement" ? "destructive" : "secondary"} className="text-[10px]">
                      {e.source === "enforcement" ? "Enforcement" : "Complaint"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.when).toLocaleString()}
                    {e.actor ? ` · by ${e.actor}` : ""}
                  </p>
                  {e.note && <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{e.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ComplaintTrackingTimeline;
