/**
 * Impact preview + mandatory reason for every classification status change.
 * Disabling or retiring never touches historical records — it only removes the
 * classification from new selection.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fetchClassificationImpact, type ClassificationStatus } from '@/hooks/useRegulatoryClassification';

const REFERENCE_LABELS: Record<string, string> = {
  licensees: 'Existing entities',
  applications: 'Applications',
  licenses: 'Licences',
  entity_licenses: 'Entity licences',
  form_templates: 'Forms',
  fee_configurations: 'Fee configurations',
  return_configurations: 'Return configurations',
  return_configs: 'Return configurations',
  return_filings: 'Return filings',
  entity_supervision_assignments: 'Staff responsibilities',
  team_scopes: 'Team coverage',
  supervision_team_scopes: 'Team coverage',
  complaints: 'Complaints',
  sub_sectors: 'Sub-sectors',
  classification_business_types: 'Business types',
  authorization_schemes: 'Authorization schemes',
};

export interface StatusChangeRequest {
  entityType: 'sector' | 'business_type' | 'scheme' | 'class' | 'activity' | 'subject_form';
  entityId: string;
  label: string;
  currentStatus: string;
  targetStatus: ClassificationStatus;
}

interface Props {
  request: StatusChangeRequest | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function StatusChangeDialog({ request, onClose, onConfirm }: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason('');
    setImpact(null);
    if (!request) return;
    if (!['disabled', 'retired'].includes(request.targetStatus)) return;
    setLoading(true);
    fetchClassificationImpact(request.entityType, request.entityId)
      .then((r) => setImpact(r?.references || {}))
      .catch(() => setImpact({}))
      .finally(() => setLoading(false));
  }, [request]);

  if (!request) return null;
  const restrictive = ['disabled', 'retired'].includes(request.targetStatus);

  const submit = async () => {
    if (!reason.trim()) {
      toast({ title: 'Reason required', description: 'Record why this classification is changing.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e: any) {
      toast({ title: 'Change rejected', description: e?.message || 'Unable to apply the change.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const entries = Object.entries(impact || {});

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {request.targetStatus === 'active' ? 'Enable' : request.targetStatus === 'disabled' ? 'Disable'
              : request.targetStatus === 'retired' ? 'Retire' : 'Set to draft'}: {request.label}
          </DialogTitle>
          <DialogDescription>
            Current status: {request.currentStatus.toUpperCase()} → {request.targetStatus.toUpperCase()}
          </DialogDescription>
        </DialogHeader>

        {restrictive && (
          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Potential impact</p>
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking references…
                </p>
              ) : entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No existing records reference this classification.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {entries.map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span className="text-muted-foreground">{REFERENCE_LABELS[k] || k}</span>
                      <span className="font-mono">{v}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Existing records will remain unchanged. This classification will no longer be available for
                new selection, and its descendants become effectively unavailable.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="status-reason">Reason (recorded in change history)</Label>
          <Textarea id="status-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder="e.g. Scheme closed to new applicants from 1 January." />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClassificationStatusBadgeTone(status?: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'active': return 'default';
    case 'draft': return 'secondary';
    case 'retired': return 'destructive';
    default: return 'outline';
  }
}
