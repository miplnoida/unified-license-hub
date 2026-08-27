import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Shield, Plus, Edit, Trash2, Users, Search, CheckCircle, XCircle, AlertTriangle, Sparkles,
} from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { toast } from 'sonner';
import {
  useRoles, usePermissions, useAllRolePermissions, useRoleUserCounts,
  useCreateRole, useUpdateRole, useDeleteRole, useResetSystemRole,
  DynamicRole, Permission, RoleType, DashboardTier, RoleStatus, RoleScopeConfig,
} from '@/hooks/useRoles';
import { resolveDependencies, permissionHasDependency, cascadeRemoveDependents } from '@/lib/rbac/permissionDependencies';
import {
  useCatalogModules, useCatalogActions,
} from '@/hooks/usePermissionCatalog';
import PermissionCatalogTab from './PermissionCatalogTab';
import { useCan } from '@/hooks/useCan';
import { useRoleTemplates } from '@/hooks/useRoleTemplates';
import {
  ACCESS_LEVEL_LABELS,
  ACCESS_LEVEL_DESCRIPTIONS,
  SENSITIVE_ACTION_NAMES,
  classifyModuleSelection,
  expandLevelActionNames,
  meaningfulLevelsForModule,
  sensitiveActionLabel,
  type AccessLevel,
} from '@/lib/rbac/accessLevels';
import { classifyRole, ROLE_CATEGORY_LABELS } from '@/lib/rbac/roleClassification';
import { buildRoleSummary } from '@/lib/rbac/roleSummary';
import { RecordScopePanel } from '@/components/rbac/RecordScopePanel';
import { RoleMigrationRunnerDialog } from '@/components/rbac/RoleMigrationRunnerDialog';
import { normalizeScopeConfig, validateScopeSelectors } from '@/lib/rbac/scopeConfig';
import { supabase } from '@/integrations/supabase/client';


/** Strip developer-style "Module N - " prefixes. */
const cleanModuleLabel = (label?: string | null, fallbackKey?: string) => {
  const cleaned = String(label || '').replace(/^\s*Module\s*\d+\s*[-–:]\s*/i, '').trim();
  if (cleaned) return cleaned;
  const k = String(fallbackKey || '');
  return k ? k.split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ') : '';
};
/** Humanize an action key like "issue_digital_license" -> "Issue Digital License". */
const humanizeActionLabel = (label?: string | null, key?: string) => {
  const cleaned = String(label || '').trim();
  if (cleaned && cleaned.toLowerCase() !== String(key || '').toLowerCase()) return cleaned;
  const k = String(key || cleaned);
  return k.split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
};

/**
 * Turn a server-side rejection into a sentence an administrator can act on,
 * so a failed grant is never mistaken for a saved one.
 */
const explainSaveFailure = (err: unknown, permissions: Permission[]): string => {
  const raw = String((err as { message?: string })?.message || err || '').trim();
  const moduleLabel = (key: string) => {
    const perm = permissions.find(
      p => String(p.module).toLowerCase().replace(/\s+/g, '_') === key.toLowerCase(),
    );
    return cleanModuleLabel(null, perm?.module || key);
  };
  if (/permission_dependency_violation/i.test(raw)) {
    return 'An action was selected without "View" on the same area. Tick "View" for that area, then save again.';
  }
  const scopeMissing = raw.match(/scope_required_for_module:\s*([a-z0-9_]+)/i);
  if (scopeMissing) {
    return `Choose a data scope for ${moduleLabel(scopeMissing[1])} before saving.`;
  }
  const invalidScope = raw.match(/invalid_scope:\s*module=([a-z0-9_]+),\s*scope=([a-z0-9_]+)/i);
  if (invalidScope) {
    return `"${invalidScope[2]}" is not an allowed data scope for ${moduleLabel(invalidScope[1])}. Pick a different scope.`;
  }
  if (/dependency_still_referenced/i.test(raw)) {
    return 'Cannot remove "View" while other actions in that area are still selected. Untick those actions first.';
  }
  if (/not_authorized|42501/i.test(raw)) {
    return 'You do not have permission to change roles.';
  }
  if (/role_name_required/i.test(raw)) return 'Enter a role name.';
  return raw || 'The role could not be saved. Nothing was changed.';
};

/** Read back the permissions actually stored for a role after a save. */
const fetchStoredPermissionIds = async (roleId: string): Promise<Set<string> | null> => {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', roleId);
  if (error || !data) return null;
  return new Set(data.map(r => r.permission_id as string));
};


/** Business-friendly role type labels. */
const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  internal: 'Internal Regulatory User',
  external: 'External Portal User',
};
const ROLE_TYPE_HELP: Record<RoleType, string> = {
  internal: 'Staff working inside the regulator office',
  external: 'Applicants, licensees and entity portal users',
};

/** Business-friendly dashboard tier labels — internal roles only. */
const DASHBOARD_TIER_LABELS: Record<DashboardTier, string> = {
  operational: 'Operational',
  executive: 'Executive',
};
const DASHBOARD_TIER_HELP: Record<DashboardTier, string> = {
  operational: 'Sees the standard supervisory dashboard with per-module queues.',
  executive: 'Sees the cross-module KPI dashboard with AI-generated insights.',
};

/** Modules considered "external/portal" — only shown for External role type. */
const EXTERNAL_MODULES = new Set([
  'public_complaint_portal',
]);
/** Action keys that are submitter-facing (external) regardless of module. */
const EXTERNAL_ONLY_ACTIONS = new Set([
  'submit', 'view_status', 'upload_documents', 'respond_rfi',
]);
/** Modules considered admin / system — surface them last and group together. */
const ADMIN_MODULES = new Set([
  'user_management', 'role_management', 'settings',
]);

interface CapabilityAction {
  permission: Permission;
  label: string;
}
interface CapabilityGroup {
  moduleKey: string;
  moduleLabel: string;
  description: string;
  actions: CapabilityAction[];
}

/** Quick role templates. Action keys are matched across all modules. */
interface QuickTemplate {
  key: string;
  label: string;
  roleType: RoleType;
  /** modules to include (or undefined for "all non-admin"). */
  modules?: string[];
  /** action keys to include for each listed module (or '*' for all). */
  actions: '*' | string[];
  excludeAdmin?: boolean;
}
const QUICK_TEMPLATES: QuickTemplate[] = [
  { key: 'licensing_officer', label: 'Licensing Officer', roleType: 'internal',
    modules: ['licensing', 'license_management', 'application_management', 'fee_management'],
    actions: ['view', 'create', 'edit', 'approve', 'reject', 'add_legal_notes', 'recommend_conditions', 'issue_digital_license', 'conditional_approve'] },
  { key: 'registration_officer', label: 'Registration Officer', roleType: 'internal',
    modules: ['registration_management'], actions: '*' },
  { key: 'compliance_officer', label: 'Compliance Officer', roleType: 'internal',
    modules: ['returns_management', 'complaint_management', 'fit_and_proper'],
    actions: ['view', 'edit', 'approve', 'reject'] },
  { key: 'supervisor', label: 'Supervisor', roleType: 'internal',
    excludeAdmin: true, actions: ['view', 'approve', 'reject'] },
  { key: 'administrator', label: 'Administrator', roleType: 'internal',
    modules: ['user_management', 'role_management', 'settings', 'report_management'], actions: '*' },
  { key: 'portal_applicant', label: 'Portal Applicant', roleType: 'external',
    modules: ['licensing'], actions: ['submit', 'view_status', 'upload_documents', 'respond_rfi'] },
  { key: 'portal_entity_user', label: 'Portal Entity User', roleType: 'external',
    modules: ['returns_management', 'complaint_management', 'fit_and_proper'],
    actions: ['submit', 'view', 'view_status', 'upload_documents', 'respond_rfi'] },
];

export default function RoleManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<DynamicRole | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<DynamicRole | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formRoleType, setFormRoleType] = useState<RoleType>('internal');
  const [formDashboardTier, setFormDashboardTier] = useState<DashboardTier>('operational');
  const [formStatus, setFormStatus] = useState<RoleStatus>('active');
  const [formScope, setFormScope] = useState<RoleScopeConfig>({});
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [permSearch, setPermSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<DynamicRole | null>(null);
  const [migrationOpen, setMigrationOpen] = useState(false);


  // Exact action gates — the same permissions the DB triggers enforce.
  const canCreate = useCan('role_management', 'create');
  const canEdit = useCan('role_management', 'edit');
  const canDelete = useCan('role_management', 'delete');
  const canReset = useCan('role_management', 'reset');
  const canAssign = useCan('role_management', 'assign_permissions');
  // Wave A: templates are configuration in `sec_role_templates`; the static
  // QUICK_TEMPLATES list is only an offline fallback.
  const { data: dbTemplates = [] } = useRoleTemplates();
  const canViewCatalog = useCan('role_management', 'view_catalog');
  const canManageCatalog = useCan('role_management', 'manage_catalog');

  // Radix bug workaround: when a Dialog is opened from a DropdownMenu (RowActionsMenu),
  // Radix can leave `pointer-events: none` on <body> and orphaned closed overlays in the
  // DOM after the dialog closes, making the page unclickable. A single microtask cleanup
  // races with Radix teardown, so we clear repeatedly over a short bounded window.
  useEffect(() => {
    if (dialogOpen || deleteConfirm) return;
    let cancelled = false;
    const timers: number[] = [];
    const cleanup = () => {
      if (cancelled) return;
      if (document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
      document
        .querySelectorAll('[data-radix-dialog-overlay][data-state="closed"]')
        .forEach((el) => el.parentElement?.removeChild(el));
    };
    // Run on next frame, then a few follow-ups within ~250ms to outlast Radix teardown.
    timers.push(window.requestAnimationFrame(cleanup));
    [0, 50, 120, 250].forEach((d) => {
      timers.push(window.setTimeout(cleanup, d));
    });
    return () => {
      cancelled = true;
      timers.forEach((id) => {
        window.clearTimeout(id);
        window.cancelAnimationFrame(id);
      });
    };
  }, [dialogOpen, deleteConfirm]);



  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const { data: permissions = [] } = usePermissions();
  const { data: allRolePerms = [] } = useAllRolePermissions();
  const { data: userCounts = {} } = useRoleUserCounts();
  const { data: catModules = [] } = useCatalogModules();
  const { data: catActions = [] } = useCatalogActions();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const resetSystemRole = useResetSystemRole();

  /** Map: module key -> { label, description, actions[] } from catalog. */
  const moduleCatalog = useMemo(() => {
    const map = new Map<string, { label: string; description: string; actions: { key: string; label: string }[] }>();
    for (const m of catModules) {
      const acts = catActions
        .filter(a => a.module_id === m.id)
        .sort((x, y) => x.sort_order - y.sort_order)
        .map(a => ({ key: a.key, label: humanizeActionLabel(a.label, a.key) }));
      map.set(m.key, {
        label: cleanModuleLabel(m.label, m.key),
        description: m.description || '',
        actions: acts,
      });
    }
    return map;
  }, [catModules, catActions]);

  /** Lookup: module -> action key -> Permission row. */
  const permLookup = useMemo(() => {
    const map: Record<string, Record<string, Permission>> = {};
    for (const p of permissions) {
      map[p.module] ??= {};
      map[p.module][p.name] = p;
    }
    return map;
  }, [permissions]);

  /** Decide whether (module, action) should appear for the given role type. */
  const isVisibleForRoleType = (moduleKey: string, actionKey: string, roleType: RoleType) => {
    const isExternalAction = EXTERNAL_ONLY_ACTIONS.has(actionKey);
    const isExternalModule = EXTERNAL_MODULES.has(moduleKey);
    if (roleType === 'external') {
      // external sees only submitter actions + portal modules
      return isExternalAction || isExternalModule;
    }
    // internal hides pure submitter actions on internal modules
    if (isExternalAction && !isExternalModule) return false;
    return true;
  };

  /**
   * Build capability groups for the given role type. One card per module.
   * Pulls labels from catalog where available; falls back to permission rows
   * to ensure nothing is hidden if catalog is incomplete.
   */
  const buildCapabilityGroups = (roleType: RoleType): CapabilityGroup[] => {
    const moduleKeys = new Set<string>();
    for (const p of permissions) moduleKeys.add(p.module);
    for (const k of moduleCatalog.keys()) moduleKeys.add(k);

    const groups: CapabilityGroup[] = [];
    for (const moduleKey of moduleKeys) {
      const cat = moduleCatalog.get(moduleKey);
      const moduleLabel = cat?.label || cleanModuleLabel(null, moduleKey);
      const description = cat?.description || '';

      // Build action list (catalog order first, then any extra permission rows).
      const seen = new Set<string>();
      const actions: CapabilityAction[] = [];
      for (const a of cat?.actions || []) {
        const perm = permLookup[moduleKey]?.[a.key];
        if (!perm) continue;
        if (!isVisibleForRoleType(moduleKey, a.key, roleType)) continue;
        actions.push({ permission: perm, label: a.label });
        seen.add(a.key);
      }
      for (const actKey of Object.keys(permLookup[moduleKey] || {})) {
        if (seen.has(actKey)) continue;
        if (!isVisibleForRoleType(moduleKey, actKey, roleType)) continue;
        actions.push({
          permission: permLookup[moduleKey][actKey],
          label: humanizeActionLabel(null, actKey),
        });
      }

      if (actions.length > 0) {
        groups.push({ moduleKey, moduleLabel, description, actions });
      }
    }

    // Sort: non-admin alpha first, admin modules last.
    groups.sort((a, b) => {
      const aAdmin = ADMIN_MODULES.has(a.moduleKey) ? 1 : 0;
      const bAdmin = ADMIN_MODULES.has(b.moduleKey) ? 1 : 0;
      if (aAdmin !== bAdmin) return aAdmin - bAdmin;
      return a.moduleLabel.localeCompare(b.moduleLabel);
    });
    return groups;
  };

  const editGroups = useMemo(
    () => buildCapabilityGroups(formRoleType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formRoleType, moduleCatalog, permLookup, permissions]
  );

  /** Permissions assigned to the role that don't appear in any capability card
   *  (e.g. legacy keys). Kept in a quiet collapsible section to avoid data loss. */
  const editOrphanPerms = useMemo(() => {
    const visible = new Set<string>();
    for (const g of editGroups) for (const a of g.actions) visible.add(a.permission.id);
    return permissions.filter(p => !visible.has(p.id));
  }, [editGroups, permissions]);

  const getPermIdsForRole = (roleId: string) =>
    allRolePerms.filter(rp => rp.role_id === roleId).map(rp => rp.permission_id);

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openCreateDialog = () => {
    setEditingRole(null);
    setFormName(''); setFormDesc(''); setFormPerms([]);
    setFormRoleType('internal');
    setFormDashboardTier('operational');
    setFormStatus('active');
    setFormScope({});
    setPermSearch('');
    setDialogOpen(true);
  };

  const openEditDialog = (role: DynamicRole, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(role);
    setFormName(role.name);
    setFormDesc(role.description || '');
    setFormRoleType((role.role_type || 'internal') as RoleType);
    setFormDashboardTier((role.dashboard_tier || 'operational') as DashboardTier);
    setFormStatus(((role as DynamicRole).status || 'active') as RoleStatus);
    setFormScope(((role as DynamicRole).scope_config ?? {}) as RoleScopeConfig);
    setFormPerms(getPermIdsForRole(role.id));

    setPermSearch('');
    setDialogOpen(true);
  };

  const togglePerm = (permId: string) => {
    const perm = permissions.find(p => p.id === permId);
    setFormPerms(prev => {
      const isSelected = prev.includes(permId);
      const isView = !!perm && perm.name.trim().toLowerCase() === 'view';
      let next = isSelected ? prev.filter(p => p !== permId) : [...prev, permId];

      // Turning OFF `view` on a module: cascade-remove every dependent action
      // on that module so the server-side view-retention trigger never fires.
      if (isSelected && isView && perm) {
        const { resolvedIds, removedIds } = cascadeRemoveDependents(next, permissions);
        if (removedIds.length > 0) {
          const removedNames = removedIds
            .map(id => permissions.find(p => p.id === id)?.name)
            .filter(Boolean)
            .join(', ');
          toast.info(`Removed dependent action${removedIds.length > 1 ? 's' : ''} on ${perm.module}: ${removedNames} (View is required).`);
        }
        next = resolvedIds;
      }

      // Auto-add View when any non-view action is turned on.
      if (!isSelected && perm && permissionHasDependency(perm.name)) {
        const { addedPermissionIds, violations } = resolveDependencies(next, permissions);
        if (violations.length > 0 && addedPermissionIds.length > 0) {
          toast.info(`View on ${perm.module} auto-enabled — required by ${perm.name}.`);
          return [...next, ...addedPermissionIds];
        }
      }
      return next;
    });
  };



  /** Apply a quick template — sets role type and prefills permission ids. */
  const applyTemplate = (tplKey: string) => {
    if (!canAssign) { toast.error('You do not have permission to assign role permissions.'); return; }

    if (!tplKey || tplKey === 'none') return;
    const dbTpl = dbTemplates.find(t => t.key === tplKey);
    if (dbTpl) {
      setFormRoleType(dbTpl.role_type);
      setFormDashboardTier((dbTpl.dashboard_tier as any) || 'operational');
      setFormPerms([...new Set(dbTpl.permissionIds)]);
      toast.success(`Template applied: ${dbTpl.name}`);
      return;
    }
    const tpl = QUICK_TEMPLATES.find(t => t.key === tplKey);
    if (!tpl) return;
    const targetGroups = buildCapabilityGroups(tpl.roleType);
    const ids: string[] = [];
    for (const g of targetGroups) {
      if (tpl.excludeAdmin && ADMIN_MODULES.has(g.moduleKey)) continue;
      if (tpl.modules && !tpl.modules.includes(g.moduleKey)) continue;
      for (const a of g.actions) {
        if (tpl.actions === '*' || tpl.actions.includes(a.permission.name)) {
          ids.push(a.permission.id);
        }
      }
    }
    setFormRoleType(tpl.roleType);
    setFormDashboardTier('operational');
    setFormPerms([...new Set(ids)]);
    toast.success(`Template applied: ${tpl.label}`);
  };

  const handleSave = async () => {
    // Client-side mirror of the DB triggers — refuse to submit if the user
    // lacks the exact action they're about to perform. Backend enforces the
    // same rule via trg_roles_mutation_guard + trg_role_permissions_mutation_guard.
    if (editingRole) {
      if (!canEdit) { toast.error('You do not have permission to edit roles.'); return; }
    } else {
      if (!canCreate) { toast.error('You do not have permission to create roles.'); return; }
    }
    if (!canAssign) {
      toast.error('You do not have permission to assign role permissions.');
      return;
    }
    const name = formName.trim();
    if (!name) { toast.error('Please enter a role name'); return; }
    const dupe = roles.find(r => r.name.trim().toLowerCase() === name.toLowerCase() && r.id !== editingRole?.id);
    if (dupe) { toast.error('A role with this name already exists'); return; }
    if (formPerms.length === 0) {
      toast.error('Please select at least one permission so this role can do something');
      return;
    }
    // Cascade first: drop any dependent action whose View was removed. This
    // matches the DB's `assert_role_permission_view_retained` trigger so the
    // RPC never sees an inconsistent selection (e.g. from legacy role data,
    // template application, or search-scoped clear-all).
    const cascaded = cascadeRemoveDependents([...new Set(formPerms)], permissions);
    if (cascaded.removedIds.length > 0) {
      const names = cascaded.removedIds
        .map(id => permissions.find(p => p.id === id))
        .filter(Boolean)
        .map(p => `${p!.module}.${p!.name}`)
        .join(', ');
      toast.info(`Removed ${cascaded.removedIds.length} dependent action${cascaded.removedIds.length > 1 ? 's' : ''} lacking View: ${names}`);
    }
    // Final safeguard — auto-add prerequisite `view` permissions so the
    // server-side dependency trigger never rejects the save.
    const { resolvedIds, violations, addedPermissionIds } = resolveDependencies(
      cascaded.resolvedIds,
      permissions,
    );
    if (violations.length > 0 && addedPermissionIds.length > 0) {
      toast.info(`Auto-enabled View for ${violations.length} module${violations.length > 1 ? 's' : ''} to satisfy prerequisites.`);
    }
    // Auto-classify and generate a plain-language "Can / Cannot" summary
    // so the persisted metadata always tracks the current permission set.
    const classification = classifyRole(resolvedIds, permissions);
    const summary = buildRoleSummary(resolvedIds, permissions);
    // Normalize scope_config so every selected permission's canonical module
    // has an entry (backend rejects otherwise with `scope_required_for_module`).
    const normalizedScope = normalizeScopeConfig({
      scopeConfig: formScope,
      selectedPermissionIds: resolvedIds,
      permissions,
    });
    const scopeErrors = validateScopeSelectors(normalizedScope);
    if (scopeErrors.length > 0) {
      toast.error(scopeErrors[0]);
      return;
    }
    const payload = {
      name, description: formDesc, system_role: 'analyst',
      role_type: formRoleType,
      dashboard_tier: formRoleType === 'internal' ? formDashboardTier : 'operational' as DashboardTier,
      status: formStatus,
      role_category: classification.category,
      scope_config: normalizedScope,
      access_summary: {
        can: summary.can,
        cannot: summary.cannot,
        perModule: classification.perModule,
        sensitive: classification.sensitive,
      },
      permissionIds: resolvedIds,
    };

    try {
      if (editingRole) {
        await updateRole.mutateAsync({ id: editingRole.id, ...payload });
      } else {
        await createRole.mutateAsync(payload);
      }
    } catch (err) {
      // Keep the dialog open with the ticked boxes intact so an admin never
      // walks away believing a grant was saved when the server rejected it.
      toast.error(explainSaveFailure(err, permissions));
      return;
    }

    // Read back what was actually stored and warn on any difference, so a
    // silently partial save cannot look like a successful grant.
    if (editingRole) {
      const stored = await fetchStoredPermissionIds(editingRole.id);
      if (stored) {
        const missing = resolvedIds.filter(id => !stored.has(id));
        if (missing.length > 0) {
          const labels = missing
            .map(id => permissions.find(p => p.id === id))
            .filter(Boolean)
            .map(p => `${cleanModuleLabel(null, p!.module)}: ${humanizeActionLabel(null, p!.name)}`)
            .join(', ');
          toast.error(
            `Some capabilities were not saved (${labels}). Please reopen the role and try again.`,
          );
          return;
        }
      }
    }
    setDialogOpen(false);
  };


  const handleDelete = async () => {
    if (!deleteConfirm) return;
    if (!canDelete) { toast.error('You do not have permission to delete roles.'); return; }
    await deleteRole.mutateAsync(deleteConfirm.id);
    if (selectedRole?.id === deleteConfirm.id) setSelectedRole(null);
    setDeleteConfirm(null);
  };

  /** Compute the live "Can / Cannot" summary for the dialog form. */
  const editSummary = useMemo(() => {
    const can: string[] = [];
    const cannot: string[] = [];
    for (const g of editGroups) {
      const selected = g.actions.filter(a => formPerms.includes(a.permission.id));
      if (selected.length === 0) {
        cannot.push(`Access ${g.moduleLabel}`);
        continue;
      }
      // Roll up by module — show "<verb> <module>" for major verbs, else module name.
      const verbs = selected.map(a => a.label);
      if (selected.length === g.actions.length) {
        can.push(`Manage ${g.moduleLabel}`);
      } else {
        can.push(`${g.moduleLabel}: ${verbs.slice(0, 4).join(', ')}${verbs.length > 4 ? '…' : ''}`);
      }
    }
    return { can, cannot };
  }, [editGroups, formPerms]);

  /** Same summary, but for the currently-selected role in the side panel. */
  const detailSummary = useMemo(() => {
    if (!selectedRole) return { can: [], cannot: [] };
    const ids = new Set(getPermIdsForRole(selectedRole.id));
    const groups = buildCapabilityGroups((selectedRole.role_type || 'internal') as RoleType);
    const can: string[] = []; const cannot: string[] = [];
    for (const g of groups) {
      const selected = g.actions.filter(a => ids.has(a.permission.id));
      if (selected.length === 0) {
        cannot.push(`Access ${g.moduleLabel}`);
      } else if (selected.length === g.actions.length) {
        can.push(`Manage ${g.moduleLabel}`);
      } else {
        can.push(`${g.moduleLabel}: ${selected.map(a => a.label).slice(0, 4).join(', ')}${selected.length > 4 ? '…' : ''}`);
      }
    }
    return { can, cannot };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, allRolePerms, moduleCatalog, permLookup, permissions]);

  return (
    <DashboardLayout>
      <TooltipProvider delayDuration={150}>
        <div className="space-y-8">
          <div className="flex items-start justify-between animate-slide-up">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Role Management</h1>
              <p className="mt-1 text-muted-foreground">
                Decide what each kind of user can do, in plain language.
              </p>
            </div>
          </div>

          <Tabs defaultValue="roles" className="w-full">
            <TabsList>
              <TabsTrigger value="roles">Roles</TabsTrigger>
              {canViewCatalog && <TabsTrigger value="catalog">Permission Catalog</TabsTrigger>}
            </TabsList>

            {canViewCatalog && (
              <TabsContent value="catalog" className="pt-6">
                <PermissionCatalogTab canManage={canManageCatalog} />
              </TabsContent>
            )}

            <TabsContent value="roles" className="pt-6 space-y-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="relative max-w-md flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search roles..." value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
                </div>
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <Button data-rbac="role_management.edit" variant="outline" onClick={() => setMigrationOpen(true)}>
                      <Sparkles className="h-4 w-4 mr-2" />Classify existing roles
                    </Button>
                  )}
                  {canCreate && (
                    <Button onClick={openCreateDialog} data-rbac="role_management.create">
                      <Plus className="h-4 w-4 mr-2" />Create Role
                    </Button>
                  )}
                </div>

              </div>

              <div className="grid lg:grid-cols-3 gap-6 animate-slide-up delay-200">
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Roles</CardTitle>
                      <CardDescription>Click a role to see what it can do</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {rolesLoading ? (
                        <div className="text-center py-8 text-muted-foreground">Loading roles...</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Role</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Users</TableHead>
                              <TableHead>Permissions</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRoles.map(role => {
                              const rt = (role.role_type || 'internal') as RoleType;
                              const permCount = getPermIdsForRole(role.id).length;
                              return (
                                <TableRow
                                  key={role.id}
                                  className={`cursor-pointer ${selectedRole?.id === role.id ? 'bg-muted/50' : ''}`}
                                  onClick={() => setSelectedRole(role)}
                                >
                                  <TableCell>
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                        <Shield className="h-4 w-4 text-primary" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="font-medium">{role.name}</p>
                                          {role.is_system && (
                                            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                                              System Role
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">{role.description}</p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={rt === 'external' ? 'outline' : 'secondary'}>
                                      {rt === 'external' ? 'External' : 'Internal'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      <Users className="h-4 w-4 text-muted-foreground" />
                                      <span>{userCounts[role.id] || 0}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm text-muted-foreground">
                                      {permCount === 0
                                        ? 'No permissions'
                                        : permCount === 1
                                          ? '1 permission'
                                          : `${permCount} permissions`}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                    <RowActionsMenu dropdownModal={false} actions={[
                                      { label: 'Edit', icon: Edit, onClick: (e) => openEditDialog(role, e as any), hidden: !canEdit },
                                      {
                                        label: 'Reset to defaults',
                                        icon: Shield,
                                        onClick: () => {
                                          if (confirm(`Reset "${role.name}" to its default permissions? Any custom changes will be lost.`)) {
                                            resetSystemRole.mutate(role.name);
                                          }
                                        },
                                        hidden: !role.is_system || !canReset,
                                        separator: true,
                                      },
                                      { label: 'Delete', icon: Trash2, onClick: () => setDeleteConfirm(role), destructive: true, hidden: role.is_system || !canDelete, separator: true },
                                    ]} />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {filteredRoles.length === 0 && (
                              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No roles found</TableCell></TableRow>
                            )}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Role summary panel */}
                <div>
                  <Card className="sticky top-6 flex h-[calc(100vh-8rem)] flex-col overflow-hidden">
                    <CardHeader className="shrink-0">
                      <CardTitle className="text-lg">{selectedRole ? selectedRole.name : 'Role Summary'}</CardTitle>
                      <CardDescription>
                        {selectedRole ? (selectedRole.description || 'What users with this role can and cannot do') : 'Select a role to see what it can do'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 overflow-y-auto p-6 pt-0 pr-3 thin-scrollbar">
                        {selectedRole ? (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={(selectedRole.role_type || 'internal') === 'external' ? 'outline' : 'secondary'}>
                                {ROLE_TYPE_LABELS[(selectedRole.role_type || 'internal') as RoleType]}
                              </Badge>
                              {(selectedRole.role_type || 'internal') === 'internal' && (
                                <Badge variant={selectedRole.dashboard_tier === 'executive' ? 'default' : 'outline'}>
                                  {DASHBOARD_TIER_LABELS[(selectedRole.dashboard_tier || 'operational') as DashboardTier]} dashboard
                                </Badge>
                              )}
                              {selectedRole.is_system && <Badge variant="secondary">System Role</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{userCounts[selectedRole.id] || 0} users assigned</span>
                            </div>

                            <Separator />

                            <div>
                              <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                                <CheckCircle className="h-4 w-4 text-emerald-600" /> Can
                              </p>
                              {detailSummary.can.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Nothing yet</p>
                              ) : (
                                <ul className="space-y-1">
                                  {detailSummary.can.map(line => (
                                    <li key={line} className="text-sm flex gap-2">
                                      <span className="text-emerald-600">✓</span>
                                      <span>{line}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div>
                              <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                                <XCircle className="h-4 w-4 text-muted-foreground" /> Cannot
                              </p>
                              {detailSummary.cannot.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Full access</p>
                              ) : (
                                <ul className="space-y-1">
                                  {detailSummary.cannot.map(line => (
                                    <li key={line} className="text-sm flex gap-2 text-muted-foreground">
                                      <span>✗</span>
                                      <span>{line}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground">Click on a role to view its capabilities</p>
                          </div>
                        )}
                    </CardContent>
                  </Card>

                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Create / Edit Dialog */}
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingRole(null);
              setPermSearch('');
              // Defensive cleanup for any lingering Radix pointer-events lock.
              setTimeout(() => {
                if (document.body.style.pointerEvents === 'none') {
                  document.body.style.pointerEvents = '';
                }
              }, 0);
            }
          }}
        >
          <DialogContent className="max-w-5xl w-[calc(100%-1rem)] max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogTitle>{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
              <DialogDescription>
                Describe the role, then tick the things people with this role should be able to do.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-6">

              {/* Top section: name / description / role type / dashboard tier */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Role Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Licensing Officer" value={formName}
                    onChange={e => setFormName(e.target.value)}
                    disabled={!!editingRole?.is_system} />
                  {editingRole?.is_system && (
                    <p className="text-[11px] text-muted-foreground">System role name cannot be changed.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input placeholder="Short description of this role"
                    value={formDesc} onChange={e => setFormDesc(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Role Type <span className="text-destructive">*</span></Label>
                  <Select
                    value={formRoleType}
                    onValueChange={(v) => setFormRoleType(v as RoleType)}
                    disabled={!!editingRole?.is_system}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal Regulatory User</SelectItem>
                      <SelectItem value="external">External Portal User</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">{ROLE_TYPE_HELP[formRoleType]}</p>
                </div>
                {formRoleType === 'internal' && (
                  <div className="space-y-2">
                    <Label>Dashboard Tier</Label>
                    <Select
                      value={formDashboardTier}
                      onValueChange={(v) => setFormDashboardTier(v as DashboardTier)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="operational">Operational</SelectItem>
                        <SelectItem value="executive">Executive</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{DASHBOARD_TIER_HELP[formDashboardTier]}</p>
                  </div>
                )}
                <div className="space-y-2">

                  <Label>Status</Label>
                  <Select
                    value={formStatus}
                    onValueChange={(v) => setFormStatus(v as RoleStatus)}
                    disabled={!!editingRole?.is_system}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {formStatus === 'active'
                      ? 'Available to assign to users.'
                      : 'Hidden from new assignments; existing users keep access.'}
                  </p>
                </div>
              </div>

              {formDesc.length > 80 && (
                <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} />
              )}

              {/* Quick templates */}
              {!editingRole && (
                <Alert className="bg-muted/40 border-muted">
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle className="text-sm">Start from a template (optional)</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Select onValueChange={applyTemplate}>
                        <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Pick a starting point..." /></SelectTrigger>
                        <SelectContent>
                          {(dbTemplates.length
                            ? dbTemplates.map(t => ({ key: t.key, label: t.name }))
                            : QUICK_TEMPLATES.map(t => ({ key: t.key, label: t.label }))
                          ).map(t => (
                            <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-[11px] text-muted-foreground">
                        You can change anything after applying a template.
                      </span>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              {/* Permissions: capability cards + live summary */}
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Label className="text-base font-semibold">What can this role do?</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search e.g. 'approve', 'report'"
                        value={permSearch}
                        onChange={e => setPermSearch(e.target.value)}
                        className="pl-7 h-8 w-64"
                      />
                    </div>
                  </div>

                  {(() => {
                    const search = permSearch.trim().toLowerCase();
                    const cards = editGroups.map(g => {
                      const filtered = search
                        ? g.actions.filter(a =>
                            a.label.toLowerCase().includes(search) ||
                            g.moduleLabel.toLowerCase().includes(search))
                        : g.actions;
                      return { g, filtered };
                    }).filter(x => x.filtered.length > 0);

                    if (cards.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground italic py-8 text-center">
                          {search ? `No capabilities match "${permSearch}"` : 'No capabilities available'}
                        </p>
                      );
                    }
                    return cards.map(({ g, filtered }) => {
                      // Split filtered actions into regular vs sensitive privileges.
                      // Sensitive privileges are NEVER granted implicitly by any
                      // access-level preset — admins must tick them deliberately.
                      const regularActions = filtered.filter(a => !SENSITIVE_ACTION_NAMES.has(a.permission.name.toLowerCase()));
                      const sensitiveActions = filtered.filter(a => SENSITIVE_ACTION_NAMES.has(a.permission.name.toLowerCase()));
                      const allChecked = filtered.every(a => formPerms.includes(a.permission.id));
                      const someChecked = filtered.some(a => formPerms.includes(a.permission.id)) && !allChecked;
                      const selectedCount = filtered.filter(a => formPerms.includes(a.permission.id)).length;

                      // Classify the CURRENT selection for this module into a
                      // business-friendly Access Level so the dropdown reflects
                      // what the admin has actually configured.
                      const availableRegularNames = regularActions.map(a => a.permission.name);
                      const selectedRegularNames = regularActions
                        .filter(a => formPerms.includes(a.permission.id))
                        .map(a => a.permission.name);
                      const classified = classifyModuleSelection(selectedRegularNames, availableRegularNames);
                      const currentLevel: AccessLevel | 'custom' = classified.level;
                      const availableLevels = meaningfulLevelsForModule(availableRegularNames);
                      const sensitiveSelectedCount = sensitiveActions.filter(a => formPerms.includes(a.permission.id)).length;

                      const applyLevel = (level: AccessLevel) => {
                        if (!canAssign) return;
                        const wanted = new Set(expandLevelActionNames(level));
                        // Ids for regular actions this module actually offers.
                        const regularIds = new Set(regularActions.map(a => a.permission.id));
                        const idsToAdd = regularActions
                          .filter(a => wanted.has(a.permission.name.toLowerCase()))
                          .map(a => a.permission.id);
                        setFormPerms(prev => {
                          // Remove ALL current regular perms for this module, then add the wanted set.
                          // Sensitive privileges are preserved untouched.
                          const kept = prev.filter(id => !regularIds.has(id));
                          const next = [...kept, ...idsToAdd];
                          // Cascade-remove any dependent action (including sensitive
                          // privileges) that just lost its View prerequisite.
                          const cascaded = cascadeRemoveDependents(next, permissions);
                          if (cascaded.removedIds.length > 0) {
                            toast.info(`Cleared ${cascaded.removedIds.length} dependent action${cascaded.removedIds.length > 1 ? 's' : ''} on this module because the selected level does not include View.`);
                          }
                          const { resolvedIds } = resolveDependencies(cascaded.resolvedIds, permissions);
                          return [...new Set(resolvedIds)];
                        });
                      };

                      const selectAll = () => {
                        const ids = regularActions.map(a => a.permission.id);
                        setFormPerms(prev => [...new Set([...prev, ...ids])]);
                      };
                      const clearAll = () => {
                        const ids = new Set(filtered.map(a => a.permission.id));
                        setFormPerms(prev => {
                          const next = prev.filter(id => !ids.has(id));
                          const cascaded = cascadeRemoveDependents(next, permissions);
                          if (cascaded.removedIds.length > 0) {
                            toast.info(`Also removed dependent action${cascaded.removedIds.length > 1 ? 's' : ''} that require View.`);
                          }
                          return cascaded.resolvedIds;
                        });
                      };
                      const summary =
                        selectedCount === 0 ? 'No access'
                        : selectedCount === filtered.length ? 'Full access'
                        : `${selectedCount} of ${filtered.length} selected`;

                      return (
                        <Card key={g.moduleKey} className="overflow-hidden">
                          <div className="flex items-start gap-3 px-4 py-2.5 bg-muted/40 border-b">
                            <Checkbox
                              className="mt-1"
                              checked={allChecked}
                              disabled={!canAssign}
                              ref={el => { if (el) (el as any).indeterminate = someChecked; }}
                              onCheckedChange={() => (allChecked ? clearAll() : selectAll())}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div>
                                  <span className="text-sm font-semibold">{g.moduleLabel}</span>
                                  {g.description && (
                                    <p className="text-[11px] text-muted-foreground mt-0.5">{g.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-muted-foreground">{summary}</span>
                                </div>
                              </div>
                              {/* Business-facing access-level preset */}
                              {availableLevels.length > 1 && (
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  <Label className="text-[11px] text-muted-foreground">Access level</Label>
                                  <Select
                                    value={currentLevel === 'custom' ? 'custom' : currentLevel}
                                    onValueChange={(v) => {
                                      if (v === 'custom') return; // custom is display-only
                                      applyLevel(v as AccessLevel);
                                    }}
                                    disabled={!canAssign}
                                  >
                                    <SelectTrigger className="h-7 w-44 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableLevels.map(lvl => (
                                        <SelectItem key={lvl} value={lvl}>
                                          {ACCESS_LEVEL_LABELS[lvl]}
                                        </SelectItem>
                                      ))}
                                      {currentLevel === 'custom' && (
                                        <SelectItem value="custom">Custom</SelectItem>
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <span className="text-[11px] text-muted-foreground">
                                    {currentLevel === 'custom'
                                      ? 'Fine-tuned selection — does not match a standard level.'
                                      : ACCESS_LEVEL_DESCRIPTIONS[currentLevel as AccessLevel]}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          {regularActions.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
                              {regularActions.map(({ permission, label }) => (
                                <div key={permission.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`perm-${permission.id}`}
                                    checked={formPerms.includes(permission.id)}
                                    disabled={!canAssign}
                                    onCheckedChange={() => togglePerm(permission.id)}
                                  />
                                  <label
                                    htmlFor={`perm-${permission.id}`}
                                    className={`text-sm ${canAssign ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                                  >
                                    {label}
                                  </label>
                                </div>
                              ))}
                            </div>
                          )}
                          {sensitiveActions.length > 0 && (
                            <div className="border-t bg-amber-50/40 dark:bg-amber-950/20 px-4 py-3">
                              <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                                  Sensitive privileges
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  Not included by any access level — tick deliberately.
                                  {sensitiveSelectedCount > 0 && ` (${sensitiveSelectedCount} enabled)`}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {sensitiveActions.map(({ permission }) => (
                                  <div key={permission.id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`perm-${permission.id}`}
                                      checked={formPerms.includes(permission.id)}
                                      disabled={!canAssign}
                                      onCheckedChange={() => togglePerm(permission.id)}
                                    />
                                    <label
                                      htmlFor={`perm-${permission.id}`}
                                      className={`text-sm ${canAssign ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                                    >
                                      {sensitiveActionLabel(permission.name)}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    });
                  })()}


                  {/* Quiet legacy permissions section — only shown if role already has some. */}
                  {editOrphanPerms.some(p => formPerms.includes(p.id)) && (
                    <details className="rounded-md border bg-muted/20 px-3 py-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        Legacy permissions kept on this role ({editOrphanPerms.filter(p => formPerms.includes(p.id)).length})
                      </summary>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                        {editOrphanPerms.filter(p => formPerms.includes(p.id)).map(p => (
                          <div key={p.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`legacy-${p.id}`}
                              checked={formPerms.includes(p.id)}
                              onCheckedChange={() => togglePerm(p.id)}
                            />
                            <label htmlFor={`legacy-${p.id}`} className="text-xs cursor-pointer text-muted-foreground">
                              {humanizeActionLabel(null, p.name)}
                            </label>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Record scope — narrows *which records* the role can see per module. */}
                  <RecordScopePanel
                    moduleKeys={Array.from(new Set(
                      editGroups
                        .filter(g => g.actions.some(a => formPerms.includes(a.permission.id)))
                        .map(g => g.moduleKey)
                    ))}
                    moduleLabels={Object.fromEntries(editGroups.map(g => [g.moduleKey, g.moduleLabel]))}
                    value={formScope}
                    onChange={setFormScope}
                    disabled={!canAssign}
                  />
                </div>


                {/* Live role summary */}
                <div>
                  <Card className="flex max-h-[70vh] flex-col overflow-hidden lg:sticky lg:top-2 lg:h-[70vh]">
                    <CardHeader className="shrink-0">
                      <CardTitle className="text-base">This role will be able to</CardTitle>
                      <CardDescription>
                        {formPerms.length === 0
                          ? 'No permissions selected yet'
                          : `${formPerms.length} permission${formPerms.length === 1 ? '' : 's'} selected`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 overflow-y-auto p-4 pt-0 pr-3 thin-scrollbar">

                        <div className="space-y-4">
                          <div>
                            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                              <CheckCircle className="h-4 w-4 text-emerald-600" /> Can
                            </p>
                            {editSummary.can.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">Nothing yet — tick some boxes on the left</p>
                            ) : (
                              <ul className="space-y-1">
                                {editSummary.can.map(line => (
                                  <li key={line} className="text-sm flex gap-2">
                                    <span className="text-emerald-600">✓</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                              <XCircle className="h-4 w-4 text-muted-foreground" /> Cannot
                            </p>
                            {editSummary.cannot.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">Full access</p>
                            ) : (
                              <ul className="space-y-1">
                                {editSummary.cannot.map(line => (
                                  <li key={line} className="text-sm flex gap-2 text-muted-foreground">
                                    <span>✗</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createRole.isPending || updateRole.isPending}>
                {(createRole.isPending || updateRole.isPending) ? 'Saving...' : editingRole ? 'Save Changes' : 'Create Role'}
              </Button>
            </DialogFooter>

          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" /> Delete Role
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone. Users assigned to this role will need to be reassigned.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteRole.isPending}>
                {deleteRole.isPending ? 'Deleting...' : 'Delete Role'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <RoleMigrationRunnerDialog open={migrationOpen} onOpenChange={setMigrationOpen} />
      </TooltipProvider>

    </DashboardLayout>
  );
}
