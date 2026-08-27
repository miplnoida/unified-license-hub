import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLicenseAppealMutations } from '@/hooks/useLicenseAppeals';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  applicationNumber: string;
  licenseeId?: string | null;
  regulatorId?: string | null;
  /** Statutory deadline for lodging, stored with the appeal. */
  deadline?: Date | null;
  onLodged?: () => void;
}

/**
 * Shared "lodge an appeal" dialog so applicants can appeal a refused
 * application from either the application page or the My Appeals page.
 */
export function LodgeAppealDialog({
  open, onOpenChange, applicationId, applicationNumber, licenseeId, regulatorId, deadline, onLodged,
}: Props) {
  const { lodgeAppeal } = useLicenseAppealMutations();
  const [grounds, setGrounds] = useState('');
  const [relief, setRelief] = useState('');

  const submit = async () => {
    if (grounds.trim().length < 20) {
      toast.error('Please describe your grounds of appeal in at least 20 characters.');
      return;
    }
    try {
      await lodgeAppeal.mutateAsync({
        applicationId,
        licenseeId,
        regulatorId,
        grounds: grounds.trim(),
        reliefSought: relief.trim(),
        appealDeadline: deadline ? deadline.toISOString() : null,
      });
      toast.success('Appeal lodged — you will be notified as it progresses.');
      onOpenChange(false);
      setGrounds('');
      setRelief('');
      onLodged?.();
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to lodge appeal');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lodge an appeal</DialogTitle>
          <DialogDescription>
            Appeal against the refusal of application {applicationNumber}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="appeal-grounds">Grounds of appeal *</Label>
            <Textarea
              id="appeal-grounds"
              rows={5}
              value={grounds}
              onChange={(e) => setGrounds(e.target.value)}
              placeholder="Explain why you believe the decision should be reconsidered…"
            />
          </div>
          <div>
            <Label htmlFor="appeal-relief">What outcome are you seeking?</Label>
            <Textarea
              id="appeal-relief"
              rows={3}
              value={relief}
              onChange={(e) => setRelief(e.target.value)}
              placeholder="For example: reconsideration of the application, or approval of the licence."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-rbac="license_appeals.edit" onClick={submit} disabled={lodgeAppeal.isPending}>
            {lodgeAppeal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit appeal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
