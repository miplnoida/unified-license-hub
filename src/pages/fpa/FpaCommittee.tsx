import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logFpAction } from '@/lib/fpAudit';
import { fpCommitteeCastVote, fpCommitteeCreate, fpCommitteeMemberAdd, fpCommitteeUpdate } from '@/lib/fpGovernedOps';
import {
  Loader2,
  Plus,
  Gavel,
  Users,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronRight,
  ShieldCheck,
  ShieldOff,
  Clock,
  BarChart2,
  AlertCircle,
  Pencil,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Committee {
  id: string;
  name: string;
  description: string | null;
  quorum: number;
  approval_threshold_pct: number;
  is_active: boolean;
  regulator_id: string | null;
  created_at: string;
  casting_vote_member_id: string | null;
  updated_at: string;
}

interface CommitteeMember {
  id: string;
  committee_id: string;
  user_id: string;
  member_role: string;
  vote_weight: number;
  is_active: boolean;
  added_at: string;
}

interface CommitteeMemberWithProfile extends CommitteeMember {
  profile_name: string | null;
}

interface Assessment {
  id: string;
  committee_id: string | null;
  assessment_type: string | null;
  status: string | null;
  individual_id: string | null;
  created_at: string;
  fp_individuals?: { full_name: string | null; national_id: string | null } | null;
}

interface CommitteeVote {
  id: string;
  assessment_id: string;
  committee_id: string;
  member_id: string;
  vote: string;
  weight: number;
  justification: string | null;
  voted_at: string;
  rationale_required: boolean;
}

interface NewCommitteeForm {
  name: string;
  description: string;
  quorum: string;
  approval_threshold_pct: string;
}

interface CastVoteForm {
  vote: string;
  justification: string;
  rationale_required: boolean;
}

interface EditCommitteeForm {
  name: string;
  description: string;
  quorum: string;
  approval_threshold_pct: string;
  is_active: boolean;
}

interface AddMemberForm {
  user_id: string;
  member_role: string;
  vote_weight: string;
}

const EMPTY_ADD_MEMBER_FORM: AddMemberForm = {
  user_id: '',
  member_role: '',
  vote_weight: '1',
};

const MEMBER_ROLES = ['chair', 'member', 'secretary', 'observer'];

const EMPTY_COMMITTEE_FORM: NewCommitteeForm = {
  name: '',
  description: '',
  quorum: '3',
  approval_threshold_pct: '60',
};

const EMPTY_VOTE_FORM: CastVoteForm = {
  vote: '',
  justification: '',
  rationale_required: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function activeBadge(isActive: boolean) {
  return isActive ? (
    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
      Active
    </Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-100">
      Inactive
    </Badge>
  );
}

function memberActiveBadge(isActive: boolean) {
  return isActive ? (
    <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50 text-xs">
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="border-slate-200 text-slate-500 text-xs">
      Inactive
    </Badge>
  );
}

function shortenId(id: string): string {
  return id.slice(0, 8) + '…';
}

function fmtPct(n: number): string {
  return n.toFixed(1) + '%';
}

function capitalize(s: string | null | undefined): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

// ── Vote Tally Logic ──────────────────────────────────────────────────────────

interface VoteTally {
  totalVotes: number;
  totalWeight: number;
  approve: { count: number; weight: number };
  reject: { count: number; weight: number };
  abstain: { count: number; weight: number };
  approvalPct: number;
  quorumMet: boolean;
  outcome: 'APPROVED' | 'REJECTED' | 'PENDING';
}

function computeTally(
  votes: CommitteeVote[],
  committee: Committee
): VoteTally {
  const approve = { count: 0, weight: 0 };
  const reject = { count: 0, weight: 0 };
  const abstain = { count: 0, weight: 0 };

  for (const v of votes) {
    const w = v.weight;
    if (v.vote === 'approve') { approve.count += 1; approve.weight += w; }
    else if (v.vote === 'reject') { reject.count += 1; reject.weight += w; }
    else { abstain.count += 1; abstain.weight += w; }
  }

  const totalVotes = votes.length;
  const totalWeight = approve.weight + reject.weight + abstain.weight;
  const quorum = committee.quorum;
  const threshold = committee.approval_threshold_pct;

  const approvalPct = totalWeight > 0 ? (approve.weight / totalWeight) * 100 : 0;
  const quorumMet = totalVotes >= quorum;

  let outcome: VoteTally['outcome'] = 'PENDING';
  if (quorumMet) {
    outcome = approvalPct >= threshold ? 'APPROVED' : 'REJECTED';
  }

  return { totalVotes, totalWeight, approve, reject, abstain, approvalPct, quorumMet, outcome };
}

// ── Outcome Badge ─────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: VoteTally['outcome'] }) {
  if (outcome === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700 border border-emerald-200">
        <ShieldCheck className="h-4 w-4" />
        APPROVED
      </span>
    );
  }
  if (outcome === 'REJECTED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1 text-sm font-semibold text-red-700 border border-red-200">
        <ShieldOff className="h-4 w-4" />
        REJECTED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-700 border border-amber-200">
      <Clock className="h-4 w-4" />
      PENDING
    </span>
  );
}

// ── Vote Distribution Bar Chart ───────────────────────────────────────────────

function VoteDistributionChart({ tally }: { tally: VoteTally }) {
  const data = [
    { name: 'Approve', weight: tally.approve.weight, count: tally.approve.count },
    { name: 'Reject', weight: tally.reject.weight, count: tally.reject.count },
    { name: 'Abstain', weight: tally.abstain.weight, count: tally.abstain.count },
  ];

  const COLORS: Record<string, string> = {
    Approve: '#10b981',
    Reject: '#ef4444',
    Abstain: '#94a3b8',
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="rounded border bg-white px-3 py-2 text-xs shadow-md">
          <p className="font-semibold">{d.name}</p>
          <p className="text-muted-foreground">Weight: <span className="font-mono font-semibold text-foreground">{d.weight}</span></p>
          <p className="text-muted-foreground">Votes: <span className="font-mono font-semibold text-foreground">{d.count}</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={100}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={56} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
        <Bar dataKey="weight" radius={[0, 4, 4, 0]} barSize={18}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={COLORS[entry.name]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FpaCommittee() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(null);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | ''>('');
  const [newCommitteeOpen, setNewCommitteeOpen] = useState(false);
  const [editCommitteeOpen, setEditCommitteeOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberForm, setAddMemberForm] = useState<AddMemberForm>(EMPTY_ADD_MEMBER_FORM);
  const [committeeForm, setCommitteeForm] = useState<NewCommitteeForm>(EMPTY_COMMITTEE_FORM);
  const [editForm, setEditForm] = useState<EditCommitteeForm>({
    name: '',
    description: '',
    quorum: '3',
    approval_threshold_pct: '60',
    is_active: true,
  });
  const [voteForm, setVoteForm] = useState<CastVoteForm>(EMPTY_VOTE_FORM);

  // ── Queries ───────────────────────────────────────────────────────────────

  const {
    data: committees,
    isLoading: loadingCommittees,
    isError: committeesError,
    error: committeesErrorObj,
  } = useQuery({
    queryKey: ['fp_committees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_committees')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Committee[];
    },
  });

  const selectedCommittee = committees?.find((c) => c.id === selectedCommitteeId) ?? null;

  const {
    data: rawMembers,
    isLoading: loadingMembers,
    isError: membersError,
    error: membersErrorObj,
  } = useQuery({
    queryKey: ['fp_committee_members', selectedCommitteeId],
    enabled: !!selectedCommitteeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fp_committee_members')
        .select('*')
        .eq('committee_id', selectedCommitteeId);
      if (error) throw error;
      return (data ?? []) as CommitteeMember[];
    },
  });

  // Fetch profile names for all members in this committee
  const { data: memberProfiles } = useQuery({
    queryKey: ['fp_committee_member_profiles', selectedCommitteeId, rawMembers?.map((m) => m.user_id)],
    enabled: !!rawMembers && rawMembers.length > 0,
    queryFn: async () => {
      const userIds = rawMembers!.map((m) => m.user_id);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string; email: string }[];
    },
  });

  // Merge member data with profile names
  const members: CommitteeMemberWithProfile[] | undefined = rawMembers?.map((m) => {
    const profile = memberProfiles?.find((p) => p.id === m.user_id);
    return {
      ...m,
      profile_name: profile?.full_name ?? profile?.email ?? null,
    };
  });

  // RLS only allows a member to cast their OWN vote (fp_committee_votes "Member
  // casts own vote" policy requires member.user_id = auth.uid()) — the member
  // picker below must be restricted to this, not a free choice of any member,
  // otherwise the form silently fails for every member except the current user.
  // Derived directly from `members` on every render (not mirrored into
  // voteForm state) — voteForm gets reset to EMPTY_VOTE_FORM in several
  // places (switching assessment, switching committee, after a successful
  // vote) without the membership itself changing, so a useEffect keyed off
  // myMembership?.id would go stale after those resets and never refill the
  // weight/member fields, permanently disabling the Record Vote button.
  const myMembership = members?.find((m) => m.user_id === user?.id);

  const {
    data: assessments,
    isLoading: loadingAssessments,
    isError: assessmentsError,
    error: assessmentsErrorObj,
  } = useQuery({
    queryKey: ['fp_assessments_for_committee', selectedCommitteeId],
    enabled: !!selectedCommitteeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fp_assessments')
        .select('id, committee_id, assessment_type, status, individual_id, created_at, fp_individuals(full_name, national_id)')
        .eq('committee_id', selectedCommitteeId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Assessment[];
    },
  });

  const {
    data: votes,
    isLoading: loadingVotes,
    isError: votesError,
    error: votesErrorObj,
  } = useQuery({
    queryKey: ['fp_committee_votes', selectedCommitteeId, selectedAssessmentId],
    enabled: !!selectedCommitteeId && !!selectedAssessmentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fp_committee_votes')
        .select('*')
        .eq('committee_id', selectedCommitteeId)
        .eq('assessment_id', selectedAssessmentId);
      if (error) throw error;
      return (data ?? []) as CommitteeVote[];
    },
  });

  // Fetch all profiles for the Add Member user dropdown
  const { data: allProfiles = [] } = useQuery({
    queryKey: ['profiles-for-member-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string; email: string }[];
    },
  });

  // ── Tally ─────────────────────────────────────────────────────────────────

  const tally: VoteTally | null =
    votes && selectedCommittee
      ? computeTally(votes, selectedCommittee)
      : null;

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createCommittee = useMutation({
    mutationFn: async () => {
      const { name, description, quorum, approval_threshold_pct } = committeeForm;
      if (!name.trim()) throw new Error('Committee name is required.');
      const q = parseInt(quorum, 10);
      const t = parseFloat(approval_threshold_pct);
      if (isNaN(q) || q < 1) throw new Error('Quorum must be at least 1.');
      if (isNaN(t) || t < 0 || t > 100) throw new Error('Approval threshold must be 0–100.');

      await fpCommitteeCreate({
        name: name.trim(),
        quorum: q,
        approvalThresholdPct: t,
        description: description.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success('Committee created.');
      qc.invalidateQueries({ queryKey: ['fp_committees'] });
      setNewCommitteeOpen(false);
      setCommitteeForm(EMPTY_COMMITTEE_FORM);
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to create committee.');
    },
  });

  const updateCommittee = useMutation({
    mutationFn: async () => {
      if (!selectedCommitteeId) throw new Error('No committee selected.');
      const { name, description, quorum, approval_threshold_pct, is_active } = editForm;
      if (!name.trim()) throw new Error('Committee name is required.');
      const q = parseInt(quorum, 10);
      const t = parseFloat(approval_threshold_pct);
      if (isNaN(q) || q < 1) throw new Error('Quorum must be at least 1.');
      if (isNaN(t) || t < 0 || t > 100) throw new Error('Approval threshold must be 0–100.');

      await fpCommitteeUpdate(selectedCommitteeId, {
        name: name.trim(),
        description: description.trim() || null,
        quorum: q,
        approvalThresholdPct: t,
        isActive: is_active,
      });
    },
    onSuccess: () => {
      toast.success('Committee updated.');
      qc.invalidateQueries({ queryKey: ['fp_committees'] });
      setEditCommitteeOpen(false);
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to update committee.');
    },
  });

  const addMember = useMutation({
    mutationFn: async () => {
      if (!selectedCommitteeId) throw new Error('No committee selected.');
      if (!addMemberForm.user_id) throw new Error('Please select a user.');
      if (!addMemberForm.member_role) throw new Error('Please select a member role.');
      const weight = parseFloat(addMemberForm.vote_weight);
      if (isNaN(weight) || weight <= 0) throw new Error('Vote weight must be a positive number.');

      await fpCommitteeMemberAdd({
        committeeId: selectedCommitteeId,
        userId: addMemberForm.user_id,
        memberRole: addMemberForm.member_role,
        voteWeight: weight,
      });
    },
    onSuccess: () => {
      toast.success('Member added to committee.');
      qc.invalidateQueries({ queryKey: ['fp_committee_members', selectedCommitteeId] });
      setAddMemberOpen(false);
      setAddMemberForm(EMPTY_ADD_MEMBER_FORM);
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to add member.');
    },
  });

  const castVote = useMutation({
    mutationFn: async () => {
      if (!selectedAssessmentId) throw new Error('Select an assessment first.');
      if (!myMembership) throw new Error('You are not a member of this committee.');
      if (!voteForm.vote) throw new Error('Select a vote option.');

      const weight = myMembership.vote_weight;
      if (weight == null || isNaN(weight) || weight <= 0) {
        throw new Error('This member has no valid vote weight configured.');
      }

      if (voteForm.rationale_required && !voteForm.justification.trim()) {
        throw new Error('Justification is required when rationale is required.');
      }

      // Governed operation: it resolves the caller's own active membership and
      // vote weight, so nobody can vote as another member.
      await fpCommitteeCastVote(
        selectedAssessmentId,
        voteForm.vote,
        voteForm.justification.trim() || null,
      );
    },
    onSuccess: () => {
      toast.success('Vote recorded.');
      qc.invalidateQueries({ queryKey: ['fp_committee_votes', selectedCommitteeId, selectedAssessmentId] });
      setVoteForm(EMPTY_VOTE_FORM);
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to cast vote.');
    },
  });

  // ── Phase 3F — final decision snapshot ────────────────────────────────────
  // The committee's configuration (quorum, threshold, roster, weights) and the
  // vote tally are frozen at the moment of decision so a later configuration
  // change can never rewrite history.
  const { data: decisionSnapshot } = useQuery({
    queryKey: ['fp_committee_decision_snapshot', selectedAssessmentId],
    enabled: !!selectedAssessmentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fp_committee_decision_snapshots')
        .select('*')
        .eq('assessment_id', selectedAssessmentId)
        .order('decided_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
  });

  const recordDecision = useMutation({
    mutationFn: async () => {
      if (!selectedAssessmentId) throw new Error('Select an assessment first.');
      const { error } = await (supabase as any).rpc('fp_record_committee_decision', {
        _assessment_id: selectedAssessmentId,
      });
      if (error) throw error;

      await logFpAction('fp.committee.decision_recorded', 'fp_assessment', selectedAssessmentId, {
        after: {
          quorum: selectedCommittee?.quorum, approval_threshold_pct: selectedCommittee?.approval_threshold_pct,
          votes_counted: tally?.totalVotes, outcome: tally?.outcome,
        },
        context: { committeeId: selectedCommitteeId ?? undefined, assessmentId: selectedAssessmentId },
      });

      try {
        await supabase.functions.invoke('dispatch-notification-event', {
          body: {
            event_key: 'fp_committee_decision_recorded',
            entity_type: 'fp_assessment',
            entity_id: selectedAssessmentId,
            payload: { outcome: tally?.outcome, votes_counted: tally?.totalVotes },
          },
        });
      } catch (e) { console.warn('dispatch-notification-event failed', e); }
    },
    onSuccess: () => {
      toast.success('Committee decision recorded and frozen.');
      qc.invalidateQueries({ queryKey: ['fp_committee_decision_snapshot', selectedAssessmentId] });
      qc.invalidateQueries({ queryKey: ['fp_committee_assessments'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to record decision.'),
  });


  // ── Open edit dialog ──────────────────────────────────────────────────────

  const openEditDialog = (committee: Committee) => {
    setEditForm({
      name: committee.name,
      description: committee.description ?? '',
      quorum: String(committee.quorum),
      approval_threshold_pct: String(committee.approval_threshold_pct),
      is_active: committee.is_active,
    });
    setEditCommitteeOpen(true);
  };

  // ── Helper: display member name ───────────────────────────────────────────

  const memberDisplayName = (m: CommitteeMemberWithProfile): string => {
    if (m.profile_name) return m.profile_name;
    return shortenId(m.user_id);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Committee Voting"
          description="Weighted vote tallying and quorum tracking for FP committees — FPA-012"
          actions={
            <Dialog open={newCommitteeOpen} onOpenChange={setNewCommitteeOpen}>
              <DialogTrigger asChild>
                <Button data-rbac="fit_and_proper.create">
                  <Plus className="h-4 w-4 mr-2" />
                  New Committee
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Committee</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-1">
                  <div>
                    <Label>
                      Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={committeeForm.name}
                      onChange={(e) => setCommitteeForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Senior Fit & Proper Panel"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      rows={2}
                      value={committeeForm.description}
                      onChange={(e) => setCommitteeForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Optional description of the committee's mandate"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>
                        Quorum <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={committeeForm.quorum}
                        onChange={(e) => setCommitteeForm((f) => ({ ...f, quorum: e.target.value }))}
                        placeholder="e.g. 3"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Min votes to count</p>
                    </div>
                    <div>
                      <Label>
                        Approval Threshold % <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={committeeForm.approval_threshold_pct}
                        onChange={(e) => setCommitteeForm((f) => ({ ...f, approval_threshold_pct: e.target.value }))}
                        placeholder="e.g. 60"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Weighted % to approve</p>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setNewCommitteeOpen(false)}>
                    Cancel
                  </Button>
                  <Button data-rbac="fit_and_proper.create"
                    onClick={() => createCommittee.mutate()}
                    disabled={createCommittee.isPending || !committeeForm.name.trim()}
                  >
                    {createCommittee.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Committee
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        {/* Edit Committee Dialog */}
        <Dialog open={editCommitteeOpen} onOpenChange={setEditCommitteeOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Committee</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div>
                <Label>
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Senior Fit & Proper Panel"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>
                    Quorum <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={editForm.quorum}
                    onChange={(e) => setEditForm((f) => ({ ...f, quorum: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>
                    Approval Threshold % <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.approval_threshold_pct}
                    onChange={(e) => setEditForm((f) => ({ ...f, approval_threshold_pct: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="edit-is-active"
                  checked={editForm.is_active}
                  onCheckedChange={(checked) => setEditForm((f) => ({ ...f, is_active: checked }))}
                />
                <Label htmlFor="edit-is-active">
                  {editForm.is_active ? 'Active' : 'Inactive'}
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditCommitteeOpen(false)}>
                Cancel
              </Button>
              <Button data-rbac="fit_and_proper.edit"
                onClick={() => updateCommittee.mutate()}
                disabled={updateCommittee.isPending || !editForm.name.trim()}
              >
                {updateCommittee.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex gap-5 items-start">
          {/* ── Left Panel: Committee List ────────────────────────────── */}
          <div className="w-[35%] shrink-0 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Gavel className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Committees</h2>
              {committees && (
                <Badge variant="secondary" className="text-xs">
                  {committees.length}
                </Badge>
              )}
            </div>

            {loadingCommittees ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : committeesError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Failed to load committees: {(committeesErrorObj as any)?.message || 'Unknown error'}
                </AlertDescription>
              </Alert>
            ) : !committees || committees.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No committees yet. Use "New Committee" to create one.
              </div>
            ) : (
              committees.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCommitteeId(c.id);
                    setSelectedAssessmentId('');
                    setVoteForm(EMPTY_VOTE_FORM);
                  }}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selectedCommitteeId === c.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-sm leading-snug text-foreground line-clamp-1">
                      {c.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(c);
                        }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit committee"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {selectedCommitteeId === c.id && (
                        <ChevronRight className="h-4 w-4 text-primary mt-0.5" />
                      )}
                    </div>
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {c.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {activeBadge(c.is_active)}
                    <Badge variant="outline" className="text-xs font-mono">
                      Quorum: {c.quorum}
                    </Badge>
                    <Badge variant="outline" className="text-xs font-mono">
                      {c.approval_threshold_pct}% threshold
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* ── Right Panel ───────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-5">
            {!selectedCommittee ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
                <Gavel className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Select a committee to view members and votes.</p>
              </div>
            ) : (
              <>
                {/* ── Members Section ─────────────────────────────────── */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm">Members</CardTitle>
                        {members && (
                          <Badge variant="secondary" className="text-xs">
                            {members.length}
                          </Badge>
                        )}
                      </div>
                      <Button data-rbac="fit_and_proper.create" size="sm" variant="outline" onClick={() => setAddMemberOpen(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add Member
                      </Button>
                    </div>
                  </CardHeader>

                  {/* Add Member Dialog */}
                  <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Member to Committee</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-1">
                        <div>
                          <Label>User <span className="text-red-500">*</span></Label>
                          <Select
                            value={addMemberForm.user_id}
                            onValueChange={(v) => setAddMemberForm((f) => ({ ...f, user_id: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a user…" />
                            </SelectTrigger>
                            <SelectContent>
                              {allProfiles.length === 0 ? (
                                <SelectItem value="__none__" disabled>No users found</SelectItem>
                              ) : allProfiles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.full_name || p.email || p.id.slice(0, 8)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Member Role <span className="text-red-500">*</span></Label>
                          <Select
                            value={addMemberForm.member_role}
                            onValueChange={(v) => setAddMemberForm((f) => ({ ...f, member_role: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select role…" />
                            </SelectTrigger>
                            <SelectContent>
                              {MEMBER_ROLES.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Vote Weight <span className="text-red-500">*</span></Label>
                          <Input
                            type="number"
                            min={0.1}
                            step={0.1}
                            value={addMemberForm.vote_weight}
                            onChange={(e) => setAddMemberForm((f) => ({ ...f, vote_weight: e.target.value }))}
                            placeholder="e.g. 1"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Relative weight applied to this member's vote in the tally
                          </p>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => { setAddMemberOpen(false); setAddMemberForm(EMPTY_ADD_MEMBER_FORM); }}>
                          Cancel
                        </Button>
                        <Button data-rbac="fit_and_proper.create"
                          onClick={() => addMember.mutate()}
                          disabled={addMember.isPending || !addMemberForm.user_id || !addMemberForm.member_role}
                        >
                          {addMember.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Add Member
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Separator />
                  <CardContent className="p-0">
                    {loadingMembers ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading members…</span>
                      </div>
                    ) : membersError ? (
                      <div className="p-4">
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            Failed to load members: {(membersErrorObj as any)?.message || 'Unknown error'}
                          </AlertDescription>
                        </Alert>
                      </div>
                    ) : !members || members.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No members found for this committee.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Member</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead className="text-right">Vote Weight</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {members.map((m) => (
                              <TableRow key={m.id}>
                                <TableCell>
                                  <div>
                                    <p className="text-sm font-medium">{memberDisplayName(m)}</p>
                                    <p className="font-mono text-xs text-muted-foreground">{shortenId(m.user_id)}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm capitalize">
                                  {m.member_role}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums font-semibold">
                                  {m.vote_weight}
                                </TableCell>
                                <TableCell>{memberActiveBadge(m.is_active)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ── Votes for Assessment Section ─────────────────────── */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <BarChart2 className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm">Votes for Assessment</CardTitle>
                    </div>
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-4 space-y-5">
                    {/* Assessment Selector */}
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                        Select Assessment
                      </Label>
                      {loadingAssessments ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading assessments…
                        </div>
                      ) : assessmentsError ? (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            Failed to load assessments: {(assessmentsErrorObj as any)?.message || 'Unknown error'}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Select
                          value={selectedAssessmentId}
                          onValueChange={(v) => {
                            setSelectedAssessmentId(v);
                            setVoteForm(EMPTY_VOTE_FORM);
                          }}
                        >
                          <SelectTrigger className="w-full max-w-md">
                            <SelectValue placeholder="Choose an assessment…" />
                          </SelectTrigger>
                          <SelectContent>
                            {(!assessments || assessments.length === 0) && (
                              <SelectItem value="__none__" disabled>
                                No assessments found for this committee
                              </SelectItem>
                            )}
                            {(assessments ?? []).map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                <span className="font-medium">
                                  {a.fp_individuals?.full_name ?? 'Unknown individual'}
                                </span>
                                {a.fp_individuals?.national_id && (
                                  <span className="text-muted-foreground font-mono text-xs"> ({a.fp_individuals.national_id})</span>
                                )}
                                <span className="text-muted-foreground">
                                  {' — '}
                                  {a.assessment_type ? capitalize(a.assessment_type) : 'Assessment'}
                                  {' · '}
                                  {fmtDate(a.created_at)}
                                  {' · '}
                                  <span className="text-xs">{a.status ?? 'unknown'}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Vote Tally */}
                    {selectedAssessmentId && (
                      <>
                        {loadingVotes ? (
                          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Loading votes…</span>
                          </div>
                        ) : votesError ? (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              Failed to load votes: {(votesErrorObj as any)?.message || 'Unknown error'}
                            </AlertDescription>
                          </Alert>
                        ) : tally ? (
                          <div className="space-y-4">
                            {/* Summary Row */}
                            <div className="grid grid-cols-3 gap-3">
                              <div className="rounded-md bg-muted/50 px-3 py-2.5 text-center">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Votes Cast</p>
                                <p className="text-2xl font-bold tabular-nums text-foreground">{tally.totalVotes}</p>
                              </div>
                              <div className="rounded-md bg-muted/50 px-3 py-2.5 text-center">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Weight</p>
                                <p className="text-2xl font-bold tabular-nums text-foreground">{tally.totalWeight}</p>
                              </div>
                              <div className="rounded-md bg-muted/50 px-3 py-2.5 text-center">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Approval % (of votes cast)</p>
                                <p className="text-2xl font-bold tabular-nums text-foreground">
                                  {fmtPct(tally.approvalPct)}
                                </p>
                              </div>
                            </div>
                            {!tally.quorumMet && (
                              <p className="text-xs text-amber-700 -mt-2">
                                This is only the split among the {tally.totalVotes} vote{tally.totalVotes === 1 ? '' : 's'} cast so far — a
                                member's vote weight counts toward this percentage, not toward quorum. Quorum needs {selectedCommittee.quorum} distinct
                                members to vote, however heavily any one of them is weighted, before an outcome can be finalized.
                              </p>
                            )}

                            {/* Vote breakdown */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                <div>
                                  <p className="text-xs text-emerald-700 font-medium">Approve</p>
                                  <p className="text-sm font-semibold tabular-nums text-emerald-800">
                                    {tally.approve.count} <span className="font-normal text-xs">(wt {tally.approve.weight})</span>
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2">
                                <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                                <div>
                                  <p className="text-xs text-red-700 font-medium">Reject</p>
                                  <p className="text-sm font-semibold tabular-nums text-red-800">
                                    {tally.reject.count} <span className="font-normal text-xs">(wt {tally.reject.weight})</span>
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                                <MinusCircle className="h-4 w-4 text-slate-500 shrink-0" />
                                <div>
                                  <p className="text-xs text-slate-600 font-medium">Abstain</p>
                                  <p className="text-sm font-semibold tabular-nums text-slate-700">
                                    {tally.abstain.count} <span className="font-normal text-xs">(wt {tally.abstain.weight})</span>
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Vote Distribution Chart */}
                            {tally.totalVotes > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                                  Weight Distribution
                                </p>
                                <VoteDistributionChart tally={tally} />
                              </div>
                            )}

                            {/* Approval progress bar */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Weighted Approval vs Threshold
                                </p>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {fmtPct(tally.approvalPct)} / {selectedCommittee.approval_threshold_pct}% required
                                </span>
                              </div>
                              <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-3 rounded-full transition-all duration-500 ${tally.quorumMet ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                  style={{ width: `${Math.min(tally.approvalPct, 100)}%` }}
                                />
                                {/* Threshold marker */}
                                <div
                                  className="absolute top-0 bottom-0 w-0.5 bg-slate-700/60"
                                  style={{ left: `${selectedCommittee.approval_threshold_pct}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Threshold line at {selectedCommittee.approval_threshold_pct}%
                                {!tally.quorumMet && ' — shown in amber until quorum is met; not yet a decision.'}
                              </p>
                            </div>

                            {/* Quorum & Outcome */}
                            <div className="flex flex-wrap items-center gap-3 pt-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quorum:</span>
                                {tally.quorumMet ? (
                                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                                    Met ({tally.totalVotes}/{selectedCommittee.quorum})
                                  </Badge>
                                ) : (
                                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                                    Not met ({tally.totalVotes}/{selectedCommittee.quorum} needed)
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Projected:</span>
                                <OutcomeBadge outcome={tally.outcome} />
                            </div>

                            {/* Phase 3F — frozen decision record */}
                            <div className="rounded-md border p-3 space-y-2">
                              {decisionSnapshot ? (
                                <>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                      Recorded decision:
                                    </span>
                                    <Badge variant="outline">{decisionSnapshot.outcome}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(decisionSnapshot.decided_at).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Frozen at decision time — quorum {decisionSnapshot.quorum_at_decision}, threshold{' '}
                                    {decisionSnapshot.approval_threshold_at_decision}%, {decisionSnapshot.votes_counted} vote(s)
                                    counted. Later committee configuration changes do not alter this record.
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs text-muted-foreground">
                                    No decision recorded yet. The tally above is a live projection, not a decision.
                                  </p>
                                  <Button
                                    data-rbac="fit_and_proper.approve"
                                    size="sm"
                                    disabled={recordDecision.isPending || !tally.quorumMet}
                                    onClick={() => recordDecision.mutate()}
                                  >
                                    {recordDecision.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Record final decision
                                  </Button>
                                  {!tally.quorumMet && (
                                    <p className="text-xs text-amber-700">
                                      Quorum must be met before a decision can be recorded.
                                    </p>
                                  )}
                                </>
                              )}
                            </div>

                            </div>

                            {/* Individual votes table */}
                            {votes && votes.length > 0 && (
                              <>
                                <Separator />
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                                    Individual Votes
                                  </p>
                                  <div className="overflow-x-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Member</TableHead>
                                          <TableHead>Vote</TableHead>
                                          <TableHead className="text-right">Weight</TableHead>
                                          <TableHead>Justification</TableHead>
                                          <TableHead>Cast At</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {votes.map((v) => {
                                          const voteMember = members?.find((m) => m.id === v.member_id);
                                          return (
                                            <TableRow key={v.id}>
                                              <TableCell>
                                                <div>
                                                  <p className="text-sm font-medium">
                                                    {voteMember ? memberDisplayName(voteMember) : shortenId(v.member_id)}
                                                  </p>
                                                  <p className="font-mono text-xs text-muted-foreground">{shortenId(v.member_id)}</p>
                                                </div>
                                              </TableCell>
                                              <TableCell>
                                                {v.vote === 'approve' && (
                                                  <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                                  </span>
                                                )}
                                                {v.vote === 'reject' && (
                                                  <span className="inline-flex items-center gap-1 text-red-700 text-xs font-semibold">
                                                    <XCircle className="h-3.5 w-3.5" /> Reject
                                                  </span>
                                                )}
                                                {v.vote === 'abstain' && (
                                                  <span className="inline-flex items-center gap-1 text-slate-500 text-xs font-semibold">
                                                    <MinusCircle className="h-3.5 w-3.5" /> Abstain
                                                  </span>
                                                )}
                                                {v.vote !== 'approve' && v.vote !== 'reject' && v.vote !== 'abstain' && (
                                                  <span className="text-muted-foreground italic text-xs capitalize">{v.vote}</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-right font-mono text-sm tabular-nums">
                                                {v.weight}
                                              </TableCell>
                                              <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                                                {v.justification ?? <span className="italic">—</span>}
                                              </TableCell>
                                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                {new Date(v.voted_at).toLocaleString()}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </>
                            )}

                            {votes && votes.length === 0 && (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No votes cast yet for this assessment.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}

                    {!selectedAssessmentId && (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Select an assessment above to view vote tallies.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* ── Cast Vote Section ────────────────────────────────── */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Gavel className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm">Cast Vote</CardTitle>
                    </div>
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-4">
                    {!selectedAssessmentId ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Select an assessment above before casting a vote.
                      </p>
                    ) : (
                      <div className="space-y-4 max-w-lg">
                        <div className="grid grid-cols-2 gap-4">
                          {/* Member — restricted to the current user's own membership; RLS only
                              allows a member to cast their own vote, so this can't be a free pick. */}
                          <div>
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                              Voting as
                            </Label>
                            {!members || members.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">No members in this committee.</p>
                            ) : !myMembership ? (
                              <p className="text-xs text-muted-foreground italic">
                                You are not a member of this committee, so you cannot cast a vote here.
                              </p>
                            ) : (
                              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                                {memberDisplayName(myMembership)}
                                {myMembership.member_role ? ` · ${myMembership.member_role}` : ''}
                              </div>
                            )}
                          </div>

                          {/* Vote */}
                          <div>
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                              Vote <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              value={voteForm.vote}
                              onValueChange={(v) => setVoteForm((f) => ({ ...f, vote: v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choose vote…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="approve">
                                  <span className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Approve
                                  </span>
                                </SelectItem>
                                <SelectItem value="reject">
                                  <span className="flex items-center gap-1.5">
                                    <XCircle className="h-3.5 w-3.5 text-red-600" /> Reject
                                  </span>
                                </SelectItem>
                                <SelectItem value="abstain">
                                  <span className="flex items-center gap-1.5">
                                    <MinusCircle className="h-3.5 w-3.5 text-slate-500" /> Abstain
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Weight — pinned to the member's configured vote_weight, not user-editable */}
                        <div className="w-40">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                            Vote Weight
                          </Label>
                          <Input
                            type="number"
                            min={0.1}
                            step={0.1}
                            value={myMembership?.vote_weight != null ? String(myMembership.vote_weight) : ''}
                            disabled
                            readOnly
                            placeholder="e.g. 1"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Auto-filled from member's vote weight
                          </p>
                        </div>

                        {/* Rationale Required */}
                        <div className="flex items-center gap-3">
                          <Switch
                            id="rationale-required"
                            checked={voteForm.rationale_required}
                            onCheckedChange={(checked) =>
                              setVoteForm((f) => ({ ...f, rationale_required: checked }))
                            }
                          />
                          <Label htmlFor="rationale-required" className="text-sm cursor-pointer">
                            Rationale required
                          </Label>
                        </div>

                        {/* Justification */}
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                            Justification{voteForm.rationale_required && <span className="text-red-500 ml-1">*</span>}
                          </Label>
                          <Textarea
                            rows={3}
                            value={voteForm.justification}
                            onChange={(e) => setVoteForm((f) => ({ ...f, justification: e.target.value }))}
                            placeholder={
                              voteForm.rationale_required
                                ? 'Justification is required for this vote…'
                                : 'Optional rationale for this vote…'
                            }
                          />
                          {voteForm.rationale_required && !voteForm.justification.trim() && (
                            <p className="text-xs text-red-500 mt-1">Justification is required when rationale is required.</p>
                          )}
                        </div>

                        <Button data-rbac="fit_and_proper.edit"
                          onClick={() => castVote.mutate()}
                          disabled={
                            castVote.isPending ||
                            !myMembership ||
                            !voteForm.vote ||
                            (voteForm.rationale_required && !voteForm.justification.trim())
                          }
                        >
                          {castVote.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Gavel className="h-4 w-4 mr-2" />
                          )}
                          Record Vote
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
