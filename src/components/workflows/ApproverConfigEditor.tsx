/**
 * Approver configuration block for a workflow step.
 *
 * - Role Based User: lets admin pick the primary role (existing
 *   approver_role_id) and optionally additional roles in
 *   approver_config.role_ids.
 * - Specific Users: shows a searchable checkbox list of internal staff
 *   (profiles with any user_roles row, excluding pre_licensee/licensee).
 *
 * Saves are routed through onUpdate (the same prop the StepCard already
 * uses for other step fields), so persistence + invalidation reuse the
 * existing useUpdateStep mutation path.
 */
import { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Search, Users, UserCheck } from 'lucide-react';
import type { WorkflowStep, ApproverConfig, ApproverType } from '@/hooks/useWorkflowEngine';
import { useEmployeeApprovers } from '@/hooks/useEmployeeApprovers';
import { toast } from 'sonner';

/** Minimal role shape the editor needs — accepts both DynamicRole and the
 *  trimmed shape passed by WorkflowList without forcing a full type import. */
interface RoleOption {
  id: string;
  name: string;
  system_role: string | null;
}

interface Props {
  step: WorkflowStep;
  dynamicRoles: RoleOption[];
  isEditing: boolean;
  onUpdate: (id: string, updates: Partial<WorkflowStep>) => Promise<void> | void;
}

export function ApproverConfigEditor({ step, dynamicRoles, isEditing, onUpdate }: Props) {
  const approverType: ApproverType = (step.approver_type as ApproverType) || 'role_based_user';
  const cfg: ApproverConfig = step.approver_config || {};

  const [userSearch, setUserSearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');
  const { data: internalUsers = [], isLoading: usersLoading } = useEmployeeApprovers(userSearch);

  const filteredRoles = useMemo(
    () => dynamicRoles.filter(r => r.name.toLowerCase().includes(roleSearch.toLowerCase())),
    [dynamicRoles, roleSearch],
  );

  const selectedUserIds = useMemo(() => new Set(cfg.user_ids ?? []), [cfg.user_ids]);
  const selectedRoleIds = useMemo(() => {
    const ids = new Set(cfg.role_ids ?? []);
    if (step.approver_role_id) ids.add(step.approver_role_id);
    return ids;
  }, [cfg.role_ids, step.approver_role_id]);

  const setApproverType = async (next: ApproverType) => {
    if (next === approverType) return;
    try {
      await Promise.resolve(
        onUpdate(step.id, {
          approver_type: next,
          // Keep existing config but ensure both shapes are present
          approver_config: next === 'specific_users'
            ? { user_ids: cfg.user_ids ?? [] }
            : { role_ids: cfg.role_ids ?? (step.approver_role_id ? [step.approver_role_id] : []) },
        } as any),
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update approver type');
    }
  };

  const toggleUser = async (userId: string, checked: boolean) => {
    const next = new Set(selectedUserIds);
    if (checked) next.add(userId); else next.delete(userId);
    try {
      await Promise.resolve(
        onUpdate(step.id, {
          approver_config: { user_ids: Array.from(next) },
        } as any),
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update users');
    }
  };

  const toggleRole = async (roleId: string, checked: boolean) => {
    const next = new Set(selectedRoleIds);
    if (checked) next.add(roleId); else next.delete(roleId);
    const arr = Array.from(next);
    // Keep approver_role_id as the "primary" role for back-compat with the
    // role validator trigger. Fall back to the first selected role.
    const primary = step.approver_role_id && next.has(step.approver_role_id)
      ? step.approver_role_id
      : arr[0] ?? null;
    try {
      const primaryRole = primary ? dynamicRoles.find(r => r.id === primary) : null;
      await Promise.resolve(
        onUpdate(step.id, {
          approver_role_id: primary,
          approver_role: (primaryRole?.system_role as any) || step.approver_role,
          approver_config: { role_ids: arr },
        } as any),
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update roles');
    }
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Approver Type</Label>
        {isEditing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setApproverType('role_based_user')}
              className={`flex-1 rounded-md border px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                approverType === 'role_based_user'
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'hover:border-primary/40'
              }`}
              aria-pressed={approverType === 'role_based_user'}
            >
              <Users className="h-3.5 w-3.5" /> Role Based User
            </button>
            <button
              type="button"
              onClick={() => setApproverType('specific_users')}
              className={`flex-1 rounded-md border px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                approverType === 'specific_users'
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'hover:border-primary/40'
              }`}
              aria-pressed={approverType === 'specific_users'}
            >
              <UserCheck className="h-3.5 w-3.5" /> Specific Users
            </button>
          </div>
        ) : (
          <Badge variant="secondary" className="text-xs">
            {approverType === 'specific_users' ? 'Specific Users' : 'Role Based User'}
          </Badge>
        )}
      </div>

      {approverType === 'role_based_user' ? (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">
            Allowed Roles {selectedRoleIds.size > 0 && (
              <span className="text-foreground">({selectedRoleIds.size} selected)</span>
            )}
          </Label>
          {isEditing && (
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search roles..."
                value={roleSearch}
                onChange={e => setRoleSearch(e.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto" data-testid={`approver-roles-${step.id}`}>
            {(isEditing ? filteredRoles : dynamicRoles.filter(r => selectedRoleIds.has(r.id))).map(r => {
              const checked = selectedRoleIds.has(r.id);
              if (!isEditing && !checked) return null;
              return (
                <label
                  key={r.id}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs cursor-${isEditing ? 'pointer' : 'default'} ${
                    checked ? 'bg-primary/10 border-primary' : 'bg-background'
                  }`}
                >
                  {isEditing && (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={v => toggleRole(r.id, !!v)}
                      aria-label={`Toggle role ${r.name}`}
                    />
                  )}
                  <span>{r.name}</span>
                </label>
              );
            })}
            {!isEditing && selectedRoleIds.size === 0 && (
              <span className="text-xs text-muted-foreground">No roles selected.</span>
            )}
          </div>
        </div>
      ) : (
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">
            Allowed Users {selectedUserIds.size > 0 && (
              <span className="text-foreground">({selectedUserIds.size} selected)</span>
            )}
          </Label>
          {isEditing && (
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search internal users..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
          )}
          <div className="border rounded-md max-h-52 overflow-y-auto divide-y" data-testid={`approver-users-${step.id}`}>
            {usersLoading ? (
              <p className="p-2 text-xs text-muted-foreground">Loading users…</p>
            ) : (isEditing ? internalUsers : internalUsers.filter(u => selectedUserIds.has(u.id))).length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">
                {isEditing ? 'No internal users match.' : 'No users selected.'}
              </p>
            ) : (
              (isEditing ? internalUsers : internalUsers.filter(u => selectedUserIds.has(u.id))).map(u => {
                const checked = selectedUserIds.has(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/40 cursor-pointer"
                  >
                    {isEditing && (
                      <Checkbox
                        checked={checked}
                        onCheckedChange={v => toggleUser(u.id, !!v)}
                        aria-label={`Toggle user ${u.full_name || u.email}`}
                      />
                    )}
                    <span className="font-medium flex-1 truncate">{u.full_name || u.email || u.id}</span>
                    {u.email && u.full_name && (
                      <span className="text-muted-foreground truncate">{u.email}</span>
                    )}
                    {u.primary_role && (
                      <Badge variant="outline" className="text-[10px]">{u.primary_role}</Badge>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
