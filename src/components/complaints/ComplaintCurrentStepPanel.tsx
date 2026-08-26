/**
 * Guided "Current step" panel for the complaint workspace.
 *
 * MC-03: the complaint no longer carries a step-action controller. The canonical
 * Market Conduct workflow advances on domain events, so this panel renders the
 * read-only phase panel (`complaint_workflow_state`) plus supporting readiness
 * (work items, information requests, closure/QA) and routes the officer to the
 * one workspace where each decision is actually recorded.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, Check, Circle, Clock, Loader2 } from 'lucide-react';
import { useComplaintRfis } from '@/hooks/useComplaintRfis';
import { ComplaintPhasePanel } from '@/components/complaints/ComplaintPhasePanel';

import { complaintStatusLabel, complaintStatusVariant } from '@/lib/complaintStatus';
import { formatDateOnly } from '@/lib/datetime';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { UnavailableStatus } from '@/components/complaints/DataState';
import {
  buildReadiness,
  deriveWaitingState,
  isClosurePhaseRelevant,
  summariseClosure,
  summariseRfis,
  summariseTasks,
  type CaseWorkSection,
  type ComplaintTracking,
  type WorkflowAction,
} from '@/lib/complaintWorkflow';

interface Props {
  complaintId: string;
  status: string | null | undefined;
  licenseeId: string | null | undefined;
  onOpenSection: (section: CaseWorkSection) => void;
}

export function useComplaintCurrentStepData(complaintId: string) {
  // Shared query keys + staleTime so Overview, Current step, Closure section and
  // the history tab reuse one cached result instead of refiring the RPCs.
  const trackingQ = useQuery({
    queryKey: ['complaint_tracking', complaintId],
    enabled: !!complaintId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_complaint_tracking', { _complaint_id: complaintId });
      if (error) throw error;
      return (data || {}) as ComplaintTracking;
    },
  });

  const actionsQ = useQuery({
    queryKey: ['complaint_actions', complaintId],
    enabled: !!complaintId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_complaint_available_actions', { _complaint_id: complaintId });
      if (error) throw error;
      return (data || []) as WorkflowAction[];
    },
  });

  const tasksQ = useQuery({
    queryKey: ['complaint_tasks', complaintId],
    enabled: !!complaintId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_investigation_tasks')
        .select('*')
        .eq('complaint_id', complaintId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const closureQ = useQuery({
    queryKey: ['complaint_closure_reviews', complaintId],
    enabled: !!complaintId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_closure_reviews')
        .select('*')
        .eq('complaint_id', complaintId)
        .order('decided_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rfisQ = useComplaintRfis(complaintId);

  return { trackingQ, actionsQ, tasksQ, closureQ, rfisQ };
}

export function ComplaintCurrentStepPanel({ complaintId, status, licenseeId, onOpenSection }: Props) {
  const { trackingQ, actionsQ, tasksQ, closureQ, rfisQ } = useComplaintCurrentStepData(complaintId);

  const tracking = trackingQ.data ?? null;
  const actions = actionsQ.data ?? [];
  // Supporting data is only allowed to drive conclusions once it loaded.
  const tasksOk = !tasksQ.isError && !tasksQ.isLoading;
  const rfiOk = !rfisQ.isError && !rfisQ.isLoading;
  const closureOk = !closureQ.isError && !closureQ.isLoading;
  const tasks = summariseTasks(tasksQ.data as any);
  const rfi = summariseRfis(rfisQ.data as any);
  const closure = summariseClosure(closureQ.data as any);
  const closurePhase = closureOk && isClosurePhaseRelevant(actions, status, closure);
  const readiness = buildReadiness({
    tracking,
    tasks,
    rfi,
    closure,
    closurePhase,
    hasLicensee: !!licenseeId,
  }).filter((item) => {
    if (item.key === 'tasks') return tasksOk;
    if (item.key === 'rfi') return rfiOk;
    if (item.key === 'closure') return closureOk;
    return true;
  });
  const unavailable: Array<{ key: string; label: string; retry: () => void }> = [];
  if (tasksQ.isError) unavailable.push({ key: 'tasks', label: 'Investigation task status unavailable', retry: () => tasksQ.refetch() });
  if (rfisQ.isError) unavailable.push({ key: 'rfi', label: 'Information request status unavailable', retry: () => rfisQ.refetch() });
  if (closureQ.isError) unavailable.push({ key: 'closure', label: 'Closure status unavailable', retry: () => closureQ.refetch() });
  const waiting = rfiOk && closureOk
    ? deriveWaitingState({ actions, rfi, closure, closurePhase, tracking })
    : null;

  // Core data for this panel: workflow tracking + available actions.
  if (trackingQ.isLoading || (actionsQ.isLoading && !actionsQ.data)) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Working out where this case stands…
        </CardContent>
      </Card>
    );
  }

  if (trackingQ.isError || actionsQ.isError) {
    return (
      <QueryErrorState
        title="We couldn’t load the current step"
        message="The workflow position for this complaint could not be loaded. Please try again."
        onRetry={() => {
          if (trackingQ.isError) trackingQ.refetch();
          if (actionsQ.isError) actionsQ.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Canonical, read-only Market Conduct phase. Progression is driven by the
          business decision recorded in the owning workspace, never from here. */}
      <ComplaintPhasePanel complaintId={complaintId} onOpenSection={onOpenSection} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Case status</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Case status describes the complaint itself; the phase above describes where it sits in the Market Conduct
            complaint workflow.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={complaintStatusVariant(status)}>{complaintStatusLabel(status)}</Badge>

          {waiting && (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
                <Clock className="h-4 w-4" />{waiting.label}
              </p>
              {waiting.detail && <p className="text-xs text-muted-foreground mt-1">{waiting.detail}</p>}
            </div>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Outstanding work on this case</CardTitle>
          <p className="text-xs text-muted-foreground">
            Items marked <em>recommended</em> are good practice; the workflow itself decides what is mandatory before
            the next step. Investigation work items track your own progress — they never move the complaint forward.
          </p>

        </CardHeader>
        <CardContent className="space-y-2">
          {readiness.map(item => (
            <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                {item.done ? (
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className={item.done ? 'text-muted-foreground' : ''}>{item.label}</span>
                {!item.done && (
                  <Badge variant="outline" className="text-[10px]">
                    {item.kind === 'required' ? 'Required by workflow' : 'Recommended'}
                  </Badge>
                )}
              </span>
              {item.section && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                  onClick={() => onOpenSection(item.section as CaseWorkSection)}>
                  Open<ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          ))}
          {unavailable.map((u) => (
            <div key={u.key} className="rounded-md border border-dashed p-2.5">
              <UnavailableStatus label={u.label} onRetry={u.retry} />
            </div>
          ))}
          {rfiOk && rfi.state !== 'none' && rfi.dueAt && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              Information request due {formatDateOnly(rfi.dueAt)}
              {rfi.totalQuestions > 0 && ` · ${rfi.answered} of ${rfi.totalQuestions} questions answered`}
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

export default ComplaintCurrentStepPanel;
