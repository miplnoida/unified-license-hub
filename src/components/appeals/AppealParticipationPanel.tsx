import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Gavel, ShieldAlert } from 'lucide-react';

/**
 * Panel participation, conflict/recusal and voting for one appeal.
 *
 * All authority lives in the backend — this component only renders what
 * `appeal_member_may_vote` and `appeal_participation_status` report and calls
 * `appeal_record_participation`, `appeal_declare_conflict` and
 * `appeal_cast_vote`. No permission logic is recreated in React.
 */
const rpc = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw error;
  const payload = data as any;
  if (payload && typeof payload === 'object' && payload.error) throw new Error(String(payload.error));
  return payload as T;
};

const VOTES = [
  { value: 'allow', label: 'Allow the appeal' },
  { value: 'dismiss', label: 'Dismiss the appeal' },
  { value: 'abstain', label: 'Abstain' },
];

interface Props {
  appealId: string;
  /** True when the backend already allows the decision to be finalised elsewhere. */
  onFinaliseHint?: (allowed: boolean) => void;
}

export function AppealParticipationPanel({ appealId, onFinaliseHint }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [attendance, setAttendance] = useState('attended');
  const [vote, setVote] = useState('');
  const [rationale, setRationale] = useState('');
  const [conflictNote, setConflictNote] = useState('');

  const status = useQuery({
    queryKey: ['appeal-participation-status', appealId],
    queryFn: () => rpc<any>('appeal_participation_status', { _appeal_id: appealId }),
  });

  const mayVote = useQuery({
    queryKey: ['appeal-may-vote', appealId, user?.id],
    enabled: !!user,
    queryFn: () => rpc<any>('appeal_member_may_vote', { _appeal_id: appealId, _user_id: user!.id }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['appeal-participation-status', appealId] });
    qc.invalidateQueries({ queryKey: ['appeal-may-vote', appealId] });
    qc.invalidateQueries({ queryKey: ['license-appeal', appealId] });
  };

  const record = useMutation({
    mutationFn: () => rpc('appeal_record_participation', { _appeal_id: appealId, _attendance: attendance, _note: null }),
    onSuccess: () => { toast.success('Participation recorded'); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const conflict = useMutation({
    mutationFn: () => rpc('appeal_declare_conflict', { _appeal_id: appealId, _note: conflictNote }),
    onSuccess: () => { toast.success('Conflict declared — you are recused'); setConflictNote(''); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cast = useMutation({
    mutationFn: () => rpc('appeal_cast_vote', { _appeal_id: appealId, _vote: vote, _rationale: rationale || null }),
    onSuccess: () => { toast.success('Vote recorded'); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = status.data || {};
  const mv = mayVote.data || {};
  const code = String(mv.code || '');
  const onPanel = code !== 'NOT_PANEL_MEMBER';
  const finaliseAllowed = !!s.has_panel && !!s.quorum_met;
  onFinaliseHint?.(finaliseAllowed);

  if (!s.has_panel) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        No panel has been constituted for this appeal, so participation and voting are not open.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border p-3">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Gavel className="h-4 w-4" /> Decision status
          <Badge variant={s.quorum_met ? 'default' : 'destructive'}>
            {s.quorum_met ? 'Quorum achieved' : 'Quorum not achieved'}
          </Badge>
        </p>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Participating eligible voters</p><p>{s.participating_voters} of {s.roster_voting} on the roster</p></div>
          <div><p className="text-xs text-muted-foreground">Quorum required</p><p>{s.quorum}</p></div>
          <div><p className="text-xs text-muted-foreground">Decision rule</p><p>{s.decision_rule}</p></div>
          <div><p className="text-xs text-muted-foreground">Votes recorded</p><p>allow {s.votes_allow} · dismiss {s.votes_dismiss} · abstain {s.votes_abstain}</p></div>
          <div><p className="text-xs text-muted-foreground">Recused / conflicted</p><p>{s.recused}</p></div>
          <div><p className="text-xs text-muted-foreground">Finalisation</p><p>{finaliseAllowed ? 'Permitted by the backend' : 'Blocked until quorum by participation is met'}</p></div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Quorum counts participating eligible voters, not the roster. The final decision is recorded
          and re-validated by the backend.
        </p>
      </div>

      {!onPanel ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          You are not on the panel of record for this appeal, so you cannot participate or vote.
        </div>
      ) : (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">Your participation</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Attendance</Label>
              <Select value={attendance} onValueChange={setAttendance}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="attended">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="recused">Recused</SelectItem>
                </SelectContent>
              </Select>
              <Button data-rbac="license_appeals.edit" className="mt-2" size="sm" variant="outline" onClick={() => record.mutate()} disabled={record.isPending}>
                Record participation
              </Button>
            </div>
            <div>
              <Label className="text-xs">Declare a conflict (recuses you)</Label>
              <Textarea rows={2} value={conflictNote} onChange={(e) => setConflictNote(e.target.value)} placeholder="Describe the conflict on this matter" />
              <Button data-rbac="license_appeals.edit"
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => conflict.mutate()}
                disabled={conflict.isPending || conflictNote.trim().length === 0}
              >
                Declare conflict &amp; recuse
              </Button>
            </div>
          </div>

          {mv.may_vote ? (
            <div className="space-y-2 border-t pt-3">
              {code === 'APPEAL_INDEPENDENCE_POLICY_REQUIRED' && (
                <p className="flex items-start gap-2 text-xs text-amber-700">
                  <ShieldAlert className="mt-0.5 h-4 w-4" />
                  APPEAL_INDEPENDENCE_POLICY_REQUIRED — you took an earlier decision on this matter and
                  no independence policy is configured. Your vote is flagged for administrator review.
                </p>
              )}
              <Label className="text-xs">Your vote</Label>
              <Select value={vote} onValueChange={setVote}>
                <SelectTrigger><SelectValue placeholder="Select a vote" /></SelectTrigger>
                <SelectContent>
                  {VOTES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label className="text-xs">Rationale (optional)</Label>
              <Textarea rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              <Button data-rbac="license_appeals.edit" size="sm" onClick={() => cast.mutate()} disabled={cast.isPending || !vote}>
                Cast vote
              </Button>
            </div>
          ) : (
            <p className="border-t pt-3 text-xs text-muted-foreground">
              You cannot vote on this appeal — {code || 'not eligible'}.
              {code === 'OBSERVER_CANNOT_VOTE' && ' Observers may read the participation status only.'}
              {code === 'LEGAL_ADVISER_NON_VOTING' && ' A legal adviser votes only where the configured policy allows it.'}
              {code === 'RECUSED' && ' You are recused or have declared a conflict on this matter.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
