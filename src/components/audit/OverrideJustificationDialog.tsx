import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** Called with the captured justification once the user confirms. */
  onConfirm: (justification: string) => Promise<void> | void;
  /** Optional: pre-existing reason. */
  defaultValue?: string;
  confirmLabel?: string;
}

/**
 * Mandatory justification capture for system override actions
 * (overriding a system finding, AI output, validation, etc).
 * Justification is persisted by the caller via logComplianceAudit({ action_type:'OVERRIDE', ... }).
 */
export function OverrideJustificationDialog({
  open, onOpenChange, title, description, onConfirm, defaultValue, confirmLabel,
}: Props) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [submitting, setSubmitting] = useState(false);

  const minLen = 10;
  const valid = value.trim().length >= minLen;

  async function handleConfirm() {
    if (!valid) return;
    setSubmitting(true);
    try {
      await onConfirm(value.trim());
      onOpenChange(false);
      setValue('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            {title ?? 'Justification required'}
          </DialogTitle>
          <DialogDescription>
            {description ??
              'You are overriding a system-generated outcome. A written justification is mandatory and will be permanently recorded in the audit log.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="override-justification">Justification</Label>
          <Textarea
            id="override-justification"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Explain why this override is necessary…"
            rows={5}
            disabled={submitting}
          />
          <p className={`text-xs ${valid ? 'text-muted-foreground' : 'text-destructive'}`}>
            Minimum {minLen} characters. Current: {value.trim().length}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!valid || submitting}>
            {submitting ? 'Saving…' : (confirmLabel ?? 'Confirm Override')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OverrideJustificationDialog;
