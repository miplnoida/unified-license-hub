import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  LicenseAppeal, useLicenseAppealMutations, useLicenseAppealPanels,
} from '@/hooks/useLicenseAppeals';
import {
  APPEAL_DECISION_OPTIONS, appealDecisionMeta, appealStatusMeta, formatAppealDate, isAppealOpen,
} from '@/lib/licenseAppeals';
import { AppealTimeline } from '@/components/appeals/AppealTimeline';
import { useCan } from '@/hooks/useCan';

interface Props {
  appeal: LicenseAppeal | null;
  onOpenChange: (open: boolean) => void;
}

/** Regulator-side appeal record: acknowledge, refer to a panel, and record the outcome. */
export function AppealActionsDialog({ appeal, onOpenChange }: Props) {
  const { data: panels } = useLicenseAppealPanels(true);
  const { acknowledgeAppeal, assignPanel, recordDecision } = useLicenseAppealMutations();
  const canEdit = useCan('license_appeals', 'edit');
  const canAssign = useCan('license_appeals', 'assign_panel');
  const canDecide = useCan('license_appeals', 'decide');

  const [panelId, setPanelId] = useState('');
  const [hearingDate, setHearingDate] = useState('');
  const [decision, setDecision] = useState('');
  const [rationale, setRationale] = useState('');

  if (!appeal) return null;
  const statusMeta = appealStatusMeta(appeal.status);
  const decisionMeta = appealDecisionMeta(appeal.decision);
  const open = isAppealOpen(appeal.status);

  const handleAcknowledge = async () => {
    try {
      await acknowledgeAppeal.mutateAsync(appeal);
      toast.success('Appeal acknowledged');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to acknowledge appeal');
    }
  };

  const handleAssign = async () => {
    const panel = panels?.find((p) => p.id === panelId);
    if (!panel) { toast.error('Select an appeal panel'); return; }
    try {
      await assignPanel.mutateAsync({ appeal, panelId: panel.id, panelName: panel.name, hearingDate });
      toast.success('Appeal referred to panel');
      setPanelId(''); setHearingDate('');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to refer appeal');
    }
  };

  const handleDecide = async () => {
    if (!decision) { toast.error('Select an appeal outcome'); return; }
    if (rationale.trim().length < 10) { toast.error('Provide a decision rationale'); return; }
    try {
      await recordDecision.mutateAsync({ appeal, decision, rationale: rationale.trim() });
      toast.success('Appeal decision recorded');
      setDecision(''); setRationale('');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to record decision');
    }
  };

  return (
    <Dialog open={!!appeal} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{appeal.appeal_reference}</span>
            <Badge className={statusMeta.className} variant="outline">{statusMeta.label}</Badge>
            {decisionMeta && <Badge className={decisionMeta.className} variant="outline">{decisionMeta.label}</Badge>}
          </DialogTitle>
          <DialogDescription>Licensing appeal record and outcome tracking.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div><p className="text-xs text-muted-foreground">Lodged on</p><p>{formatAppealDate(appeal.filed_at)}</p></div>
            <div><p className="text-xs text-muted-foreground">Appeal deadline</p><p>{formatAppealDate(appeal.appeal_deadline)}</p></div>
            <div><p className="text-xs text-muted-foreground">Hearing date</p><p>{formatAppealDate(appeal.hearing_date)}</p></div>
            <div><p className="text-xs text-muted-foreground">Decided on</p><p>{formatAppealDate(appeal.decided_at)}</p></div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Grounds of appeal</p>
              <p className="whitespace-pre-wrap">{appeal.grounds}</p>
            </div>
            {appeal.relief_sought && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Relief sought</p>
                <p className="whitespace-pre-wrap">{appeal.relief_sought}</p>
              </div>
            )}
            {appeal.decision_rationale && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Decision rationale</p>
                <p className="whitespace-pre-wrap">{appeal.decision_rationale}</p>
              </div>
            )}
          </div>

          {open && (
            <>
              <Separator />
              <div className="space-y-4">
                {appeal.status === 'submitted' && canEdit && (
                  <Button size="sm" onClick={handleAcknowledge} disabled={acknowledgeAppeal.isPending}>
                    {acknowledgeAppeal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Acknowledge appeal
                  </Button>
                )}

                {canAssign && (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">Refer to appeal panel</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Panel</Label>
                        <Select value={panelId} onValueChange={setPanelId}>
                          <SelectTrigger><SelectValue placeholder="Select panel" /></SelectTrigger>
                          <SelectContent>
                            {(panels || []).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Hearing date</Label>
                        <Input type="date" value={hearingDate} onChange={(e) => setHearingDate(e.target.value)} />
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleAssign} disabled={assignPanel.isPending}>
                      {assignPanel.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Refer to panel
                    </Button>
                  </div>
                )}

                {canDecide && (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">Record appeal outcome</p>
                    <div>
                      <Label className="text-xs">Outcome</Label>
                      <Select value={decision} onValueChange={setDecision}>
                        <SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger>
                        <SelectContent>
                          {APPEAL_DECISION_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Rationale</Label>
                      <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Explain the panel's reasoning…" />
                    </div>
                    <Button size="sm" onClick={handleDecide} disabled={recordDecision.isPending}>
                      {recordDecision.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Record decision
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />
          <div>
            <p className="text-sm font-medium mb-2">Appeal history</p>
            <AppealTimeline appealId={appeal.id} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
