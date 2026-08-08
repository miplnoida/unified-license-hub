import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Pencil, PlusCircle, UserMinus, Users } from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import {
  LicenseAppealPanel, LicenseAppealPanelMember,
  useLicenseAppealMutations, useLicenseAppealPanelMembers,
} from '@/hooks/useLicenseAppeals';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import { EmployeeCombobox } from '@/components/entity-detail/EmployeeCombobox';
import { PANEL_MEMBER_ROLE_OPTIONS, panelMemberRoleLabel } from '@/lib/licenseAppeals';

interface Props {
  panel: LicenseAppealPanel | null;
  onOpenChange: (open: boolean) => void;
}

type MemberRole = LicenseAppealPanelMember['member_role'];

/** Constitutes a panel: who sits on it, who chairs it, and who may vote. */
export function AppealPanelMembersDialog({ panel, onOpenChange }: Props) {
  const { data: members, isLoading } = useLicenseAppealPanelMembers(panel?.id);
  const { savePanelMember, standDownPanelMember } = useLicenseAppealMutations();
  const { data: staff } = useInternalUsers(undefined, { activeOnly: true });

  const [editing, setEditing] = useState<LicenseAppealPanelMember | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<MemberRole>('member');
  const [isVoting, setIsVoting] = useState(true);
  const [weight, setWeight] = useState('1');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const options = useMemo(
    () => (staff || []).map((s) => ({ id: s.id, label: s.full_name || s.email || 'Staff member', sublabel: s.email })),
    [staff],
  );
  const nameOf = (id: string) => options.find((o) => o.id === id)?.label ?? 'Staff member';

  const active = (members || []).filter((m) => m.is_active);
  const standingDown = (members || []).filter((m) => !m.is_active);
  const votingCount = active.filter((m) => m.is_voting).length;
  const hasChair = active.some((m) => m.is_chair);

  const startAdd = () => {
    setEditing(null); setUserId(null); setRole('member'); setIsVoting(true);
    setWeight('1'); setFrom(''); setTo(''); setFormOpen(true);
  };
  const startEdit = (m: LicenseAppealPanelMember) => {
    setEditing(m); setUserId(m.user_id); setRole(m.member_role); setIsVoting(m.is_voting);
    setWeight(String(m.vote_weight ?? 1)); setFrom(m.effective_from || ''); setTo(m.effective_to || '');
    setFormOpen(true);
  };

  const save = async () => {
    if (!panel) return;
    if (!userId) { toast.error('Choose a staff member'); return; }
    try {
      await savePanelMember.mutateAsync({
        id: editing?.id,
        panel_id: panel.id,
        user_id: userId,
        member_role: role,
        is_voting: role === 'observer' ? false : isVoting,
        vote_weight: Number(weight) || 1,
        effective_from: from || null,
        effective_to: to || null,
        is_active: true,
      });
      toast.success(editing ? 'Member updated' : 'Member added to the panel');
      setFormOpen(false);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || '';
      toast.error(
        msg.includes('one_chair')
          ? 'This panel already has a chair. Change the current chair first.'
          : msg.includes('unique_active')
            ? 'That person already sits on this panel.'
            : msg || 'Failed to save the member',
      );
    }
  };

  const standDown = async (m: LicenseAppealPanelMember) => {
    const confirm = await Swal.fire({
      title: 'Stand this member down?',
      text: 'They stop sitting on future appeals. Appeals already referred to this panel keep the composition recorded at the time.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, stand down',
      cancelButtonText: 'Cancel',
    });
    if (!confirm.isConfirmed) return;
    try {
      await standDownPanelMember.mutateAsync(m.id);
      toast.success('Member stood down');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to stand the member down');
    }
  };

  return (
    <Dialog open={!!panel} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> {panel?.name} — composition
          </DialogTitle>
          <DialogDescription>
            Quorum for this panel is {panel?.quorum}. Voting members currently sitting: {votingCount}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!hasChair && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This panel has no chair. Appeals cannot be referred to it until a chair is appointed.
            </div>
          )}
          {panel && votingCount < panel.quorum && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Only {votingCount} voting member(s) — below the quorum of {panel.quorum}.
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={startAdd} disabled={isLoading}>
              <PlusCircle className="h-4 w-4 mr-2" /> Add member
            </Button>
          </div>

          <div className="rounded-md border divide-y">
            {active.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No members appointed yet.</p>
            )}
            {active.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-sm font-medium">{nameOf(m.user_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {panelMemberRoleLabel(m.member_role)}
                    {m.is_voting ? ` · voting (weight ${m.vote_weight})` : ' · non-voting'}
                    {m.effective_from ? ` · from ${m.effective_from}` : ''}
                    {m.effective_to ? ` · to ${m.effective_to}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {m.is_chair && <Badge variant="outline">Chair</Badge>}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(m)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => standDown(m)}>
                    <UserMinus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {standingDown.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Past members</p>
              <div className="rounded-md border divide-y">
                {standingDown.map((m) => (
                  <div key={m.id} className="p-3 text-sm text-muted-foreground">
                    {nameOf(m.user_id)} — {panelMemberRoleLabel(m.member_role)}
                    {m.effective_to ? ` (stood down ${m.effective_to})` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {formOpen && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">{editing ? 'Edit member' : 'Appoint a member'}</p>
              <div>
                <Label className="text-xs">Staff member *</Label>
                <EmployeeCombobox
                  value={userId}
                  options={options}
                  onChange={setUserId}
                  placeholder="Select a staff member"
                  testId="appeal-panel-member"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Role on the panel</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PANEL_MEMBER_ROLE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Vote weight</Label>
                  <Input type="number" min="0" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Effective from</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Effective to</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="member-voting"
                  checked={role === 'observer' ? false : isVoting}
                  disabled={role === 'observer'}
                  onCheckedChange={setIsVoting}
                />
                <Label htmlFor="member-voting">Counts towards quorum and voting</Label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={savePanelMember.isPending}>
                  {savePanelMember.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save member
                </Button>
                <Button size="sm" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
