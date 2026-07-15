import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { SeverityBadge, StatusChip } from './severityBadge';
import { MOCK_COMPLAINTS } from './mockData';
import { TIER_LABEL, type EscalationCase } from './types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  caseData: EscalationCase | null;
}

export function EscalationCaseDrawer({ open, onOpenChange, caseData }: Props) {
  if (!caseData) return null;
  const cx = MOCK_COMPLAINTS.find((x) => x.id === caseData.complaintId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Escalation Case · {cx?.number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Card><CardContent className="pt-4 space-y-2 text-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <SeverityBadge severity={caseData.severity} />
              <StatusChip status={caseData.status} />
              <span className="text-xs text-slate-600">Triggered {new Date(caseData.triggeredAt).toLocaleString()}</span>
            </div>
            <div><span className="text-slate-500">Subject:</span> {cx?.subject}</div>
            <div><span className="text-slate-500">Complainant:</span> {cx?.complainant}</div>
            <div><span className="text-slate-500">Institution:</span> {cx?.institution} · <span className="text-slate-500">Product:</span> {cx?.product}</div>
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
              <div><span className="text-slate-500">Age:</span> {cx?.ageDays} days</div>
              <div><span className="text-slate-500">Consumer harm:</span> {cx?.harm}</div>
              <div><span className="text-slate-500">Institution risk:</span> {cx?.institutionRisk}</div>
              <div><span className="text-slate-500">Volume (30d):</span> {cx?.institutionVolume30d}</div>
              <div><span className="text-slate-500">Recurrence:</span> {cx?.recurrenceCount}</div>
              <div><span className="text-slate-500">Complaint status:</span> {cx?.status}</div>
            </div>
          </CardContent></Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
