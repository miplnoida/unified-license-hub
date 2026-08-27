import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import { toast } from 'sonner';
import { Loader2, MessageSquare, Flag, UserPlus, CheckCircle2, XCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { logCoordinationAction } from '@/lib/coordinationAudit';
import { authorizedAction } from '@/lib/rbac/authorizedAction';
import { EscalationsTab } from '@/components/coordination/EscalationsTab';

const STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  pending_clearance: { label: 'Pending Clearance', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  cleared: { label: 'Cleared', className: 'bg-green-100 text-green-800 border-green-200' },
  closed: { label: 'Closed', className: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const CLEARANCE_META: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
  cleared: { label: 'Cleared', className: 'bg-green-100 text-green-800' },
  blocked: { label: 'Blocked', className: 'bg-red-100 text-red-800' },
  not_required: { label: 'N/A', className: 'bg-slate-100 text-slate-700' },
};

const FLAG_META: Record<string, string> = {
  interdependency: 'bg-purple-100 text-purple-800',
  blocker: 'bg-red-100 text-red-800',
  notice: 'bg-blue-100 text-blue-800',
  concurrent_review: 'bg-amber-100 text-amber-800',
};

export default function CoordinationDetail() {
  const { caseId } = useParams<{ caseId: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: caseRow, isLoading } = useQuery({
    queryKey: ['coordination_case', caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coordination_cases')
        .select('*')
        .eq('id', caseId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const regIds = useMemo(() => {
    const s = new Set<string>();
    if (caseRow?.primary_regulator_id) s.add(caseRow.primary_regulator_id);
    if (caseRow?.owner_regulator_id) s.add(caseRow.owner_regulator_id);
    return [...s];
  }, [caseRow]);

  const { data: regulators } = useQuery({
    queryKey: ['coordination_case_regulators', regIds.join(',')],
    enabled: regIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('regulators')
        .select('id, code, name').in('id', regIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const regMap = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    for (const r of (regulators ?? []) as any[]) m.set(r.id, { code: r.code, name: r.name });
    return m;
  }, [regulators]);

  const { data: participants } = useQuery({
    queryKey: ['coordination_participants', caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coordination_participants')
        .select('*')
        .eq('case_id', caseId!)
        .order('invited_at');
      if (error) throw error;
      return data ?? [];
    },
  });

  const participantUserIds = useMemo(
    () => (participants ?? []).map((p: any) => p.user_id),
    [participants],
  );

  const { data: profiles } = useQuery({
    queryKey: ['coordination_participant_profiles', participantUserIds.join(',')],
    enabled: participantUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', participantUserIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, { name: string; email: string }>();
    for (const p of (profiles ?? []) as any[]) {
      m.set(p.id, { name: p.full_name || p.email || 'Unknown', email: p.email || '' });
    }
    return m;
  }, [profiles]);

  const { data: messages } = useQuery({
    queryKey: ['coordination_messages', caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coordination_messages')
        .select('*')
        .eq('case_id', caseId!)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  const { data: flags } = useQuery({
    queryKey: ['coordination_flags', caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coordination_flags')
        .select('*')
        .eq('case_id', caseId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const isOwner = caseRow?.owner_user_id === user?.id;
  const me = (participants ?? []).find((p: any) => p.user_id === user?.id);

  // --- Mutations ---
  const [msg, setMsg] = useState('');
  const postMessage = useMutation({
    mutationFn: async () => {
      if (!msg.trim() || !user?.id || !caseId) return;
      const { data, error } = await supabase.from('coordination_messages').insert({
        case_id: caseId, author_id: user.id, body: msg.trim(),
      }).select('id').single();
      if (error) throw error;
      await logCoordinationAction('coordination.message.posted', 'coordination_message', data.id, {
        after: { body_length: msg.trim().length },
        context: { caseId, subjectType: caseRow?.subject_type, subjectId: caseRow?.subject_id },
      });
    },
    onSuccess: () => {
      setMsg('');
      qc.invalidateQueries({ queryKey: ['coordination_messages', caseId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const setClearance = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note?: string }) => {
      if (status === 'blocked' && (!note || note.trim().length < 5)) {
        throw new Error('Block requires a note (min 5 chars)');
      }
      await authorizedAction('coordination', 'update', { participant_id: id, clearance_status: status });
      const before = (participants ?? []).find((p: any) => p.id === id) ?? null;
      const { error } = await supabase
        .from('coordination_participants')
        .update({
          clearance_status: status,
          clearance_note: note ?? null,
          cleared_at: status === 'cleared' ? new Date().toISOString() : null,
        })
        .eq('id', id);
      if (error) throw error;
      await logCoordinationAction(
        status === 'cleared' ? 'coordination.participant.cleared' :
        status === 'blocked' ? 'coordination.participant.blocked' :
        'coordination.participant.clearance_updated',
        'coordination_participant', id,
        {
          before: before ? { clearance_status: before.clearance_status } : null,
          after: { clearance_status: status, note: note ?? null },
          context: { caseId, participantId: id, subjectType: caseRow?.subject_type, subjectId: caseRow?.subject_id },
          justification: status === 'blocked' ? note : undefined,
        },
      );
    },
    onSuccess: () => {
      toast.success('Clearance updated');
      qc.invalidateQueries({ queryKey: ['coordination_participants', caseId] });
      qc.invalidateQueries({ queryKey: ['coordination_case', caseId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const [closeOpen, setCloseOpen] = useState(false);
  const [closeRationale, setCloseRationale] = useState('');

  const closeCase = useMutation({
    mutationFn: async () => {
      if (closeRationale.trim().length < 10) {
        throw new Error('Closure rationale must be at least 10 characters');
      }
      await authorizedAction('coordination', 'update', { case_id: caseId, action: 'close' });
      const { error } = await supabase
        .from('coordination_cases')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          closure_rationale: closeRationale.trim(),
          closed_by: user?.id,
        } as any)
        .eq('id', caseId!);
      if (error) {
        await logCoordinationAction('coordination.case.close_blocked', 'coordination_case', caseId!, {
          after: { attempted_status: 'closed', error: error.message },
          context: { caseId: caseId!, subjectType: caseRow?.subject_type, subjectId: caseRow?.subject_id },
        });
        throw error;
      }
      await logCoordinationAction('coordination.case.closed', 'coordination_case', caseId!, {
        after: { status: 'closed', closure_rationale: closeRationale.trim() },
        context: { caseId: caseId!, subjectType: caseRow?.subject_type, subjectId: caseRow?.subject_id },
        justification: closeRationale.trim(),
      });
    },
    onSuccess: () => {
      toast.success('Case closed');
      setCloseOpen(false);
      setCloseRationale('');
      qc.invalidateQueries({ queryKey: ['coordination_case', caseId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Close blocked'),
  });

  if (isLoading) {
    return <DashboardLayout><div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div></DashboardLayout>;
  }
  if (!caseRow) {
    return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Case not found or access denied.</div></DashboardLayout>;
  }

  const statusMeta = STATUS_META[caseRow.status] || STATUS_META.open;
  const pendingCount = (participants ?? []).filter((p: any) => p.clearance_status === 'pending').length;
  const blockedCount = (participants ?? []).filter((p: any) => p.clearance_status === 'blocked').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={caseRow.title}
          description={caseRow.description || `${caseRow.subject_type} case`}
          backHref="/coordination"
          backLabel="All cases"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
              {caseRow.primary_regulator_id && regMap.get(caseRow.primary_regulator_id) && (
                <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-200">
                  Primary: {regMap.get(caseRow.primary_regulator_id)!.code}
                </Badge>
              )}
              {caseRow.owner_regulator_id && caseRow.owner_regulator_id !== caseRow.primary_regulator_id && regMap.get(caseRow.owner_regulator_id) && (
                <Badge variant="outline" className="bg-slate-100 text-slate-700">
                  Owner: {regMap.get(caseRow.owner_regulator_id)!.code}
                </Badge>
              )}
              {isOwner && caseRow.status !== 'closed' && (
                <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
                  <DialogTrigger asChild>
                    <Button data-rbac="coordination.update" variant="outline" size="sm">Close Case</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Close Coordination Case</DialogTitle></DialogHeader>
                    <div className="space-y-3 text-sm">
                      {((flags ?? []).filter((f: any) => f.status === 'open' && ['blocker','interdependency','concurrent_review'].includes(f.flag_type)).length > 0) && (
                        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-800">
                          <div className="font-medium mb-1">Open blocker / interdependency flags:</div>
                          <ul className="list-disc list-inside space-y-0.5">
                            {(flags ?? []).filter((f: any) => f.status === 'open' && ['blocker','interdependency','concurrent_review'].includes(f.flag_type)).map((f: any) => (
                              <li key={f.id}>{f.flag_type} — {f.title}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <Label>Closure rationale *</Label>
                        <Textarea
                          value={closeRationale}
                          onChange={(e) => setCloseRationale(e.target.value)}
                          rows={4}
                          placeholder="Describe the coordination outcome and why the case can be closed (min 10 characters)…"
                        />
                        <div className="text-xs text-muted-foreground mt-1">{closeRationale.trim().length}/10 min</div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The database will reject closure while any open blocker flag or open/in-review escalation remains.
                      </p>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setCloseOpen(false)}>Cancel</Button>
                      <Button data-rbac="coordination.update"
                        onClick={() => closeCase.mutate()}
                        disabled={closeCase.isPending || closeRationale.trim().length < 10}
                      >
                        {closeCase.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Close Case
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          }
        />

        {caseRow.subject_type === 'application' && caseRow.subject_id && (
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="text-sm">
                <span className="text-muted-foreground">Linked application:</span>{' '}
                <span className="font-mono">{caseRow.subject_id}</span>
              </div>
              <Link to={`/applications/${caseRow.subject_id}`}>
                <Button variant="ghost" size="sm"><ExternalLink className="h-3 w-3 mr-1" /> Open</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {(pendingCount > 0 || blockedCount > 0) && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4 text-sm">
              <strong>Conditional Clearance</strong> — final approval on the linked subject is blocked until all participants clear.
              {' '}<span className="text-muted-foreground">{pendingCount} pending, {blockedCount} blocked.</span>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="thread">
          <TabsList>
            <TabsTrigger value="thread"><MessageSquare className="h-4 w-4 mr-2" /> Thread</TabsTrigger>
            <TabsTrigger value="participants"><UserPlus className="h-4 w-4 mr-2" /> Participants ({participants?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="flags"><Flag className="h-4 w-4 mr-2" /> Flags ({flags?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="escalations"><AlertTriangle className="h-4 w-4 mr-2" /> Escalations</TabsTrigger>
          </TabsList>

          <TabsContent value="thread" className="space-y-3">
            <Card>
              <CardContent className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                {(messages ?? []).length === 0 && (
                  <p className="text-muted-foreground text-sm">No messages yet.</p>
                )}
                {(messages ?? []).map((m: any) => {
                  const prof = profileMap.get(m.author_id);
                  return (
                    <div key={m.id} className="border-b pb-2 last:border-0">
                      <div className="text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground">{prof?.name || m.author_id.slice(0, 8)}</span>
                        {' · '}{new Date(m.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            {me && (
              <div className="flex gap-2">
                <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Post a message to all participants…" rows={2} />
                <Button data-rbac="coordination.update" onClick={() => postMessage.mutate()} disabled={!msg.trim() || postMessage.isPending}>Post</Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="participants">
            <ParticipantsTab
              caseId={caseId!}
              isOwner={isOwner}
              participants={participants ?? []}
              profileMap={profileMap}
              currentUserId={user?.id}
              onClearanceChange={(id, status, note) => setClearance.mutate({ id, status, note })}
            />
          </TabsContent>

          <TabsContent value="flags">
            <FlagsTab caseId={caseId!} flags={flags ?? []} canPost={!!me} currentUserId={user?.id} />
          </TabsContent>

          <TabsContent value="escalations">
            <EscalationsTab
              caseId={caseId!}
              canParticipate={!!me}
              isOwner={isOwner}
              participants={(participants ?? []).map((p: any) => ({ user_id: p.user_id }))}
              profileMap={profileMap}
              subjectType={caseRow.subject_type}
              subjectId={caseRow.subject_id}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ---------------- Participants tab ----------------

function ParticipantsTab({
  caseId, isOwner, participants, profileMap, currentUserId, onClearanceChange,
}: {
  caseId: string;
  isOwner: boolean;
  participants: any[];
  profileMap: Map<string, { name: string; email: string }>;
  currentUserId?: string;
  onClearanceChange: (id: string, status: string, note?: string) => void;
}) {
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [role, setRole] = useState<'participant' | 'observer'>('participant');
  const { data: internal } = useInternalUsers(search);

  const invite = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) throw new Error('Pick a user');
      const { data, error } = await supabase.from('coordination_participants').insert({
        case_id: caseId,
        user_id: selectedUserId,
        participant_role: role,
        invited_by: currentUserId!,
      }).select('id').single();
      if (error) throw error;
      await logCoordinationAction('coordination.participant.invited', 'coordination_participant', data.id, {
        after: { user_id: selectedUserId, participant_role: role },
        context: { caseId, participantId: data.id },
      });
    },
    onSuccess: () => {
      toast.success('Participant invited');
      qc.invalidateQueries({ queryKey: ['coordination_participants', caseId] });
      setInviting(false);
      setSelectedUserId('');
      setSearch('');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const [noteById, setNoteById] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Participants</CardTitle>
        {isOwner && (
          <Dialog open={inviting} onOpenChange={setInviting}>
            <DialogTrigger asChild>
              <Button data-rbac="coordination.update" size="sm"><UserPlus className="h-4 w-4 mr-2" /> Invite</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite Participant</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Search internal users…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="max-h-60 overflow-y-auto border rounded">
                  {(internal ?? []).slice(0, 20).map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${selectedUserId === u.id ? 'bg-muted font-medium' : ''}`}
                    >
                      {u.full_name || u.email} <span className="text-xs text-muted-foreground">· {u.primary_role || 'staff'}</span>
                    </button>
                  ))}
                  {(internal ?? []).length === 0 && <div className="p-3 text-sm text-muted-foreground">No matches.</div>}
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={role} onValueChange={(v: any) => setRole(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="participant">Participant (must clear)</SelectItem>
                      <SelectItem value="observer">Observer (read-only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setInviting(false)}>Cancel</Button>
                <Button data-rbac="coordination.update" onClick={() => invite.mutate()} disabled={!selectedUserId || invite.isPending}>
                  {invite.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Invite
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {participants.length === 0 && <p className="text-sm text-muted-foreground">No participants.</p>}
        {participants.map((p) => {
          const prof = profileMap.get(p.user_id);
          const meta = CLEARANCE_META[p.clearance_status] || CLEARANCE_META.pending;
          const isMe = p.user_id === currentUserId;
          return (
            <div key={p.id} className="border rounded p-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">{prof?.name || p.user_id.slice(0, 8)} {isMe && <span className="text-xs text-muted-foreground">(you)</span>}</div>
                <div className="text-xs text-muted-foreground">
                  {p.participant_role} · <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                  {p.cleared_at && <span> · cleared {new Date(p.cleared_at).toLocaleDateString()}</span>}
                </div>
                {p.clearance_note && <div className="text-xs mt-1 italic">"{p.clearance_note}"</div>}
              </div>
              {isMe && p.participant_role !== 'observer' && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Optional note"
                    className="w-40 h-8 text-xs"
                    value={noteById[p.id] || ''}
                    onChange={(e) => setNoteById({ ...noteById, [p.id]: e.target.value })}
                  />
                  <Button size="sm" variant="outline" onClick={() => onClearanceChange(p.id, 'cleared', noteById[p.id])}>
                    <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" /> Clear
                  </Button>
                  <Button data-rbac="coordination.update" size="sm" variant="outline" onClick={() => onClearanceChange(p.id, 'blocked', noteById[p.id])}>
                    <XCircle className="h-3 w-3 mr-1 text-red-600" /> Block
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------------- Flags tab ----------------

function FlagsTab({ caseId, flags, canPost, currentUserId }: {
  caseId: string; flags: any[]; canPost: boolean; currentUserId?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    flag_type: 'interdependency' as string,
    title: '',
    description: '',
    linked_application_id: '',
    linked_license_id: '',
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('Title required');
      const { data, error } = await supabase.from('coordination_flags').insert({
        case_id: caseId,
        flag_type: form.flag_type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        linked_application_id: form.linked_application_id.trim() || null,
        linked_license_id: form.linked_license_id.trim() || null,
        created_by: currentUserId!,
      }).select('id').single();
      if (error) throw error;
      await logCoordinationAction('coordination.flag.raised', 'coordination_flag', data.id, {
        after: { flag_type: form.flag_type, title: form.title.trim() },
        context: { caseId, flagId: data.id },
      });
    },
    onSuccess: () => {
      toast.success('Flag raised');
      qc.invalidateQueries({ queryKey: ['coordination_flags', caseId] });
      setOpen(false);
      setForm({ flag_type: 'interdependency', title: '', description: '', linked_application_id: '', linked_license_id: '' });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('coordination_flags')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: currentUserId! })
        .eq('id', id);
      if (error) throw error;
      await logCoordinationAction('coordination.flag.resolved', 'coordination_flag', id, {
        after: { status: 'resolved' },
        context: { caseId, flagId: id },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coordination_flags', caseId] }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Interdependency & Blocker Flags</CardTitle>
        {canPost && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-rbac="coordination.update" size="sm"><Flag className="h-4 w-4 mr-2" /> Raise Flag</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Raise Flag</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Type</Label>
                  <Select value={form.flag_type} onValueChange={(v) => setForm({ ...form, flag_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interdependency">Interdependency</SelectItem>
                      <SelectItem value="blocker">Blocker</SelectItem>
                      <SelectItem value="notice">Notice</SelectItem>
                      <SelectItem value="concurrent_review">Concurrent Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Linked Application ID</Label>
                    <Input value={form.linked_application_id} onChange={(e) => setForm({ ...form, linked_application_id: e.target.value })} placeholder="UUID (optional)" />
                  </div>
                  <div>
                    <Label>Linked License ID</Label>
                    <Input value={form.linked_license_id} onChange={(e) => setForm({ ...form, linked_license_id: e.target.value })} placeholder="UUID (optional)" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button data-rbac="coordination.update" onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Raise
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {flags.length === 0 && <p className="text-sm text-muted-foreground">No flags yet.</p>}
        {flags.map((f) => (
          <div key={f.id} className="border rounded p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={FLAG_META[f.flag_type] || ''}>{f.flag_type.replace(/_/g, ' ')}</Badge>
                  {f.status === 'resolved' && <Badge variant="outline" className="bg-green-100 text-green-800">resolved</Badge>}
                  <span className="font-medium">{f.title}</span>
                </div>
                {f.description && <div className="text-sm text-muted-foreground mt-1">{f.description}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  {f.linked_application_id && <>App: <Link to={`/applications/${f.linked_application_id}`} className="underline">{String(f.linked_application_id).slice(0, 8)}</Link> · </>}
                  {f.linked_license_id && <>License: <Link to={`/licenses/${f.linked_license_id}`} className="underline">{String(f.linked_license_id).slice(0, 8)}</Link> · </>}
                  {new Date(f.created_at).toLocaleString()}
                </div>
              </div>
              {canPost && f.status !== 'resolved' && (
                <Button data-rbac="coordination.update" variant="outline" size="sm" onClick={() => resolve.mutate(f.id)}>Resolve</Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
