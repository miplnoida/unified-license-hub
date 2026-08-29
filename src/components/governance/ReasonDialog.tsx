/**
 * Governed reason dialog.
 *
 * Material regulator decisions (approve, reject, withdraw, supersede, RFI
 * issuance, correction requests) must be captured through an explicit,
 * auditable form — never a browser prompt. The dialog shows the action title,
 * the context of the record being decided, a mandatory reason, validation and
 * pending/error state, and only then calls the governed RPC supplied by the
 * caller.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export interface ReasonDialogRequest {
  /** Explicit action title, e.g. "Approve reporting currency override". */
  title: string;
  /** Plain-language explanation of the effect of the decision. */
  description?: string;
  /** Contextual key/value facts about the record being decided. */
  context?: { label: string; value: React.ReactNode }[];
  /** Confirm button label. */
  confirmLabel: string;
  /** Destructive styling for rejections/withdrawals. */
  destructive?: boolean;
  /** Minimum reason length enforced by the backing RPC. */
  minLength?: number;
  /** Executes the governed RPC. Rejecting keeps the dialog open with the error. */
  onConfirm: (reason: string) => Promise<unknown>;
}

export function ReasonDialog({
  request, onClose,
}: { request: ReasonDialogRequest | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const min = request?.minLength ?? 10;

  useEffect(() => { setReason(''); setError(null); setBusy(false); }, [request]);

  if (!request) return null;
  const tooShort = reason.trim().length < min;

  const confirm = async () => {
    if (tooShort) { setError(`A reason of at least ${min} characters is required.`); return; }
    setBusy(true); setError(null);
    try {
      await request.onConfirm(reason.trim());
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'The decision could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          {request.description && <DialogDescription>{request.description}</DialogDescription>}
        </DialogHeader>

        {request.context && request.context.length > 0 && (
          <dl className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-2">
            {request.context.map((c) => (
              <div key={c.label}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</dt>
                <dd className="mt-0.5">{c.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="governed-reason">Reason</Label>
          <Textarea
            id="governed-reason" rows={4} value={reason} autoFocus
            onChange={(e) => setReason(e.target.value)}
            placeholder={`Record the substantive basis for this decision (minimum ${min} characters)`}
          />
          <p className="text-xs text-muted-foreground">
            {reason.trim().length}/{min} characters — recorded in the audit trail.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant={request.destructive ? 'destructive' : 'default'}
            onClick={confirm} disabled={busy || tooShort}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {request.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
