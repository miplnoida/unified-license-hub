import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Info } from 'lucide-react';
import { logFpAction } from '@/lib/fpAudit';
import { fpStatusLabel } from '@/lib/fpStatus';

function capitalize(s: string | null | undefined): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

export interface AssignCommitteeAssessment {
  id: string;
  assessment_type: string;
  status: string;
  created_at: string;
}

export interface AssignableCommittee {
  id: string;
  name: string;
  quorum: number;
  approval_threshold_pct: number;
}

/**
 * Assigns a committee to ONE specific assessment. Shared between the
 * individual profile's Determinations tab and the manual review task detail
 * page, so committee assignment can happen from wherever staff are already
 * working the case instead of forcing a trip back to the profile.
 */
export function AssignCommitteeCard({
  individualId,
  assessment,
  committees,
  onAssigned,
}: {
  individualId: string;
  assessment: AssignCommitteeAssessment;
  committees: AssignableCommittee[];
  onAssigned: () => void;
}) {
  const [committeeId, setCommitteeId] = useState('');

  const assign = useMutation({
    mutationFn: async () => {
      if (!committeeId) throw new Error('Pick a committee');
      const { error } = await supabase.from('fp_assessments')
        .update({ committee_id: committeeId, status: 'awaiting_committee' })
        .eq('id', assessment.id);
      if (error) throw error;
      await logFpAction('fp.assessment.committee_assigned', 'fp_assessment', assessment.id, {
        after: { committee_id: committeeId, status: 'awaiting_committee' },
        context: { individualId, assessmentId: assessment.id, committeeId },
      });
    },
    onSuccess: () => {
      toast.success(`Committee assigned to the ${capitalize(assessment.assessment_type)} assessment (${fmtDate(assessment.created_at)})`);
      onAssigned();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="text-sm">
        <span className="font-medium">{capitalize(assessment.assessment_type)} assessment</span>
        <span className="text-muted-foreground"> · created {fmtDate(assessment.created_at)} · status </span>
        <Badge variant="outline" className="text-xs">{fpStatusLabel(assessment.status)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        Assigning a committee here routes only this assessment for voting — it does not affect any other assessment for this individual.
      </p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-xs">Committee</Label>
          <Select value={committeeId} onValueChange={setCommitteeId}>
            <SelectTrigger><SelectValue placeholder="Pick active committee" /></SelectTrigger>
            <SelectContent>{committees.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name} (quorum {c.quorum}, {c.approval_threshold_pct}%)</SelectItem>
            ))}</SelectContent>
          </Select>
        </div>
        <Button data-rbac="fit_and_proper.edit" onClick={() => assign.mutate()} disabled={assign.isPending || !committeeId}>
          {assign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Assign
        </Button>
      </div>
    </div>
  );
}
