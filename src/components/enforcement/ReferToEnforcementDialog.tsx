/**
 * EPR-03 — the one way into the Enforcement process.
 *
 * Any source surface (complaint, conduct investigation, thematic finding,
 * prudential breach or action, examination finding, licensing matter,
 * fit-and-proper matter) refers a matter through this dialog. It sends only the
 * source kind and source record id: `enforcement_referral_create` validates the
 * source exists, derives the regulated entity from it, checks referral authority
 * and opens the case at the Referral stage.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Gavel, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ENFORCEMENT_SOURCE_LABEL, type EnforcementSourceKind } from '@/lib/enforcementProcessOps';
import { useEnforcementReferral } from '@/hooks/useEnforcementProcess';

const ENFORCEMENT_TYPES = [
  'regulatory_action', 'warning', 'directive', 'monetary_penalty',
  'condition_variation', 'suspension', 'revocation', 'public_censure',
];

export interface ReferToEnforcementDialogProps {
  sourceKind: EnforcementSourceKind;
  sourceId: string;
  /** Human label for the matter being referred, shown for confirmation. */
  sourceLabel?: string;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'secondary' | 'ghost';
  triggerSize?: 'default' | 'sm';
  /** Called with the new case id after a successful referral. */
  onReferred?: (caseId: string) => void;
  /** Navigate straight to the new case workspace (default true). */
  navigateToCase?: boolean;
  disabled?: boolean;
}

export function ReferToEnforcementDialog({
  sourceKind, sourceId, sourceLabel, triggerLabel = 'Refer to enforcement',
  triggerVariant = 'outline', triggerSize = 'sm', onReferred, navigateToCase = true, disabled,
}: ReferToEnforcementDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [legalBasis, setLegalBasis] = useState('');
  const [type, setType] = useState('regulatory_action');
  const [severity, setSeverity] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');
  const navigate = useNavigate();
  const refer = useEnforcementReferral();

  const submit = async () => {
    try {
      const caseId = await refer.mutateAsync({
        sourceKind,
        sourceId,
        referralReason: reason.trim(),
        legalBasis: legalBasis.trim() || null,
        enforcementType: type,
        severity,
      });
      toast.success('Referred to enforcement');
      setOpen(false);
      setReason(''); setLegalBasis('');
      onReferred?.(caseId);
      if (navigateToCase) navigate(`/enforcement/${caseId}`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not refer this matter to enforcement');
    }
  };

  const tooShort = reason.trim().length < 20;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} disabled={disabled} data-rbac="enforcement_management.refer">
          <Gavel className="mr-1 h-4 w-4" />{triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Refer to enforcement</DialogTitle>
          <DialogDescription>
            Opens an enforcement case at the Referral stage. The regulated entity, case reference and
            audit trail are set by the enforcement process — you record why enforcement is warranted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Source matter</div>
            <div className="font-medium">{ENFORCEMENT_SOURCE_LABEL[sourceKind]}</div>
            {sourceLabel ? <div className="text-xs text-muted-foreground">{sourceLabel}</div> : null}
          </div>

          <div className="space-y-2">
            <Label>Why is enforcement warranted? <span className="text-destructive">*</span></Label>
            <Textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Set out the conduct or breach, its regulatory significance and what enforcement is expected to achieve (minimum 20 characters)."
            />
            {tooShort ? <p className="text-xs text-muted-foreground">{reason.trim().length}/20 characters</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Proposed enforcement type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENFORCEMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Legal basis (optional at referral, required before a notice)</Label>
            <Input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} placeholder="Section and instrument relied upon" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={tooShort || refer.isPending} data-rbac="enforcement_management.refer">
            {refer.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Refer to enforcement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
