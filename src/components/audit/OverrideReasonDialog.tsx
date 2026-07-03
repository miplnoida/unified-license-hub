import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logRuleOverride, type OverrideModule } from '@/lib/ruleOverrides';
import { DiffViewer } from './DiffViewer';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Business module — one of OVERRIDE_MODULES. */
  module: OverrideModule;
  /** Domain entity being overridden, e.g. `application`, `fp_assessment`. */
  entityType: string;
  entityId: string;
  /** Stable identifier of the rule / recommendation being overridden. */
  ruleKey: string;
  /** Original system value / AI recommendation being overridden. */
  originalValue?: unknown;
  /** New value the user is choosing. */
  overriddenValue?: unknown;
  title?: string;
  description?: string;
  confirmLabel?: string;
  /** Optional extra metadata written into rule_overrides.metadata. */
  metadata?: Record<string, unknown>;
  /** Called after the override has been persisted (row id passed back). */
  onOverridden?: (overrideId: string) => void | Promise<void>;
}

/**
 * Reusable "override with reason" dialog.
 *
 * Persists the override via `logRuleOverride`, which writes both to
 * `rule_overrides` and mirrors it into the existing `audit_logs` table
 * atomically — callers do not touch either table directly.
 */
export function OverrideReasonDialog({
  open, onOpenChange,
  module, entityType, entityId, ruleKey,
  originalValue, overriddenValue,
  title, description, confirmLabel, metadata,
  onOverridden,
}: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const minLen = 10;
  const valid = reason.trim().length >= minLen;

  async function handleConfirm() {
    if (!valid) return;
    setSubmitting(true);
    try {
      const id = await logRuleOverride({
        module, entity_type: entityType, entity_id: entityId,
        rule_key: ruleKey,
        original_value: originalValue,
        overridden_value: overriddenValue,
        reason: reason.trim(),
        metadata,
      });
      toast({ title: 'Override recorded', description: `Rule ${ruleKey} overridden with justification.` });
      await onOverridden?.(id);
      onOpenChange(false);
      setReason('');
    } catch (err: any) {
      toast({
        title: 'Could not record override',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            {title ?? 'Override system recommendation'}
          </DialogTitle>
          <DialogDescription>
            {description ??
              `You are overriding rule "${ruleKey}" on ${entityType} ${entityId}. A written justification is mandatory and will be permanently recorded in the audit log.`}
          </DialogDescription>
        </DialogHeader>

        {(originalValue !== undefined || overriddenValue !== undefined) && (
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Change</Label>
            <div className="rounded-md border border-border p-2 max-h-56 overflow-auto">
              <DiffViewer before={originalValue} after={overriddenValue} compact />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="override-reason">Justification</Label>
          <Textarea
            id="override-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this override is necessary…"
            rows={5}
            disabled={submitting}
          />
          <p className={`text-xs ${valid ? 'text-muted-foreground' : 'text-destructive'}`}>
            Minimum {minLen} characters. Current: {reason.trim().length}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!valid || submitting}>
            {submitting ? 'Recording…' : (confirmLabel ?? 'Confirm override')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OverrideReasonDialog;
