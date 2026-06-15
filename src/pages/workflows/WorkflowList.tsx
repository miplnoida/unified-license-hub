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
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
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
import { ActionNotificationsEditor } from '@/components/workflows/ActionNotificationsEditor';
import { ApproverConfigEditor } from '@/components/workflows/ApproverConfigEditor';
import { StepActionsEditor } from '@/components/workflows/StepActionsEditor';
import { StepEntryNotificationsEditor } from '@/components/workflows/StepEntryNotificationsEditor';
import { Switch } from '@/components/ui/switch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { findDuplicateWorkflow, DUPLICATE_WORKFLOW_MESSAGE } from '@/lib/workflowDuplicateCheck';
import {
  fetchSnapshotForWorkflow,
  applyV2SnapshotToWorkflow,
  isV2Snapshot,
  type TemplateSnapshotV2,
  type TemplateStepV2,
} from '@/lib/workflowTemplateSnapshot';
import { WorkflowVersionPanel } from '@/components/workflows/WorkflowVersionPanel';

// Legacy ALL_ACTIONS list removed — UI action selection is now restricted to
// ALLOWED_UI_ACTION_TYPES (approve / reject / send_back) in
// `src/hooks/useStepActions.ts`. Legacy action_type rows still load and run.


// ─── Templates ───
type TemplateStep = {
  name: string;
  approver_role: string;
  sla_hours?: number;
  allowed_actions?: WorkflowActionType[];
  // v2 fields (optional, present only when template is v2)
  local_id?: string;
  approver_type?: string;
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
  const [isEditingSteps, setIsEditingSteps] = useState(false);

  // Always exit edit mode when switching workflows — no edits carry over.
  useEffect(() => {
    setIsEditingSteps(false);
  }, [selectedId]);

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
  
  const [newEntityType, setNewEntityType] = useState<WorkflowEntityType | ''>('');
  const [newSectorId, setNewSectorId] = useState<string>('none');
  const [seedFromTemplateId, setSeedFromTemplateId] = useState<string>('blank');

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Workflow | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  
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
    if (!newName.trim()) {
      toast.error('Please give the workflow a name');
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

    // Detect v2 template — if so, we'll create the workflow first then apply
    // the full snapshot (preserving approver_type, per-action routing, notifications).
    const v2Steps: TemplateStepV2[] | null =
      templateSteps && isV2Snapshot(templateSteps) ? (templateSteps as unknown as TemplateStepV2[]) : null;

    try {
      let workflowId: string;
      if (v2Steps) {
        // Workflow-only insert via useCreateWorkflow, then apply snapshot.
        const wf = await createWorkflow.mutateAsync({
          name: newName.trim(),
          description: newDesc.trim() || undefined,
          license_type: 'general',
          entity_type: newEntityType as WorkflowEntityType,
          regulator_id: activeRegulatorId,
          sector_id: sectorId,
          category_id: null,
        });
        workflowId = wf.id;
        await applyV2SnapshotToWorkflow({
          workflowId,
          snapshot: { version: 2, steps: v2Steps },
          fallbackRoleId: fallbackRole.id,
          fallbackSystemRole: fallbackRole.system_role || 'admin',
          validRoleIds: new Set(dynamicRoles.map(r => r.id)),
        });
        qc.invalidateQueries({ queryKey: ['approval_steps'] });
      } else {
        workflowId = await createWorkflowWithSteps.mutateAsync({
          workflow: {
            name: newName.trim(),
            description: newDesc.trim() || undefined,
            license_type: 'general',
            entity_type: newEntityType as WorkflowEntityType,
            regulator_id: activeRegulatorId,
            sector_id: sectorId,
            category_id: null,
          },
          steps: stepsPayload,
        });
      }

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
      setNewName(''); setNewDesc('');
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
    
    setEditEntityType(wf.entity_type as WorkflowEntityType);
    setEditSectorId(wf.sector_id || 'none');
    setEditOpen(true);
  };

  const openWorkflowBuilder = (wf: Workflow) => {
    setSelectedId(wf.id);
    setIsEditingSteps(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editName.trim()) {
      toast.error('Name is required.');
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
        // license_type intentionally not updated — column preserved for
        // backward compatibility, but no longer editable in the UI.
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

    let snapshot: TemplateSnapshotV2;
    try {
      snapshot = await fetchSnapshotForWorkflow(selectedWorkflow.id);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to capture workflow snapshot');
      return;
    }

    const payload = {
      name: String(name).trim(),
      description: selectedWorkflow.description,
      entity_type: selectedWorkflow.entity_type,
      // Snapshot is v2; per-step it also carries `approver_role` so the
      // template-list badges keep rendering against legacy expectations.
      steps: snapshot.steps,
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


        <div className="space-y-6">
          {/* Workflow List — full width */}
          <div className="w-full">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <span>Workflows</span>
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
                  <Accordion
                    type="single"
                    collapsible
                    value={selectedId ?? ''}
                    onValueChange={(v) => setSelectedId(v || null)}
                    className="space-y-2"
                  >
                    {workflows.map(wf => {
                      const typeIsKnown = activeTypeKeys.has(wf.entity_type as WorkflowEntityType);
                      const isSelected = selectedId === wf.id;
                      return (
                        <AccordionItem
                          key={wf.id}
                          value={wf.id}
                          className={`relative rounded-lg border-2 bg-card overflow-hidden transition-all duration-200 ${
                            isSelected
                              ? 'border-primary bg-primary/[0.06] shadow-md ring-1 ring-primary/30'
                              : 'border-border hover:border-primary/50 hover:bg-muted/40 hover:shadow-sm'
                          }`}
                        >
                          {isSelected && (
                            <span
                              aria-hidden
                              className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"
                            />
                          )}
                          <div className="flex flex-wrap items-center justify-between gap-2 pr-3">
                            <AccordionTrigger
                              className="flex-1 px-4 py-4 hover:no-underline text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&>svg]:hidden group"
                            >
                              <div className="flex items-center gap-3 w-full min-w-0 text-left">
                                <div
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                                    isSelected
                                      ? 'border-primary bg-primary text-primary-foreground rotate-180'
                                      : 'border-primary/40 bg-background text-primary group-hover:border-primary group-hover:bg-primary/10'
                                  }`}
                                  aria-hidden
                                >
                                  <ChevronDown className="h-5 w-5" strokeWidth={2.5} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-semibold text-foreground truncate">{wf.name}</p>
                                    <Badge
                                      variant={wf.is_active ? 'default' : 'secondary'}
                                      className="text-[10px]"
                                      title={
                                        wf.is_active
                                          ? 'Active workflows are used to route new matching submissions.'
                                          : 'Inactive workflows are saved but not used for new matching submissions.'
                                      }
                                    >
                                      {wf.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <Badge variant="outline" className="text-[10px]">
                                      {getWorkflowTypeLabel(wf.entity_type, workflowTypeConfigs)}
                                    </Badge>
                                    {!typeIsKnown && (
                                      <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
                                        Legacy type
                                      </Badge>
                                    )}
                                    {wf.sector_id && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {(sectors as any[]).find(s => s.id === wf.sector_id)?.name}
                                      </span>
                                    )}
                                    {(wf as any).step_count != null && (
                                      <Badge variant="secondary" className="text-[10px]">
                                        {(wf as any).step_count} step{(wf as any).step_count === 1 ? '' : 's'}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <span
                                  className={`hidden lg:inline-block text-[11px] font-medium shrink-0 transition-colors ${
                                    isSelected ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
                                  }`}
                                >
                                  {isSelected ? 'Click to collapse' : 'Click to expand'}
                                </span>
                              </div>
                            </AccordionTrigger>
                            <div className="flex flex-wrap items-center gap-1 shrink-0 py-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={e => { e.stopPropagation(); openWorkflowBuilder(wf); }}
                                aria-label={`Open workflow builder for ${wf.name}`}
                                title="Open workflow builder"
                              >
                                <Settings2 className="h-3 w-3 mr-1" /> Builder
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={e => { e.stopPropagation(); openEdit(wf); }}
                                aria-label={`Edit workflow ${wf.name}`}
                                title="Edit workflow"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={e => { e.stopPropagation(); handleDelete(wf); }}
                                aria-label={`Delete workflow ${wf.name}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <AccordionContent className="px-4 border-t-2 border-primary/30 bg-muted/20">
                            {isSelected && selectedWorkflow && (
                              <div className="space-y-4 pt-4 pb-2">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                  <div className="min-w-0">
                                    <CardDescription>
                                      {getWorkflowTypeLabel(selectedWorkflow.entity_type, workflowTypeConfigs)} ·
                                      {' '}{steps.length} step{steps.length === 1 ? '' : 's'} · Anyone in the chosen role can approve
                                      {isEditingSteps && (
                                        <span className="ml-2 text-warning font-medium">· Editing — changes save automatically</span>
                                      )}
                                    </CardDescription>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Button variant="outline" size="sm" onClick={() => handleToggleActive(selectedWorkflow)}>
                                      {selectedWorkflow.is_active ? 'Turn Off' : 'Turn On'}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={handleSaveAsTemplate}>
                                      <BookmarkPlus className="h-3.5 w-3.5 mr-1" /> Save as Template
                                    </Button>
                                    {!isEditingSteps ? (
                                      <Button size="sm" onClick={() => setIsEditingSteps(true)}>
                                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Steps
                                      </Button>
                                    ) : (
                                      <>
                                        <Button size="sm" variant="outline" onClick={handleAddStep}>
                                          <Plus className="h-3.5 w-3.5 mr-1" /> Add Step
                                        </Button>
                                        <Button size="sm" onClick={() => setIsEditingSteps(false)}>
                                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Done
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <WorkflowVersionPanel workflowId={selectedWorkflow.id} workflowName={selectedWorkflow.name} />
                                {stepsLoading ? (
                                  <p className="text-muted-foreground text-center py-8 text-sm">Loading...</p>
                                ) : (
                                  <TimelineBuilder
                                    steps={steps}
                                    dynamicRoles={dynamicRoles}
                                    roleLabel={roleLabel}
                                    stepRoleLabel={stepRoleLabel}
                                    isEditing={isEditingSteps}
                                    onUpdate={(id, u) => updateStep.mutateAsync({ id, ...u } as any).then(() => undefined)}
                                    onDelete={(id) => deleteStep.mutate(id)}
                                    onMove={handleMove}
                                    onAdd={handleAddStep}
                                  />
                                )}
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
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
              <Label>Template</Label>
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
  isEditing: boolean;
  onUpdate: (id: string, updates: Partial<WorkflowStep>) => Promise<void> | void;
  onDelete: (id: string) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onAdd: () => void;
  /** Forwarded to StepCard / StepActionsEditor for entity-aware notification defaults. */
  entityType?: string;
}

function TimelineBuilder({ steps, dynamicRoles, roleLabel, stepRoleLabel, isEditing, onUpdate, onDelete, onMove, onAdd, entityType }: TimelineBuilderProps) {
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
            <p className="text-sm text-muted-foreground mb-3">
              {isEditing ? 'No steps yet — add your first approver' : 'No steps configured. Click "Edit Steps" to add one.'}
            </p>
            {isEditing && (
              <Button variant="outline" size="sm" onClick={onAdd}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Step 1
              </Button>
            )}
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
              siblingSteps={steps}
              dynamicRoles={dynamicRoles}
              roleLabel={roleLabel}
              stepRoleLabel={stepRoleLabel}
              isDuplicate={idx === duplicateIdx}
              isEditing={isEditing}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onMove={onMove}
              entityType={entityType}
            />
          </div>
        ))
      )}

      {steps.length > 0 && (
        <>
          {isEditing && (
            <div className="flex justify-center py-1">
              <Button variant="ghost" size="sm" onClick={onAdd} className="text-xs h-7">
                <Plus className="h-3 w-3 mr-1" /> Add another step
              </Button>
            </div>
          )}
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
  /** Other steps in this workflow (used for next-step routing pickers). */
  siblingSteps: WorkflowStep[];
  dynamicRoles: { id: string; name: string; system_role: string }[];
  roleLabel: (sysRole: string) => string;
  stepRoleLabel: (step: { approver_role: string; approver_role_id?: string | null }) => string;
  isDuplicate: boolean;
  isEditing: boolean;
  onUpdate: (id: string, updates: Partial<WorkflowStep>) => Promise<void> | void;
  onDelete: (id: string) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  /** Workflow entity_type — drives entity-aware default event keys in the notifications editor. */
  entityType?: string;
}

function StepCard({ step, index, total, siblingSteps, dynamicRoles, roleLabel, stepRoleLabel, isDuplicate, isEditing, onUpdate, onDelete, onMove, entityType }: StepCardProps) {
  const [roleSearch, setRoleSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  // Optimistic local override so the selected highlight + badge update
  // immediately on click, before the backend round-trip completes.
  const [localRoleId, setLocalRoleId] = useState<string | null>(step.approver_role_id ?? null);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  // ── Local draft state for editable fields ──
  // Bind inputs to local drafts so typing is instant and never waits for
  // a Supabase round-trip. Persist on blur (name + sla) and immediately
  // for checkboxes (which don't suffer keystroke latency). Drafts re-sync
  // from server when the step id changes or when the field is not focused.
  const [nameDraft, setNameDraft] = useState<string>(step.name ?? '');
  const [slaDraft, setSlaDraft] = useState<string>(
    Number.isFinite(step.sla_hours as number) ? String(step.sla_hours) : '48',
  );
  const [slaError, setSlaError] = useState<string | null>(null);
  const [nameFocused, setNameFocused] = useState(false);
  const [slaFocused, setSlaFocused] = useState(false);
  const [allowedDraft, setAllowedDraft] = useState<WorkflowActionType[]>(
    Array.isArray(step.allowed_actions) ? (step.allowed_actions as WorkflowActionType[]) : [],
  );
  const [orderDraft, setOrderDraft] = useState<string>(String(step.step_order));
  const [orderFocused, setOrderFocused] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderFocused) {
      setOrderDraft(String(step.step_order));
      setOrderError(null);
    }
  }, [step.id, step.step_order, orderFocused]);

  const duplicateStepOrder = useMemo(() => {
    const parsed = parseInt(orderDraft, 10);
    if (!Number.isFinite(parsed)) return false;
    return siblingSteps.some(s => s.id !== step.id && s.step_order === parsed);
  }, [orderDraft, siblingSteps, step.id]);

  const commitStepOrder = () => {
    setOrderFocused(false);
    const parsed = parseInt(orderDraft, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setOrderError('Must be a positive number');
      return;
    }
    if (siblingSteps.some(s => s.id !== step.id && s.step_order === parsed)) {
      setOrderError(`Duplicate — step ${parsed} already exists`);
      return;
    }
    setOrderError(null);
    if (parsed === step.step_order) return;
    Promise.resolve(onUpdate(step.id, { step_order: parsed } as any)).catch((e: any) =>
      toast.error(e?.message || 'Failed to update step order'),
    );
  };

  useEffect(() => {
    if (!nameFocused) setNameDraft(step.name ?? '');
  }, [step.id, step.name, nameFocused]);

  useEffect(() => {
    if (!slaFocused) {
      setSlaDraft(Number.isFinite(step.sla_hours as number) ? String(step.sla_hours) : '48');
      setSlaError(null);
    }
  }, [step.id, step.sla_hours, slaFocused]);

  useEffect(() => {
    setAllowedDraft(Array.isArray(step.allowed_actions) ? (step.allowed_actions as WorkflowActionType[]) : []);
  }, [step.id, step.allowed_actions]);

  // Re-sync when the server-side step prop changes (e.g. after refetch or
  // when switching workflows).
  useEffect(() => {
    setLocalRoleId(step.approver_role_id ?? null);
  }, [step.id, step.approver_role_id]);

  const effectiveRoleId = localRoleId ?? step.approver_role_id ?? null;
  const effectiveRole = effectiveRoleId
    ? dynamicRoles.find(r => r.id === effectiveRoleId)
    : dynamicRoles.find(r => r.system_role === step.approver_role);
  const roleExists = !!effectiveRole;
  const displayStepForBadge = {
    approver_role: effectiveRole?.system_role || step.approver_role,
    approver_role_id: effectiveRoleId,
  };

  const filteredRoles = useMemo(
    () => dynamicRoles.filter(r => r.name.toLowerCase().includes(roleSearch.toLowerCase())),
    [dynamicRoles, roleSearch]
  );

  // Close the inline role picker as soon as edit mode is exited.
  useEffect(() => {
    if (!isEditing) {
      setPickerOpen(false);
      setRoleSearch('');
    }
  }, [isEditing]);

  const handleRoleSelect = async (r: { id: string; name: string; system_role: string | null }) => {
    const previous = localRoleId;
    setLocalRoleId(r.id);
    setSavingRoleId(r.id);
    const safeApproverRole =
      (r.system_role && String(r.system_role).trim()) ||
      (step.approver_role && String(step.approver_role).trim()) ||
      'licensing_officer';
    try {
      await Promise.resolve(
        onUpdate(step.id, { approver_role: safeApproverRole as any, approver_role_id: r.id } as any),
      );
      setPickerOpen(false);
      setRoleSearch('');
    } catch (err: any) {
      setLocalRoleId(previous);
      toast.error(err?.message || 'Failed to update role');
    } finally {
      setSavingRoleId(null);
    }
  };

  const allowedActions = allowedDraft;

  const commitName = () => {
    setNameFocused(false);
    const next = nameDraft.trim();
    if (next === (step.name ?? '').trim()) return;
    Promise.resolve(onUpdate(step.id, { name: next } as any)).catch((e: any) =>
      toast.error(e?.message || 'Failed to update step name'),
    );
  };

  const commitSla = () => {
    setSlaFocused(false);
    if (slaDraft === '') {
      setSlaError('Required');
      return;
    }
    const parsed = parseInt(slaDraft, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSlaError('Must be a positive number');
      return;
    }
    const MAX = 24 * 365;
    if (parsed > MAX) {
      setSlaError(`Max ${MAX}`);
      return;
    }
    setSlaError(null);
    if (parsed === step.sla_hours) return;
    Promise.resolve(onUpdate(step.id, { sla_hours: parsed } as any)).catch((e: any) =>
      toast.error(e?.message || 'Failed to update due-within'),
    );
  };

  const toggleAction = (action: WorkflowActionType, checked: boolean) => {
    const prev = allowedDraft;
    const next = checked
      ? Array.from(new Set([...prev, action]))
      : prev.filter(a => a !== action);
    setAllowedDraft(next);
    Promise.resolve(onUpdate(step.id, { allowed_actions: next } as any)).catch((e: any) => {
      setAllowedDraft(prev);
      toast.error(e?.message || 'Failed to update allowed actions');
    });
  };





  return (
    <div className="border-2 rounded-lg bg-card p-4 hover:border-primary/40 transition-colors">
      {/* Header: step number + name + reorder/delete */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
          {index + 1}
        </div>
        {isEditing ? (
          <Input
            className="h-9 text-sm font-medium flex-1 border-none shadow-none focus-visible:ring-1 px-2"
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onFocus={() => setNameFocused(true)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); }
              if (e.key === 'Escape') { setNameDraft(step.name ?? ''); setNameFocused(false); (e.currentTarget as HTMLInputElement).blur(); }
            }}
            placeholder={`Step ${index + 1}`}
            aria-label={`Step ${index + 1} name`}
          />
        ) : (
          <p
            className="h-9 text-sm font-medium flex-1 px-2 flex items-center text-foreground truncate"
            data-testid={`step-name-readonly-${index}`}
          >
            {step.name || `Step ${index + 1}`}
          </p>
        )}
        {isEditing && (
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
              title="Move up"
              aria-label={`Move step ${index + 1} up`}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={index === total - 1}
              onClick={() => onMove(index, 1)}
              title="Move down"
              aria-label={`Move step ${index + 1} down`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-destructive"
              onClick={() => onDelete(step.id)}
              title="Remove step"
              aria-label={`Remove step ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Approver configuration — role-based OR specific users */}
      <div className="pl-11 space-y-3">
        <ApproverConfigEditor
          step={step}
          dynamicRoles={dynamicRoles}
          isEditing={isEditing}
          onUpdate={onUpdate}
        />

        {step.approver_type !== 'specific_users' && !roleExists && (
          <p className="text-xs text-destructive">
            ⚠ Selected role no longer exists. Please pick another role.
          </p>
        )}

        {step.approver_type !== 'specific_users' && isDuplicate && (
          <p className="text-xs text-warning">
            ⚠ Same role as the previous step. Consider merging or changing one.
          </p>
        )}

        {/* In view mode show SLA + allowed actions as read-only summary. */}
        {!isEditing ? (
          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">SLA hours:</span>
              <span>{Number.isFinite(step.sla_hours as number) ? `${step.sla_hours} hours` : '48 hours'}</span>
              {step.auto_approve_on_timeout && (
                <Badge variant="outline" className="text-[10px]">Auto-approve on timeout</Badge>
              )}
            </div>
            <div className="flex items-start gap-2 text-xs">
              <span className="font-medium text-foreground mt-0.5">Allowed actions:</span>
              <div className="flex flex-wrap gap-1">
                {allowedActions.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : allowedActions.map(a => (
                  <Badge key={a} variant="outline" className="text-[10px]">{ACTION_LABELS[a]}</Badge>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border bg-muted/30 p-3 space-y-4" data-testid={`step-edit-controls-${index}`}>
            {/* Step order */}
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-xs text-muted-foreground min-w-[90px]" htmlFor={`step-order-${step.id}`}>Step Order</Label>
              <Input
                id={`step-order-${step.id}`}
                type="number"
                inputMode="numeric"
                min={1}
                className="h-8 w-20 text-xs"
                value={orderDraft}
                onFocus={() => setOrderFocused(true)}
                onChange={e => {
                  setOrderDraft(e.target.value);
                  if (orderError) setOrderError(null);
                }}
                onBlur={commitStepOrder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); }
                }}
                aria-label={`Step ${index + 1} order`}
                aria-invalid={!!orderError || duplicateStepOrder}
              />
              {(orderError || duplicateStepOrder) && (
                <span className="text-[11px] text-destructive" data-testid={`step-order-error-${index}`}>
                  {orderError || `Duplicate — step ${orderDraft} already exists`}
                </span>
              )}
            </div>

            {/* SLA controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-xs text-muted-foreground min-w-[90px]" htmlFor={`sla-${step.id}`}>SLA hours</Label>
              <Input
                id={`sla-${step.id}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={24 * 365}
                step={1}
                className="h-8 w-24 text-xs"
                value={slaDraft}
                onFocus={() => setSlaFocused(true)}
                onKeyDown={(e) => {
                  // Reject negative sign, plus, exponent and decimal — integer-only SLA
                  if (['-', '+', 'e', 'E', '.', ','].includes(e.key)) {
                    e.preventDefault();
                    return;
                  }
                  if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); }
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  const cleaned = text.replace(/[^0-9]/g, '');
                  if (cleaned !== text) {
                    e.preventDefault();
                    setSlaDraft(cleaned);
                    if (slaError) setSlaError(null);
                  }
                }}
                onChange={e => {
                  // Allow only empty string or positive integer digits
                  const raw = e.target.value;
                  const cleaned = raw.replace(/[^0-9]/g, '');
                  setSlaDraft(cleaned);
                  if (slaError) setSlaError(null);
                }}
                onBlur={commitSla}
                aria-label={`Step ${index + 1} SLA hours`}
                aria-invalid={!!slaError}
              />
              <span className="text-xs text-muted-foreground">hours</span>
              {slaError && (
                <span className="text-[11px] text-destructive">{slaError}</span>
              )}
            </div>

            {/* Auto-approve on timeout */}
            <div className="flex items-start gap-3">
              <Switch
                id={`auto-approve-${step.id}`}
                checked={!!step.auto_approve_on_timeout}
                onCheckedChange={(v) => {
                  Promise.resolve(onUpdate(step.id, { auto_approve_on_timeout: !!v } as any)).catch((e: any) =>
                    toast.error(e?.message || 'Failed to update auto-approve setting'),
                  );
                }}
                aria-label="Auto-approve on timeout"
              />
              <div className="flex-1">
                <Label htmlFor={`auto-approve-${step.id}`} className="text-xs cursor-pointer">
                  Auto-approve on timeout
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Saved as step config. Background processor for automatic approval is not yet active —
                  setting is preserved for future runtime support.
                </p>
              </div>
            </div>

            {/* Step entry notifications */}
            <StepEntryNotificationsEditor stepId={step.id} />

            {/* Per-action editor (replaces legacy allowed_actions checkboxes) */}
            <StepActionsEditor step={step} siblingSteps={siblingSteps} entityType={entityType} />
          </div>
        )}

      </div>
    </div>
  );
}


