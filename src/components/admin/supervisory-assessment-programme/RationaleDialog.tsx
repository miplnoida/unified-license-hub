/**
 * A governed decision always carries a reason. This is the single place the
 * Programme Studio collects one, for lifecycle decisions, retirement, new
 * versions and reference adoption alike.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface RationaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  /** An extra single-line value some decisions need, such as a new version number. */
  extraField?: { label: string; placeholder?: string; initial?: string };
  onConfirm: (rationale: string, extra: string) => Promise<unknown>;
}

export function RationaleDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirm', extraField, onConfirm,
}: RationaleDialogProps) {
  const [rationale, setRationale] = useState('');
  const [extra, setExtra] = useState(extraField?.initial ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setRationale(''); setExtra(extraField?.initial ?? ''); setError(null); }
  }, [open, extraField?.initial]);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await onConfirm(rationale.trim(), extra.trim());
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? 'The action was refused.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <div className="space-y-3">
          {extraField ? (
            <div className="space-y-1.5">
              <Label htmlFor="programme-rationale-extra">{extraField.label}</Label>
              <Input id="programme-rationale-extra" value={extra} placeholder={extraField.placeholder}
                onChange={(e) => setExtra(e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="programme-rationale">Reason</Label>
            <Textarea id="programme-rationale" rows={4} value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="State why this decision is being taken (at least 10 characters)." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={busy || rationale.trim().length < 10 || (Boolean(extraField) && extra.trim() === '')}
            onClick={submit}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
