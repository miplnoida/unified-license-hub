/**
 * AML-CLOSE-06 — governed case owner / reviewer assignment.
 * Visibility follows the server's REASSIGN_OWNER / ASSIGN_REVIEWER actions only;
 * eligibility, independence and stale-screen checks are enforced by the server.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ASSIGNMENT_FLAG_LABEL, actionOf, reviewErrorMessage, useAssignmentCandidates, useReassignAssessment,
  type LifecycleState,
} from '@/hooks/useAmlAssessmentReview';

export function AmlAssessmentAssignmentCard({ life }: { life: LifecycleState }) {
  const ownerAct = actionOf(life, 'REASSIGN_OWNER');
  const revAct = actionOf(life, 'ASSIGN_REVIEWER');
  const flags = life.assignment_flags ?? [];
  const [role, setRole] = useState<'OWNER' | 'REVIEWER'>(ownerAct?.permitted ? 'OWNER' : 'REVIEWER');
  const [to, setTo] = useState('none');
  const [reason, setReason] = useState('');
  const permitted = role === 'OWNER' ? ownerAct?.permitted === true : revAct?.permitted === true;
  const candidates = useAssignmentCandidates(life.assessment_id, role, permitted);
  const reassign = useReassignAssessment();

  if (!ownerAct?.permitted && !revAct?.permitted && flags.length === 0) return null;

  const current = role === 'OWNER' ? life.assigned_owner_id : life.assigned_reviewer_id;
  const go = async () => {
    try {
      await reassign.mutateAsync({ assessmentId: life.assessment_id, role, toUserId: to,
        expectedCurrentId: current, reason });
      toast.success(role === 'OWNER' ? 'The case owner was reassigned.' : 'The reviewer was assigned.');
      setTo('none'); setReason('');
    } catch (e) { toast.error(reviewErrorMessage(e)); }
  };

  return (
    <Card data-testid="aml-assignment-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Case assignment</CardTitle>
        <CardDescription>
          Only the assigned case owner can work this assessment. Supervisors can reassign the owner or reviewer;
          every change keeps the previous holder, the reason and who made it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="aml-assignment-flags">
            {flags.map((f) => <Badge key={f} variant="destructive">{ASSIGNMENT_FLAG_LABEL[f] ?? f}</Badge>)}
          </div>
        )}
        {(ownerAct?.permitted || revAct?.permitted) && (
          <>
            <Label htmlFor="asg-role">Assignment</Label>
            <Select value={role} onValueChange={(v) => { setRole(v as 'OWNER' | 'REVIEWER'); setTo('none'); }}>
              <SelectTrigger id="asg-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ownerAct?.permitted && <SelectItem value="OWNER">Case owner</SelectItem>}
                {revAct?.permitted && <SelectItem value="REVIEWER">Reviewer</SelectItem>}
              </SelectContent>
            </Select>
            <Label htmlFor="asg-to">Assign to</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger id="asg-to"><SelectValue placeholder="Choose an eligible person" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Choose an eligible person</SelectItem>
                {(candidates.data ?? []).filter((c) => c.user_id !== current).map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.full_name ?? c.email ?? c.user_id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label htmlFor="asg-reason">Reason (at least 10 characters)</Label>
            <Textarea id="asg-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button onClick={go} disabled={to === 'none' || reason.trim().length < 10 || reassign.isPending}>
              {role === 'OWNER' ? 'Reassign case owner' : 'Assign reviewer'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
