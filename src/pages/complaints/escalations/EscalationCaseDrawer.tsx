import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { SeverityBadge, StatusChip } from './severityBadge';
import { TIER_LABEL, type EscalationCase } from './types';
import { formatDateTime } from '@/lib/datetime';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  caseData: EscalationCase | null;
}

export function EscalationCaseDrawer({ open, onOpenChange, caseData }: Props) {
  const { data: complaint, isLoading, isError } = useQuery({
    queryKey: ['get_complaint', caseData?.complaintId],
    enabled: !!caseData?.complaintId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_complaint', { _id: caseData!.complaintId });
      if (error) throw error;
      return data as any;
    },
  });

  if (!caseData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Escalation Case · {complaint?.complaint_number ?? '…'}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : isError ? (
          <div className="p-4 text-sm text-destructive">Unable to load complaint. Please close and try again.</div>
        ) : (
          <div className="space-y-4">
            <Card><CardContent className="pt-4 space-y-2 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                <SeverityBadge severity={caseData.severity} />
                <StatusChip status={caseData.status} />
                <span className="text-xs text-slate-600">Triggered {formatDateTime(caseData.triggeredAt)}</span>
              </div>
              <div><span className="text-slate-500">Subject:</span> {complaint?.subject ?? '—'}</div>
              <div><span className="text-slate-500">Complainant email:</span> {complaint?.email ?? '—'}</div>
              <div><span className="text-slate-500">Institution:</span> {complaint?.licensee_id ?? '—'}</div>
            </CardContent></Card>

            <Card><CardContent className="pt-4 text-sm space-y-2">
              <div className="font-medium">Rule match</div>
              <div><span className="text-slate-500">Rule:</span> {caseData.ruleLabel}</div>
              <div><span className="text-slate-500">Reason:</span> {caseData.triggerReason}</div>
              <div><span className="text-slate-500">Target tier:</span> {TIER_LABEL[caseData.targetTier]}</div>
              {caseData.assignedTo && <div><span className="text-slate-500">Assigned to:</span> {caseData.assignedTo}</div>}
            </CardContent></Card>

            <Card><CardContent className="pt-4 text-sm space-y-2">
              <div className="font-medium">Context signals</div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">Severity:</span> {complaint?.severity ?? '—'}</div>
                <div><span className="text-slate-500">Status:</span> {complaint?.status ?? '—'}</div>
                <div><span className="text-slate-500">Created:</span> {formatDateTime(complaint?.created_at)}</div>
                <div><span className="text-slate-500">SLA:</span> {complaint?.sla_status ?? '—'}</div>
                <div><span className="text-slate-500">Recurrence:</span> {complaint?.repeat_complaint_count ?? 0}</div>
              </div>
            </CardContent></Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
