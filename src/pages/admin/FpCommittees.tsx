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
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import {
  fpCommitteeCreate,
  fpCommitteeMemberAdd,
  fpCommitteeMemberRemove,
  fpCommitteeMemberSetWeight,
  fpCommitteeSetCastingVote,
  fpCommitteeUpdate,
} from '@/lib/fpGovernedOps';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, UserPlus, Users } from 'lucide-react';

const ROLES = ['chair', 'deputy_chair', 'member', 'observer'];

export default function FpCommittees() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', quorum: 3, approval_threshold_pct: 50, is_active: true });
  const [selectedCommittee, setSelectedCommittee] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('member');

  const { data: committees, isLoading } = useQuery({
    queryKey: ['fp_committees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_committees').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members } = useQuery({
    queryKey: ['fp_committee_members', selectedCommittee],
    enabled: !!selectedCommittee,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_committee_members')
        .select('id, user_id, member_role, is_active, added_at, vote_weight')
        .eq('committee_id', selectedCommittee!).order('added_at', { ascending: true });
      if (error) throw error;
      const userIds = (data ?? []).map((m: any) => m.user_id);
      if (!userIds.length) return [];
      const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((m: any) => ({ ...m, profile: map.get(m.user_id) }));
    },
  });

  const selectedCommitteeRow = (committees ?? []).find((c: any) => c.id === selectedCommittee);

  const { data: profileOptions } = useQuery({
    queryKey: ['fp_profile_search'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email').order('full_name').limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveCommittee = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Name required');
      const created = await fpCommitteeCreate({
        name: form.name.trim(),
        quorum: form.quorum,
        approvalThresholdPct: form.approval_threshold_pct,
        description: form.description.trim() || null,
      });
      if (!form.is_active) await fpCommitteeUpdate(created.id, { isActive: false });
    },
    onSuccess: () => {
      toast.success('Committee created');
      qc.invalidateQueries({ queryKey: ['fp_committees'] });
      setOpen(false); setForm({ name: '', description: '', quorum: 3, approval_threshold_pct: 50, is_active: true });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const toggleCommittee = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await fpCommitteeUpdate(id, { isActive: active });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_committees'] }),
  });

  const addMember = useMutation({
    mutationFn: async () => {
      if (!selectedCommittee || !memberUserId) throw new Error('Select user');
      await fpCommitteeMemberAdd({
        committeeId: selectedCommittee,
        userId: memberUserId,
        memberRole,
      });
    },
    onSuccess: () => {
      toast.success('Member added');
      qc.invalidateQueries({ queryKey: ['fp_committee_members', selectedCommittee] });
      setMemberUserId(''); setMemberRole('member');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      await fpCommitteeMemberRemove(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_committee_members', selectedCommittee] }),
  });

  const updateMemberWeight = useMutation({
    mutationFn: async ({ id, weight }: { id: string; weight: number }) => {
      await fpCommitteeMemberSetWeight(id, weight);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_committee_members', selectedCommittee] }),
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const setCastingVote = useMutation({
    mutationFn: async (memberId: string | null) => {
      if (!selectedCommittee) return;
      await fpCommitteeSetCastingVote(selectedCommittee, memberId);
    },
    onSuccess: () => {
      toast.success('Casting vote updated');
      qc.invalidateQueries({ queryKey: ['fp_committees'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="FP Committees"
          description="Committees that vote on fit-and-proper assessments. Set quorum and approval threshold; add members with roles."
          backHref="/admin"
          backLabel="Admin"
          actions={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button data-rbac="fit_and_proper_committee.create"><Plus className="h-4 w-4 mr-2" /> New committee</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New committee</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Quorum (min voting members)</Label><Input type="number" min={1} value={form.quorum} onChange={(e) => setForm({ ...form, quorum: Number(e.target.value) || 1 })} /></div>
                    <div><Label>Approval threshold (%)</Label><Input type="number" min={1} max={100} value={form.approval_threshold_pct} onChange={(e) => setForm({ ...form, approval_threshold_pct: Number(e.target.value) || 50 })} /></div>
                  </div>
                  <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button data-rbac="fit_and_proper_committee.create" onClick={() => saveCommittee.mutate()} disabled={saveCommittee.isPending}>
                    {saveCommittee.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle className="text-base">Committees</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {isLoading && <div className="text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 inline animate-spin mr-2" /> Loading…</div>}
              {(committees ?? []).length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No committees yet.</p>}
              {(committees ?? []).map((c: any) => (
                <div
                  key={c.id}
                  className={`border rounded p-3 cursor-pointer ${selectedCommittee === c.id ? 'border-primary bg-primary/5' : ''}`}
                  onClick={() => setSelectedCommittee(c.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{c.name}</div>
                    <Switch checked={c.is_active} onCheckedChange={(v) => toggleCommittee.mutate({ id: c.id, active: v })} onClick={(e) => e.stopPropagation()} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Quorum {c.quorum} · Threshold {c.approval_threshold_pct}%
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Members</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!selectedCommittee ? (
                <p className="text-sm text-muted-foreground">Pick a committee to manage its members.</p>
              ) : (
                <>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">User</Label>
                      <Select value={memberUserId} onValueChange={setMemberUserId}>
                        <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                        <SelectContent>{(profileOptions ?? []).map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id.slice(0, 8)}</SelectItem>
                        ))}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Role</Label>
                      <Select value={memberRole} onValueChange={setMemberRole}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Button data-rbac="fit_and_proper_committee.edit" onClick={() => addMember.mutate()} disabled={addMember.isPending || !memberUserId}>
                      <UserPlus className="h-4 w-4 mr-2" /> Add
                    </Button>
                  </div>

                  {(members ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3">No members yet.</p>
                  ) : (
                    <>
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
                        <TableHead className="w-24">Weight</TableHead>
                        <TableHead>Active</TableHead><TableHead />
                      </TableRow></TableHeader>
                      <TableBody>
                        {(members ?? []).map((m: any) => (
                          <TableRow key={m.id}>
                            <TableCell>{m.profile?.full_name || '—'}</TableCell>
                            <TableCell className="text-xs">{m.profile?.email || '—'}</TableCell>
                            <TableCell><Badge variant="outline">{m.member_role}</Badge></TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0.1}
                                max={100}
                                step={0.1}
                                defaultValue={m.vote_weight ?? 1}
                                className="h-8 w-20"
                                onBlur={(e) => {
                                  const w = Number(e.target.value);
                                  if (w > 0 && w <= 100 && w !== m.vote_weight) {
                                    updateMemberWeight.mutate({ id: m.id, weight: w });
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell>{m.is_active ? 'Yes' : 'No'}</TableCell>
                            <TableCell><Button size="sm" variant="ghost" onClick={() => { if (confirm('Remove?')) removeMember.mutate(m.id); }}><Trash2 className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="mt-3 flex items-end gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">Casting vote (used to break ties)</Label>
                        <Select
                          value={selectedCommitteeRow?.casting_vote_member_id ?? 'none'}
                          onValueChange={(v) => setCastingVote.mutate(v === 'none' ? null : v)}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {(members ?? []).filter((m: any) => m.is_active).map((m: any) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.profile?.full_name || m.profile?.email || m.id.slice(0, 8)} ({m.member_role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
