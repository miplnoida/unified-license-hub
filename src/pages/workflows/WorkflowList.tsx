import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  GitBranch, Plus, Trash2, CheckCircle2, FileInput,
  Users, BookmarkPlus, Workflow as WorkflowIcon, Search,
  ChevronUp, ChevronDown, FileStack, Sparkles, Settings2, Info, X,
  AlertTriangle, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRegulator } from '@/contexts/RegulatorContext';
import {
  useWorkflows, useWorkflowSteps,
  useCreateWorkflow, useCreateWorkflowWithSteps, useUpdateWorkflow, useDeleteWorkflow,
  useCreateStep, useUpdateStep, useDeleteStep, useReorderSteps,
  useWorkflowTypeConfigs, filterActiveWorkflowTypes, getWorkflowTypeLabel,
  type Workflow, type WorkflowStep, type WorkflowEntityType, type WorkflowActionType,
  ACTION_LABELS,
} from '@/hooks/useWorkflowEngine';
import { useRoles, type DynamicRole } from '@/hooks/useRoles';
import { useSectors } from '@/hooks/useMasterConfig';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { findDuplicateWorkflow, DUPLICATE_WORKFLOW_MESSAGE } from '@/lib/workflowDuplicateCheck';

const ALL_ACTIONS: WorkflowActionType[] = ['approve', 'reject', 'send_back', 'escalate', 'request_resubmission'];


// ─── Templates ───
type TemplateStep = {
  name: string;
  approver_role: string;
  sla_hours?: number;
  allowed_actions?: WorkflowActionType[];
};
type WorkflowTemplate = {
  id: string;
  name: string;
  description: string | null;
  entity_type: string;
  steps: TemplateStep[];
};

function useTemplates() {
  return useQuery({
    queryKey: ['workflow_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_templates' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as any[]).map(r => ({
        ...r,
        steps: Array.isArray(r.steps) ? r.steps : [],
      })) as WorkflowTemplate[];
    },
  });
}

// ─── Smart default role resolver ───
// Maps a sector to the most relevant regulator role purely by NAME match
// (no hardcoded ids). Falls back to "Super Admin" role if nothing matches.
function resolveDefaultRoleForSector(
  sectorName: string | null | undefined,
  roles: DynamicRole[],
): { role: DynamicRole | null; matched: boolean } {
  const superAdmin =
    roles.find(r => r.name.trim().toLowerCase() === 'super admin') ||
    roles.find(r => r.system_role === 'super_admin') ||
    null;

  if (!sectorName) return { role: superAdmin, matched: false };

  // Tokenize sector (e.g. "Credit Union", "Cooperatives") and try to find
  // a role whose name contains a sector token, preferring "regulator" roles.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim();
  const sectorTokens = norm(sectorName)
    .split(/\s+/)
    .filter(t => t.length >= 4); // avoid noise words like "of", "and"

  if (sectorTokens.length === 0) return { role: superAdmin, matched: false };

  // Strip plural "s" for loose matching (Cooperatives -> cooperative)
  const stems = sectorTokens.map(t => t.endsWith('s') ? t.slice(0, -1) : t);

  const candidates = roles.filter(r => {
    const rn = norm(r.name);
    return stems.some(stem => rn.includes(stem));
  });

  if (candidates.length === 0) return { role: superAdmin, matched: false };

  // Prefer roles containing "regulator" (handles common typos like "regualtor" too)
  const preferred =
    candidates.find(r => /regul[au]tor/i.test(r.name)) ||
    candidates[0];

  return { role: preferred, matched: true };
}

export default function WorkflowList() {
  const { activeRegulatorId } = useRegulator();
  const { data: workflows = [], isLoading } = useWorkflows(activeRegulatorId);
  const {
    data: workflowTypeConfigs = [],
    isLoading: typesLoading,
    isError: typesError,
    error: typesErrorObj,
  } = useWorkflowTypeConfigs();
  const { data: dynamicRoles = [], isLoading: rolesLoading } = useRoles();
  const { data: sectors = [] } = useSectors(activeRegulatorId);
  const { data: templates = [] } = useTemplates();
  const qc = useQueryClient();

  const createWorkflow = useCreateWorkflow();
  const createWorkflowWithSteps = useCreateWorkflowWithSteps();
  const updateWorkflow = useUpdateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const createStep = useCreateStep();
  const updateStep = useUpdateStep();
  const deleteStep = useDeleteStep();
  const reorderSteps = useReorderSteps();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeWorkflowTypes = useMemo(
    () => filterActiveWorkflowTypes(workflowTypeConfigs),
    [workflowTypeConfigs],
  );
  const activeTypeKeys = useMemo(
    () => new Set(activeWorkflowTypes.map(t => t.key)),
    [activeWorkflowTypes],
  );

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLicenseType, setNewLicenseType] = useState('');
  const [newEntityType, setNewEntityType] = useState<WorkflowEntityType | ''>('');
  const [newSectorId, setNewSectorId] = useState<string>('none');
  const [seedFromTemplateId, setSeedFromTemplateId] = useState<string>('blank');

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Workflow | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLicenseType, setEditLicenseType] = useState('');
  const [editEntityType, setEditEntityType] = useState<WorkflowEntityType | ''>('');
  const [editSectorId, setEditSectorId] = useState<string>('none');

  // Templates dialog
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Default the create form's Used For to the first active type as soon as config loads.
  useEffect(() => {
    if (!createOpen) return;
    if (!newEntityType && activeWorkflowTypes.length > 0) {
      setNewEntityType(activeWorkflowTypes[0].key);
    }
  }, [createOpen, activeWorkflowTypes, newEntityType]);

  const selectedWorkflow = workflows.find(w => w.id === selectedId) || null;
  const { data: steps = [], isLoading: stepsLoading } = useWorkflowSteps(selectedId);

  const roleLabel = (sysRole: string) =>
    dynamicRoles.find(r => r.system_role === sysRole)?.name || sysRole;

  const stepRoleLabel = (step: { approver_role: string; approver_role_id?: string | null }) => {
    if (step.approver_role_id) {
      const byId = dynamicRoles.find(r => r.id === step.approver_role_id);
      if (byId) return byId.name;
      return 'Configured role missing';
    }
    return `Legacy role: ${roleLabel(step.approver_role)}`;
  };

  // Live preview of which role will be auto-assigned to Step 1
  const selectedSectorName = useMemo(
    () => (sectors as any[]).find(s => s.id === newSectorId)?.name as string | undefined,
    [sectors, newSectorId],
  );
  const defaultRolePreview = useMemo(
    () => resolveDefaultRoleForSector(selectedSectorName, dynamicRoles),
    [selectedSectorName, dynamicRoles],
  );

  // ── Gate flags ──
  const noActiveTypes = !typesLoading && !typesError && activeWorkflowTypes.length === 0;
  const noRoles = !rolesLoading && dynamicRoles.length === 0;
  const createDisabled =
    typesLoading || typesError || noActiveTypes || rolesLoading || noRoles;
  const createDisabledReason = typesError
    ? 'Workflow type configuration failed to load. Refresh the page or contact an administrator.'
    : noActiveTypes
      ? 'No active workflow types are configured.'
      : noRoles
        ? 'No roles configured. Create at least one role before building a workflow.'
        : null;

  const handleCreate = async () => {
    if (!newName.trim() || !newLicenseType.trim()) {
      toast.error('Please give the workflow a name and a category');
      return;
    }
    if (!newEntityType || !activeTypeKeys.has(newEntityType as WorkflowEntityType)) {
      toast.error('Pick a valid, currently active Used For.');
      return;
    }
    // Pre-validate a role exists BEFORE creating the workflow to avoid orphans.
    const sectorId = newSectorId !== 'none' ? newSectorId : null;
    const sectorName = (sectors as any[]).find(s => s.id === sectorId)?.name as string | undefined;
    const { role: defaultRole, matched } = resolveDefaultRoleForSector(sectorName, dynamicRoles);
    const fallbackRole = defaultRole || dynamicRoles[0];
    if (!fallbackRole) {
      toast.error('No roles configured. Please create at least one role before building a workflow.');
      return;
    }

    // Pre-validate template (if any) resolves at least one step.
    let templateSteps: TemplateStep[] | null = null;
    if (seedFromTemplateId !== 'blank') {
      const tpl = templates.find(t => t.id === seedFromTemplateId);
      if (!tpl || !tpl.steps?.length) {
        toast.error('Selected template has no steps. Pick another template or start blank.');
        return;
      }
      templateSteps = tpl.steps;
    }

    // Duplicate guard — Sector + Used For must be unique per regulator.
    const dup = findDuplicateWorkflow(workflows, {
      regulator_id: activeRegulatorId ?? null,
      sector_id: sectorId,
      entity_type: newEntityType,
    });
    if (dup) {
      toast.error(DUPLICATE_WORKFLOW_MESSAGE, {
        description: `Existing workflow: "${dup.name}"`,
      });
      return;
    }

    // Build the step payload up front so the RPC can insert workflow + steps
    // atomically. If the RPC rejects any step the entire creation rolls back
    // in Postgres — no possibility of an orphan workflow.
    type AtomicStep = {
      step_order: number;
      name: string;
      approver_role: any;
      approver_role_id: string;
      sla_hours: number;
      allowed_actions: WorkflowActionType[];
    };
    const stepsPayload: AtomicStep[] = templateSteps
      ? templateSteps.map((s, i) => {
          const tplRole = dynamicRoles.find(r => r.system_role === s.approver_role) || fallbackRole;
          const tplAllowed = Array.isArray(s.allowed_actions) && s.allowed_actions.length > 0
            ? (s.allowed_actions as WorkflowActionType[])
            : (['approve', 'reject', 'send_back'] as WorkflowActionType[]);
          return {
            step_order: i + 1,
            name: s.name || `Step ${i + 1}`,
            approver_role: ((tplRole.system_role || 'admin') as any),
            approver_role_id: tplRole.id,
            sla_hours: s.sla_hours || 48,
            allowed_actions: tplAllowed,
          };
        })
      : [{
          step_order: 1,
          name: fallbackRole.name ? `${fallbackRole.name} Review` : 'Step 1',
          approver_role: ((fallbackRole.system_role || 'admin') as any),
          approver_role_id: fallbackRole.id,
          sla_hours: 48,
          allowed_actions: ['approve', 'reject', 'send_back'] as WorkflowActionType[],
        }];

    try {
      const workflowId = await createWorkflowWithSteps.mutateAsync({
        workflow: {
          name: newName.trim(),
          description: newDesc.trim() || undefined,
          license_type: newLicenseType.trim(),
          entity_type: newEntityType as WorkflowEntityType,
          regulator_id: activeRegulatorId,
          sector_id: sectorId,
          category_id: null,
        },
        steps: stepsPayload,
      });

      toast.success('Workflow created');
      if (!templateSteps && sectorName) {
        toast.success(
          matched
            ? `Step 1 auto-assigned to "${fallbackRole.name}" based on sector`
            : `No matching regulator role for "${sectorName}" — defaulted to "${fallbackRole.name}"`,
        );
      }
      setSelectedId(workflowId);
      setCreateOpen(false);
      setNewName(''); setNewDesc(''); setNewLicenseType('');
      setNewEntityType(activeWorkflowTypes[0]?.key ?? '');
      setNewSectorId('none'); setSeedFromTemplateId('blank');
    } catch (err: any) {
      // No client-side rollback needed — the RPC ran in a single transaction,
      // so a failure means nothing was inserted.
      toast.error(err?.message || 'Failed to create workflow');
    }
  };

  // Count workflow_instances referencing this workflow before allowing hard delete.
  const fetchInstanceCount = async (workflowId: string): Promise<number> => {
    const { count, error } = await supabase
      .from('workflow_instances')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_id', workflowId);
    if (error) throw error;
    return count ?? 0;
  };

  const handleDelete = async (wf: Workflow) => {
    let depCount = 0;
    try { depCount = await fetchInstanceCount(wf.id); }
    catch (err: any) { toast.error(err.message); return; }

    if (depCount > 0) {
      const res = await Swal.fire({
        title: 'Cannot delete — workflow is in use',
        html: `<p>"<strong>${wf.name}</strong>" has <strong>${depCount}</strong> active or historical workflow instance${depCount === 1 ? '' : 's'} depending on it.</p><p style="margin-top:8px">Deactivate it instead — it stops being used for new submissions but history is preserved.</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: wf.is_active ? 'Deactivate' : 'Keep',
        cancelButtonText: 'Cancel',
      });
      if (res.isConfirmed && wf.is_active) {
        try {
          await updateWorkflow.mutateAsync({ id: wf.id, is_active: false } as any);
          toast.success('Workflow deactivated');
        } catch (err: any) { toast.error(err.message); }
      }
      return;
    }

    const res = await Swal.fire({
      title: 'Delete workflow?',
      text: `"${wf.name}" and all its steps will be permanently removed.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'hsl(0 84% 60%)',
    });
    if (!res.isConfirmed) return;
    try {
      await deleteWorkflow.mutateAsync(wf.id);
      if (selectedId === wf.id) setSelectedId(null);
      toast.success('Workflow deleted');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleActive = async (wf: Workflow) => {
    // Turning OFF: warn if it has live instances, but allow.
    if (wf.is_active) {
      let depCount = 0;
      try { depCount = await fetchInstanceCount(wf.id); } catch { /* non-fatal */ }
      if (depCount > 0) {
        const res = await Swal.fire({
          title: 'Turn off this workflow?',
          html: `<p>${depCount} workflow instance${depCount === 1 ? '' : 's'} reference this workflow. They will keep running, but new submissions in this scope will not be routed.</p>`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Turn Off',
        });
        if (!res.isConfirmed) return;
      }
      try {
        await updateWorkflow.mutateAsync({ id: wf.id, is_active: false } as any);
        toast.success('Workflow turned off');
      } catch (err: any) { toast.error(err.message); }
      return;
    }

    // Turning ON: validate type is active, no duplicate active, ≥1 step, every step has a role + ≥1 allowed action.
    if (!activeTypeKeys.has(wf.entity_type as WorkflowEntityType)) {
      toast.error('This workflow uses an inactive type. Update its Used For before turning it on.');
      return;
    }
    const dup = findDuplicateWorkflow(
      workflows.filter(w => w.is_active),
      {
        regulator_id: wf.regulator_id,
        sector_id: wf.sector_id,
        entity_type: wf.entity_type,
      },
      wf.id,
    );
    if (dup) {
      toast.error(DUPLICATE_WORKFLOW_MESSAGE, {
        description: `Another active workflow exists in this scope: "${dup.name}".`,
      });
      return;
    }
    const { data: wfSteps, error: stepsErr } = await supabase
      .from('approval_steps')
      .select('id, approver_role_id, approver_role, allowed_actions')
      .eq('workflow_id', wf.id);
    if (stepsErr) { toast.error(stepsErr.message); return; }
    if (!wfSteps || wfSteps.length === 0) {
      toast.error('Add at least one step before turning this workflow on.');
      return;
    }
    const roleIds = new Set(dynamicRoles.map(r => r.id));
    const invalid = wfSteps.filter(s =>
      !s.approver_role_id ||
      !roleIds.has(s.approver_role_id as string) ||
      !Array.isArray(s.allowed_actions) ||
      (s.allowed_actions as any[]).length === 0
    );
    if (invalid.length > 0) {
      toast.error(`${invalid.length} step${invalid.length === 1 ? '' : 's'} need${invalid.length === 1 ? 's' : ''} a valid role and at least one allowed action.`);
      return;
    }
    try {
      await updateWorkflow.mutateAsync({ id: wf.id, is_active: true } as any);
      toast.success('Workflow turned on');
    } catch (err: any) { toast.error(err.message); }
  };

  // ── Edit workflow metadata ──
  const openEdit = (wf: Workflow) => {
    setEditTarget(wf);
    setEditName(wf.name);
    setEditDesc(wf.description || '');
    setEditLicenseType(wf.license_type);
    setEditEntityType(wf.entity_type as WorkflowEntityType);
    setEditSectorId(wf.sector_id || 'none');
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editName.trim() || !editLicenseType.trim()) {
      toast.error('Name and category are required.');
      return;
    }
    if (!editEntityType || !activeTypeKeys.has(editEntityType as WorkflowEntityType)) {
      toast.error('Pick a valid, currently active Used For.');
      return;
    }
    const sectorId = editSectorId !== 'none' ? editSectorId : null;
    const scopeChanged =
      sectorId !== editTarget.sector_id || editEntityType !== editTarget.entity_type;

    // Duplicate guard for the new scope, excluding self.
    const dup = findDuplicateWorkflow(workflows, {
      regulator_id: editTarget.regulator_id,
      sector_id: sectorId,
      entity_type: editEntityType,
    }, editTarget.id);
    if (dup) {
      toast.error(DUPLICATE_WORKFLOW_MESSAGE, {
        description: `Existing workflow: "${dup.name}"`,
      });
      return;
    }

    if (scopeChanged) {
      let depCount = 0;
      try { depCount = await fetchInstanceCount(editTarget.id); } catch { /* non-fatal */ }
      if (depCount > 0) {
        const res = await Swal.fire({
          title: 'Change scope?',
          html: `<p>This workflow has <strong>${depCount}</strong> in-flight or historical instance${depCount === 1 ? '' : 's'}. Changing Sector or Used For may break routing for them.</p>`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Change anyway',
        });
        if (!res.isConfirmed) return;
      }
    }

    try {
      await updateWorkflow.mutateAsync({
        id: editTarget.id,
        name: editName.trim(),
        description: editDesc.trim() || null,
        license_type: editLicenseType.trim(),
        entity_type: editEntityType,
        sector_id: sectorId,
      } as any);
      toast.success('Workflow updated');
      setEditOpen(false);
      setEditTarget(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };



  const handleAddStep = async () => {
    if (!selectedId) return;
    const lastStep = steps[steps.length - 1];
    const lastRoleId = lastStep?.approver_role_id || null;
    const lastRole = lastRoleId
      ? dynamicRoles.find(r => r.id === lastRoleId)
      : dynamicRoles[0];
    if (!lastRole) {
      toast.error('No roles configured. Please create at least one role.');
      return;
    }
    try {
      await createStep.mutateAsync({
        workflow_id: selectedId,
        step_order: steps.length + 1,
        name: `Step ${steps.length + 1}`,
        approver_role: (lastRole.system_role || 'admin') as any,
        approver_role_id: lastRole.id,
        sla_hours: 48,
        allowed_actions: ['approve', 'reject', 'send_back'],
      } as any);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleMove = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    const reordered = [...steps];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(target, 0, moved);
    const updates = reordered.map((s, i) => ({ id: s.id, step_order: i + 1 }));
    try {
      await reorderSteps.mutateAsync(updates);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!selectedWorkflow || steps.length === 0) {
      toast.error('Add at least one step first');
      return;
    }
    const { value: name } = await Swal.fire({
      title: 'Save as template',
      input: 'text',
      inputLabel: 'Template name',
      inputValue: `${selectedWorkflow.name} template`,
      showCancelButton: true,
      confirmButtonText: 'Save',
      inputValidator: (v) => (!v?.trim() ? 'Name is required' : undefined),
    });
    if (!name) return;

    const payload = {
      name: String(name).trim(),
      description: selectedWorkflow.description,
      entity_type: selectedWorkflow.entity_type,
      steps: steps.map(s => ({
        name: s.name,
        approver_role: s.approver_role,
        sla_hours: s.sla_hours,
        allowed_actions: Array.isArray(s.allowed_actions) ? s.allowed_actions : [],
      })),
    };
    const { error } = await supabase.from('workflow_templates' as any).insert(payload as any);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['workflow_templates'] });
    toast.success('Template saved');
  };

  const handleDeleteTemplate = async (t: WorkflowTemplate) => {
    const res = await Swal.fire({
      title: 'Delete template?',
      text: t.name,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: 'hsl(0 84% 60%)',
    });
    if (!res.isConfirmed) return;
    const { error } = await supabase.from('workflow_templates' as any).delete().eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['workflow_templates'] });
    toast.success('Template deleted');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Approval Workflows"
          description="Define who approves what — in plain steps. Anyone with the chosen role can approve."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
                <FileStack className="h-4 w-4 mr-2" /> Templates
              </Button>
              <Button
                onClick={() => setCreateOpen(true)}
                disabled={createDisabled}
                title={createDisabledReason || undefined}
              >
                <Plus className="h-4 w-4 mr-2" /> New Workflow
              </Button>
            </div>
          }
        />

        {createDisabledReason && (
          <div className="rounded-md border border-warning/40 bg-warning/10 text-warning-foreground p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Workflow creation is disabled</p>
              <p className="text-muted-foreground">{createDisabledReason}</p>
              {typesError && typesErrorObj && (
                <p className="text-xs text-muted-foreground mt-1">
                  {(typesErrorObj as Error).message}
                </p>
              )}
            </div>
          </div>
        )}


        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Workflow List */}
          <div className="lg:col-span-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" /> Workflows
                  <Badge variant="secondary" className="ml-auto">{workflows.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  <p className="text-muted-foreground text-center py-8 text-sm">Loading...</p>
                ) : workflows.length === 0 ? (
                  <div className="text-center py-8">
                    <WorkflowIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No workflows yet</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Create First Workflow
                    </Button>
                  </div>
                ) : (
                  workflows.map(wf => {
                    const typeIsKnown = activeTypeKeys.has(wf.entity_type as WorkflowEntityType);
                    return (
                      <button
                        key={wf.id}
                        onClick={() => setSelectedId(wf.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedId === wf.id
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{wf.name}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">
                                {getWorkflowTypeLabel(wf.entity_type, workflowTypeConfigs)}
                              </Badge>
                              {!typeIsKnown && (
                                <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
                                  Legacy type
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground truncate">{wf.license_type}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant={wf.is_active ? 'default' : 'secondary'} className="text-[10px]">
                              {wf.is_active ? 'On' : 'Off'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={e => { e.stopPropagation(); openEdit(wf); }}
                              title="Edit workflow"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={e => { e.stopPropagation(); handleDelete(wf); }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}


              </CardContent>
            </Card>
          </div>

          {/* Builder */}
          <div className="lg:col-span-8">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <CardTitle className="text-base">
                      {selectedWorkflow ? selectedWorkflow.name : 'Select a Workflow'}
                    </CardTitle>
                    {selectedWorkflow && (
                      <CardDescription className="mt-1">
                        {getWorkflowTypeLabel(selectedWorkflow.entity_type, workflowTypeConfigs)} ·
                        {' '}{steps.length} step{steps.length === 1 ? '' : 's'} · Anyone in the chosen role can approve
                      </CardDescription>
                    )}
                  </div>
                  {selectedWorkflow && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => handleToggleActive(selectedWorkflow)}>
                        {selectedWorkflow.is_active ? 'Turn Off' : 'Turn On'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleSaveAsTemplate}>
                        <BookmarkPlus className="h-3.5 w-3.5 mr-1" /> Save as Template
                      </Button>
                      <Button size="sm" onClick={handleAddStep}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Step
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedWorkflow ? (
                  <div className="text-center py-12">
                    <WorkflowIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">Pick a workflow on the left, or create a new one</p>
                  </div>
                ) : stepsLoading ? (
                  <p className="text-muted-foreground text-center py-8 text-sm">Loading...</p>
                ) : (
                  <TimelineBuilder
                    steps={steps}
                    dynamicRoles={dynamicRoles}
                    roleLabel={roleLabel}
                    stepRoleLabel={stepRoleLabel}
                    onUpdate={(id, u) => updateStep.mutate({ id, ...u } as any)}
                    onDelete={(id) => deleteStep.mutate(id)}
                    onMove={handleMove}
                    onAdd={handleAddStep}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Workflow</DialogTitle>
            <DialogDescription>Just the basics — you can add steps next.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Workflow Name <span className="text-destructive">*</span></Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., New License Approval" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Used For <span className="text-destructive">*</span></Label>
                <Select
                  value={newEntityType || undefined}
                  onValueChange={v => setNewEntityType(v as WorkflowEntityType)}
                  disabled={activeWorkflowTypes.length === 0}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {activeWorkflowTypes.map((workflowType) => (
                      <SelectItem key={workflowType.key} value={workflowType.key}>{workflowType.display_label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>


              <div>
                <Label>Category <span className="text-destructive">*</span></Label>
                <Input
                  value={newLicenseType}
                  onChange={e => setNewLicenseType(e.target.value)}
                  placeholder="e.g., Banking License"
                />
              </div>
            </div>
            <div>
              <Label>Sector</Label>
              <Select value={newSectorId} onValueChange={setNewSectorId}>
                <SelectTrigger><SelectValue placeholder="Select a sector (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific sector</SelectItem>
                  {(sectors as any[]).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {seedFromTemplateId === 'blank' && (
                <div className="mt-2 flex items-start gap-2 rounded-md border bg-muted/40 p-2.5">
                  <Sparkles className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                  <div className="text-[11px] leading-relaxed">
                    <p className="text-foreground">
                      Step 1 will be auto-assigned to{' '}
                      <span className="font-semibold">
                        {defaultRolePreview.role?.name || 'Super Admin'}
                      </span>
                      {defaultRolePreview.matched ? ' (sector regulator)' : ' (default fallback)'}.
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Default role assigned based on selected sector. You can change or add steps after creation.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div>
              <Label>Start From</Label>
              <Select value={seedFromTemplateId} onValueChange={setSeedFromTemplateId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Smart default (sector regulator)</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.steps.length} step{t.steps.length === 1 ? '' : 's'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createWorkflow.isPending}>
              {createWorkflow.isPending ? 'Creating...' : 'Create Workflow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Workflow Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Workflow</DialogTitle>
            <DialogDescription>Update workflow metadata. Scope changes affect future routing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Workflow Name <span className="text-destructive">*</span></Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Used For <span className="text-destructive">*</span></Label>
                <Select
                  value={editEntityType || undefined}
                  onValueChange={v => setEditEntityType(v as WorkflowEntityType)}
                  disabled={activeWorkflowTypes.length === 0}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {activeWorkflowTypes.map((t) => (
                      <SelectItem key={t.key} value={t.key}>{t.display_label}</SelectItem>
                    ))}
                    {editTarget && !activeTypeKeys.has(editTarget.entity_type as WorkflowEntityType) && (
                      <SelectItem value={editTarget.entity_type} disabled>
                        {getWorkflowTypeLabel(editTarget.entity_type, workflowTypeConfigs)} (legacy)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category <span className="text-destructive">*</span></Label>
                <Input value={editLicenseType} onChange={e => setEditLicenseType(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Sector</Label>
              <Select value={editSectorId} onValueChange={setEditSectorId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific sector</SelectItem>
                  {(sectors as any[]).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={updateWorkflow.isPending}>
              {updateWorkflow.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Templates Dialog */}

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Workflow Templates</DialogTitle>
            <DialogDescription>
              Reuse common approval flows. Pick one when creating a new workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {templates.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                No templates yet. Open a workflow and click <strong>Save as Template</strong>.
              </div>
            ) : (
              templates.map(t => (
                <div key={t.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                      )}
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {getWorkflowTypeLabel(t.entity_type, workflowTypeConfigs)}
                        </Badge>
                        {t.steps.map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">
                            {i + 1}. {roleLabel(s.approver_role)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => handleDeleteTemplate(t)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatesOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ─── Timeline Builder (request → steps → final approval) ───

interface TimelineBuilderProps {
  steps: WorkflowStep[];
  dynamicRoles: { id: string; name: string; system_role: string }[];
  roleLabel: (sysRole: string) => string;
  stepRoleLabel: (step: { approver_role: string; approver_role_id?: string | null }) => string;
  onUpdate: (id: string, updates: Partial<WorkflowStep>) => void;
  onDelete: (id: string) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onAdd: () => void;
}

function TimelineBuilder({ steps, dynamicRoles, roleLabel, stepRoleLabel, onUpdate, onDelete, onMove, onAdd }: TimelineBuilderProps) {
  // Validation: detect duplicate consecutive roles (by role id when available, else system role)
  const duplicateIdx = useMemo(() => {
    const key = (s: WorkflowStep) => s.approver_role_id || `sys:${s.approver_role}`;
    for (let i = 1; i < steps.length; i++) {
      if (key(steps[i]) === key(steps[i - 1])) return i;
    }
    return -1;
  }, [steps]);

  return (
    <div className="space-y-1">
      {/* Start node */}
      <TimelineNode
        icon={<FileInput className="h-4 w-4" />}
        title="Request Submitted"
        subtitle="The journey begins here"
        tone="muted"
      />

      {steps.length === 0 ? (
        <>
          <Connector />
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground mb-3">No steps yet — add your first approver</p>
            <Button variant="outline" size="sm" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Step 1
            </Button>
          </div>
        </>
      ) : (
        steps.map((step, idx) => (
          <div key={step.id}>
            <Connector />
            <StepCard
              step={step}
              index={idx}
              total={steps.length}
              dynamicRoles={dynamicRoles}
              roleLabel={roleLabel}
              stepRoleLabel={stepRoleLabel}
              isDuplicate={idx === duplicateIdx}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onMove={onMove}
            />
          </div>
        ))
      )}

      {steps.length > 0 && (
        <>
          <div className="flex justify-center py-1">
            <Button variant="ghost" size="sm" onClick={onAdd} className="text-xs h-7">
              <Plus className="h-3 w-3 mr-1" /> Add another step
            </Button>
          </div>
          <Connector />
          <TimelineNode
            icon={<CheckCircle2 className="h-4 w-4" />}
            title="Final Approval"
            subtitle="Request is approved and completed"
            tone="primary"
          />
        </>
      )}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center">
      <div className="h-6 w-0.5 bg-border" />
    </div>
  );
}

function TimelineNode({
  icon, title, subtitle, tone,
}: { icon: React.ReactNode; title: string; subtitle?: string; tone: 'muted' | 'primary' }) {
  const cls = tone === 'primary'
    ? 'bg-primary/5 border-primary/30 text-primary'
    : 'bg-muted/40 border-border text-foreground';
  return (
    <div className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 ${cls}`}>
      <div className={tone === 'primary' ? 'text-primary' : 'text-muted-foreground'}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Step Card ───

interface StepCardProps {
  step: WorkflowStep;
  index: number;
  total: number;
  dynamicRoles: { id: string; name: string; system_role: string }[];
  roleLabel: (sysRole: string) => string;
  stepRoleLabel: (step: { approver_role: string; approver_role_id?: string | null }) => string;
  isDuplicate: boolean;
  onUpdate: (id: string, updates: Partial<WorkflowStep>) => void;
  onDelete: (id: string) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
}

function StepCard({ step, index, total, dynamicRoles, roleLabel, stepRoleLabel, isDuplicate, onUpdate, onDelete, onMove }: StepCardProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const roleExists = step.approver_role_id
    ? dynamicRoles.some(r => r.id === step.approver_role_id)
    : dynamicRoles.some(r => r.system_role === step.approver_role);

  const filteredRoles = useMemo(
    () => dynamicRoles.filter(r => r.name.toLowerCase().includes(roleSearch.toLowerCase())),
    [dynamicRoles, roleSearch]
  );

  return (
    <div className="border-2 rounded-lg bg-card p-4 hover:border-primary/40 transition-colors">
      {/* Header: step number + name + reorder/delete */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
          {index + 1}
        </div>
        <Input
          className="h-9 text-sm font-medium flex-1 border-none shadow-none focus-visible:ring-1 px-2"
          value={step.name}
          onChange={e => onUpdate(step.id, { name: e.target.value })}
          placeholder={`Step ${index + 1}`}
        />
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            title="Move up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
            title="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
            onClick={() => onDelete(step.id)}
            title="Remove step"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Role chip + change */}
      <div className="pl-11 space-y-2">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Who approves</Label>
          {!pickerOpen ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="px-3 py-1.5 text-sm gap-1.5">
                <Users className="h-3 w-3" />
                {stepRoleLabel(step)}
              </Badge>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPickerOpen(true)}>
                Change role
              </Button>
            </div>
          ) : (
            <div className="border rounded-md p-2 space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  className="h-8 pl-7 text-xs"
                  placeholder="Search roles..."
                  value={roleSearch}
                  onChange={e => setRoleSearch(e.target.value)}
                />
                <Button
                  variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => { setPickerOpen(false); setRoleSearch(''); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {filteredRoles.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">No roles match.</p>
                ) : filteredRoles.map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      onUpdate(step.id, { approver_role: r.system_role as any, approver_role_id: r.id } as any);
                      setPickerOpen(false); setRoleSearch('');
                    }}
                    className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
                      (step.approver_role_id ? step.approver_role_id === r.id : step.approver_role === r.system_role)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:border-primary/50'
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Any user assigned to this role can approve.
          </p>
        </div>

        {!roleExists && (
          <p className="text-xs text-destructive">
            ⚠ This role no longer exists. Please pick another role.
          </p>
        )}

        {isDuplicate && (
          <p className="text-xs text-warning">
            ⚠ Same role as the previous step. Consider merging or changing one.
          </p>
        )}

        {/* Allowed actions — explicit, no silent defaults */}
        {(!Array.isArray(step.allowed_actions) || step.allowed_actions.length === 0) && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> No allowed actions configured — approvers will be blocked.
          </p>
        )}

        {/* Advanced Options */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground -ml-2">
              <Settings2 className="h-3 w-3 mr-1" />
              Advanced Options
              {advancedOpen ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground min-w-[90px]">Due Within</Label>
                <Input
                  type="number"
                  min={1}
                  max={24 * 365}
                  className="h-8 w-24 text-xs"
                  value={Number.isFinite(step.sla_hours as number) ? (step.sla_hours as number) : 48}
                  onChange={e => {
                    const parsed = parseInt(e.target.value, 10);
                    const safe = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 24 * 365) : 48;
                    onUpdate(step.id, { sla_hours: safe } as any);
                  }}
                />
                <span className="text-xs text-muted-foreground">hours</span>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Allowed actions</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ACTIONS.map(action => {
                    const current = Array.isArray(step.allowed_actions) ? step.allowed_actions as WorkflowActionType[] : [];
                    const checked = current.includes(action);
                    return (
                      <label key={action} className="flex items-center gap-1.5 text-xs cursor-pointer select-none rounded-md border px-2 py-1 bg-background">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = v
                              ? Array.from(new Set([...current, action]))
                              : current.filter(a => a !== action);
                            onUpdate(step.id, { allowed_actions: next } as any);
                          }}
                        />
                        {ACTION_LABELS[action]}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Approvers can only perform actions checked here.
                </p>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Escalation, parallel approvals, and conditional rules are not yet available in this builder.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

      </div>
    </div>
  );
}
