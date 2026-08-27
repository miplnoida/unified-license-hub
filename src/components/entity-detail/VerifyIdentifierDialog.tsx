/**
 * Governed "Verify identifier" action for the Entity 360 Identity section.
 *
 * Verification goes through the `entity_identifier_verify` SECURITY DEFINER
 * RPC, which enforces internal-staff + section permission gating, requires an
 * authoritative source and evidence notes, row-locks the identifier, and — for
 * primary identifiers — promotes the entity's identity status to Verified in
 * the same transaction. Every action is audit-logged server-side.
 *
 * A companion "Reject" path (`entity_identifier_reject_verification`) marks an
 * unverifiable claim as Disputed with a mandatory reason.
 */
import { useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

export interface VerifyIdentifierDialogProps {
  entityId: string;
  identifierId: string;
  identifierLabel: string;
  isPrimary: boolean;
}

/** Plain-English mapping for the governed server-side validation errors. */
function friendlyError(message: string): string {
  if (message.includes('authoritative_source_required')) {
    return 'Record the authoritative source the identifier was matched against.';
  }
  if (message.includes('evidence_notes_required')) {
    return 'Evidence notes are required — describe how the match was confirmed.';
  }
  if (message.includes('reason_required')) {
    return 'A reason is required to reject verification.';
  }
  if (message.includes('identifier_already_verified')) {
    return 'This identifier has already been verified.';
  }
  if (message.includes('identifier_not_active')) {
    return 'This identifier is no longer active and cannot be verified.';
  }
  if (message.includes('identifier_not_found')) {
    return 'This identifier record could not be found — it may have been removed.';
  }
  if (message.includes('forbidden')) {
    return 'Your role does not permit verifying identity records for this entity.';
  }
  return message || 'Verification failed';
}

export function VerifyIdentifierDialog({
  entityId, identifierId, identifierLabel, isPrimary,
}: VerifyIdentifierDialogProps) {
  const [mode, setMode] = useState<'verify' | 'reject' | null>(null);
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reset = () => {
    setSource('');
    setNotes('');
    setReason('');
  };

  const close = () => {
    setMode(null);
    reset();
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['entity360', 'section', entityId, 'identity'] });
    queryClient.invalidateQueries({ queryKey: ['entity360', 'overview', entityId] });
  };

  const submitVerify = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc('entity_identifier_verify', {
        _identifier_id: identifierId,
        _authoritative_source: source.trim(),
        _evidence_notes: notes.trim(),
      });
      if (error) throw new Error(error.message);
      toast({
        title: 'Identifier verified',
        description: data?.entity_identity_promoted
          ? 'Primary identifier verified — the entity identity status is now Verified.'
          : undefined,
      });
      close();
      invalidate();
    } catch (e) {
      toast({
        title: 'Could not verify identifier',
        description: friendlyError((e as Error).message ?? ''),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitReject = async () => {
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc('entity_identifier_reject_verification', {
        _identifier_id: identifierId,
        _reason: reason.trim(),
      });
      if (error) throw new Error(error.message);
      toast({ title: 'Verification rejected', description: 'The identifier is now marked as disputed.' });
      close();
      invalidate();
    } catch (e) {
      toast({
        title: 'Could not reject verification',
        description: friendlyError((e as Error).message ?? ''),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button data-rbac="licensee_management.edit" size="sm" variant="outline" onClick={() => setMode('verify')}>
          <ShieldCheck className="mr-1 h-4 w-4" /> Verify
        </Button>
        <GuardedButton module="licensee_management" action="edit" data-rbac="licensee_management.edit" size="sm" variant="ghost" onClick={() => setMode('reject')}>
          <ShieldX className="mr-1 h-4 w-4" /> Reject
        </GuardedButton>
      </div>

      <Dialog open={mode === 'verify'} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify identifier</DialogTitle>
            <DialogDescription>
              Confirm that <span className="font-medium">{identifierLabel}</span> has been matched
              against an authoritative source. This action is audit-logged.
              {isPrimary &&
                ' Because this is the primary identifier, the entity identity status will be promoted to Verified.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="verify-source">Authoritative source</Label>
              <Input
                id="verify-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Companies Registry extract dated 2026-08-20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="verify-notes">Evidence notes</Label>
              <Textarea
                id="verify-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe how the match was confirmed (documents sighted, registry checks, references)."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={submitting}>Cancel</Button>
            <Button data-rbac="licensee_management.edit"
              onClick={submitVerify}
              disabled={submitting || !source.trim() || !notes.trim()}
            >
              {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Confirm verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === 'reject'} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject verification</DialogTitle>
            <DialogDescription>
              Mark <span className="font-medium">{identifierLabel}</span> as disputed. This action
              is audit-logged and requires a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why could this identifier not be verified?"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={submitting}>Cancel</Button>
            <GuardedButton module="licensee_management" action="edit" data-rbac="licensee_management.edit"
              variant="destructive"
              onClick={submitReject}
              disabled={submitting || !reason.trim()}
            >
              {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Reject verification
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default VerifyIdentifierDialog;
