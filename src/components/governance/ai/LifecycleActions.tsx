/**
 * MC-08 — status change control for governed AI configuration.
 *
 * The browser never writes a status. Every change goes through the governed
 * server operation, which is the authority on who may approve what. Only the
 * transitions the server permits from the current status are offered, and a
 * written reason is captured whenever the server requires one.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Loader2 } from 'lucide-react';
import { useAiTransition, useAiSurfaceTransition } from '@/hooks/useAiGovernance';
import { LIFECYCLE_HELP, LIFECYCLE_LABEL, NEXT_STATES, label } from '@/lib/aiGovernanceLabels';
import { useCan } from '@/hooks/useCan';

export type GovernedObject = 'USE_CASE' | 'MODEL' | 'INSTRUCTION' | 'SURFACE';

const REASON_REQUIRED = ['SUSPENDED', 'RETIRED'];

interface Props {
  objectType: GovernedObject;
  objectKey: string;
  currentState: string;
  /** Set when the signed-in user authored this configuration. */
  authoredByCurrentUser?: boolean;
  size?: 'sm' | 'default';
}

export function LifecycleActions({
  objectType, objectKey, currentState, authoredByCurrentUser, size = 'sm',
}: Props) {
  const canApprove = useCan('ai_management', 'approve');
  const transition = useAiTransition();
  const surfaceTransition = useAiSurfaceTransition();
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const pending = transition.isPending || surfaceTransition.isPending;
  const options = NEXT_STATES[currentState] ?? [];

  if (!canApprove) {
    return (
      <p className="text-xs text-muted-foreground">
        You may inspect this configuration. Changing its status requires AI governance approval rights.
      </p>
    );
  }
  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">No status change is available from “{label(LIFECYCLE_LABEL, currentState)}”.</p>;
  }

  const reasonRequired = target ? REASON_REQUIRED.includes(target) : false;
  const reasonMissing = reasonRequired && reason.trim().length < 10;
  const selfApproval = target === 'ACTIVE' && authoredByCurrentUser === true;

  const submit = async () => {
    if (!target || reasonMissing) return;
    const args = { toState: target, rationale: reason.trim() || undefined };
    if (objectType === 'SURFACE') {
      await surfaceTransition.mutateAsync({ code: objectKey, ...args });
    } else {
      await transition.mutateAsync({ objectType, objectKey, ...args });
    }
    setTarget(null);
    setReason('');
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <Button
            key={s}
            size={size}
            variant={s === 'ACTIVE' ? 'default' : s === 'RETIRED' ? 'outline' : 'secondary'}
            onClick={() => { setTarget(s); setReason(''); }}
          >
            {s === 'ACTIVE' && currentState === 'SUSPENDED' ? 'Reinstate' : label(LIFECYCLE_LABEL, s)}
          </Button>
        ))}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change status to “{label(LIFECYCLE_LABEL, target ?? '')}”</DialogTitle>
            <DialogDescription>{target ? LIFECYCLE_HELP[target] : ''}</DialogDescription>
          </DialogHeader>

          {selfApproval && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                You are recorded as the author of this configuration. Approval for production requires a
                second authorised approver, and the server will decline this request.
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="lifecycle-reason">
              Reason {reasonRequired ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
            </Label>
            <Textarea
              id="lifecycle-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Record the regulatory basis for this change. It is kept in the governance history."
            />
            {reasonMissing && (
              <p className="mt-1 text-xs text-destructive">A written reason of at least 10 characters is required.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={pending}>Cancel</Button>
            <Button onClick={submit} disabled={pending || reasonMissing}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record status change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
