import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  GitBranch, Plus, Trash2, ArrowRight, ArrowDown, CheckCircle2,
  Users, BookmarkPlus, LayoutList, Workflow as WorkflowIcon,
  ChevronUp, ChevronDown, Save, FileStack, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRegulator } from '@/contexts/RegulatorContext';
import {
  useWorkflows, useWorkflowSteps,
  useCreateWorkflow, useUpdateWorkflow, useDeleteWorkflow,
  useCreateStep, useUpdateStep, useDeleteStep, useReorderSteps,
  ENTITY_TYPE_LABELS,
  type Workflow, type WorkflowStep, type WorkflowEntityType,
} from '@/hooks/useWorkflowEngine';
import { useRoles } from '@/hooks/useRoles';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';

// ─── Templates hook (lightweight, kept here for cohesion) ───
type TemplateStep = { name: string; approver_role: string; sla_hours?: number };
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

export default function WorkflowList() {
  const { activeRegulatorId } = useRegulator();
  const { data: workflows = [], isLoading } = useWorkflows(activeRegulatorId);
  const { data: dynamicRoles = [] } = useRoles();
  const { data: templates = [] } = useTemplates();
  const qc = useQueryClient();

  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const createStep = useCreateStep();
  const updateStep = useUpdateStep();
  const deleteStep = useDeleteStep();
  const reorderSteps = useReorderSteps();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'stack' | 'flow'>('stack');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLicenseType, setNewLicenseType] = useState('');
  const [newEntityType, setNewEntityType] = useState<WorkflowEntityType>('application');
  const [seedFromTemplateId, setSeedFromTemplateId] = useState<string>('blank');

  // Templates dialog
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const selectedWorkflow = workflows.find(w => w.id === selectedId) || null;
  const { data: steps = [], isLoading: stepsLoading } = useWorkflowSteps(selectedId);

  const firstRoleSystem = dynamicRoles[0]?.system_role || 'licensing_officer';

  const handleCreate = async () => {
    if (!newName.trim() || !newLicenseType.trim()) {
      toast.error('Workflow name and applicable type are required');
      return;
    }
    try {
      const wf = await createWorkflow.mutateAsync({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        license_type: newLicenseType.trim(),
        entity_type: newEntityType,
        regulator_id: activeRegulatorId,
        sector_id: null,
        category_id: null,
      });

      // Seed steps from template
      if (seedFromTemplateId !== 'blank') {
        const tpl = templates.find(t => t.id === seedFromTemplateId);
        if (tpl?.steps?.length) {
          for (let i = 0; i < tpl.steps.length; i++) {
            const s = tpl.steps[i];
            await createStep.mutateAsync({
              workflow_id: wf.id,
              step_order: i + 1,
              name: s.name || `Level ${i + 1}`,
              approver_role: (s.approver_role || firstRoleSystem) as any,
              sla_hours: s.sla_hours || 48,
              allowed_actions: ['approve', 'reject', 'send_back'],
            });
          }
        }
      }

      toast.success('Workflow created');
      setSelectedId(wf.id);
      setCreateOpen(false);
      setNewName(''); setNewDesc(''); setNewLicenseType('');
      setNewEntityType('application'); setSeedFromTemplateId('blank');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (wf: Workflow) => {
    const res = await Swal.fire({
      title: 'Delete workflow?',
      text: `"${wf.name}" and all its approval levels will be removed.`,
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
    await updateWorkflow.mutateAsync({ id: wf.id, is_active: !wf.is_active } as any);
    toast.success(wf.is_active ? 'Workflow deactivated' : 'Workflow activated');
  };

  const handleAddStep = async () => {
    if (!selectedId) return;
    try {
      await createStep.mutateAsync({
        workflow_id: selectedId,
        step_order: steps.length + 1,
        name: `Level ${steps.length + 1}`,
        approver_role: firstRoleSystem as any,
        sla_hours: 48,
        allowed_actions: ['approve', 'reject', 'send_back'],
      });
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
      toast.error('Add at least one approval level first');
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

  const roleLabel = (sysRole: string) =>
    dynamicRoles.find(r => r.system_role === sysRole)?.name || sysRole;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Approval Workflows"
          description="Configure simple, role-driven approval flows. Each level uses dynamic roles — anyone in the role can approve."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
                <FileStack className="h-4 w-4 mr-2" /> Templates
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> New Workflow
              </Button>
            </div>
          }
        />

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
                  workflows.map(wf => (
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
                              {ENTITY_TYPE_LABELS[wf.entity_type as WorkflowEntityType] || wf.entity_type}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground truncate">{wf.license_type}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant={wf.is_active ? 'default' : 'secondary'} className="text-[10px]">
                            {wf.is_active ? 'Active' : 'Inactive'}
                          </Badge>
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
                  ))
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
                        {ENTITY_TYPE_LABELS[selectedWorkflow.entity_type as WorkflowEntityType]} ·
                        {' '}{steps.length} approval level(s) · Any user holding the level's role can approve
                      </CardDescription>
                    )}
                  </div>
                  {selectedWorkflow && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="inline-flex rounded-md border p-0.5">
                        <Button
                          variant={view === 'stack' ? 'default' : 'ghost'}
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setView('stack')}
                        >
                          <LayoutList className="h-3.5 w-3.5 mr-1" /> Stack
                        </Button>
                        <Button
                          variant={view === 'flow' ? 'default' : 'ghost'}
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setView('flow')}
                        >
                          <ArrowRight className="h-3.5 w-3.5 mr-1" /> Flow
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleToggleActive(selectedWorkflow)}>
                        {selectedWorkflow.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleSaveAsTemplate}>
                        <BookmarkPlus className="h-3.5 w-3.5 mr-1" /> Save as Template
                      </Button>
                      <Button size="sm" onClick={handleAddStep}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Level
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedWorkflow ? (
                  <div className="text-center py-12">
                    <WorkflowIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">Select a workflow to configure its approval levels</p>
                  </div>
                ) : stepsLoading ? (
                  <p className="text-muted-foreground text-center py-8 text-sm">Loading...</p>
                ) : steps.length === 0 ? (
                  <div className="text-center py-12">
                    <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">No approval levels yet</p>
                    <Button variant="outline" size="sm" onClick={handleAddStep}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add First Level
                    </Button>
                  </div>
                ) : view === 'stack' ? (
                  <StackView
                    steps={steps}
                    dynamicRoles={dynamicRoles}
                    onUpdate={(id, u) => updateStep.mutate({ id, ...u } as any)}
                    onDelete={(id) => deleteStep.mutate(id)}
                    onMove={handleMove}
                  />
                ) : (
                  <FlowView steps={steps} roleLabel={roleLabel} />
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
            <DialogDescription>Set the basics. You can add approval levels next.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Workflow Name <span className="text-destructive">*</span></Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., New License Approval" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Applies To <span className="text-destructive">*</span></Label>
                <Select value={newEntityType} onValueChange={v => setNewEntityType(v as WorkflowEntityType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ENTITY_TYPE_LABELS) as [WorkflowEntityType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type / Category <span className="text-destructive">*</span></Label>
                <Input
                  value={newLicenseType}
                  onChange={e => setNewLicenseType(e.target.value)}
                  placeholder="e.g., Banking License"
                />
              </div>
            </div>
            <div>
              <Label>Start From</Label>
              <Select value={seedFromTemplateId} onValueChange={setSeedFromTemplateId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Blank workflow</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.steps.length} level{t.steps.length === 1 ? '' : 's'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
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

      {/* Templates Dialog */}
      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Workflow Templates</DialogTitle>
            <DialogDescription>
              Reuse common approval flows. Select one when creating a new workflow.
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
                          {ENTITY_TYPE_LABELS[t.entity_type as WorkflowEntityType] || t.entity_type}
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

// ─── Stack View (editable cards) ───

interface StackViewProps {
  steps: WorkflowStep[];
  dynamicRoles: { id: string; name: string; system_role: string }[];
  onUpdate: (id: string, updates: Partial<WorkflowStep>) => void;
  onDelete: (id: string) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
}

function StackView({ steps, dynamicRoles, onUpdate, onDelete, onMove }: StackViewProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-success/10 border border-success/20">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <span className="text-xs font-medium text-success">Request Submitted</span>
      </div>

      {steps.map((step, idx) => (
        <div key={step.id}>
          <div className="flex justify-center py-0.5">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </div>
          <LevelCard
            step={step}
            index={idx}
            total={steps.length}
            dynamicRoles={dynamicRoles}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onMove={onMove}
          />
        </div>
      ))}

      <div className="flex justify-center py-0.5">
        <ArrowDown className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-primary">Final Approval</span>
      </div>
    </div>
  );
}

interface LevelCardProps {
  step: WorkflowStep;
  index: number;
  total: number;
  dynamicRoles: { id: string; name: string; system_role: string }[];
  onUpdate: (id: string, updates: Partial<WorkflowStep>) => void;
  onDelete: (id: string) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
}

function LevelCard({ step, index, total, dynamicRoles, onUpdate, onDelete, onMove }: LevelCardProps) {
  const roleExists = dynamicRoles.some(r => r.system_role === step.approver_role);
  return (
    <div className="border rounded-lg bg-card p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className="shrink-0" variant="default">Level {index + 1}</Badge>
        <Input
          className="h-8 text-sm font-medium flex-1 min-w-[180px]"
          value={step.name}
          onChange={e => onUpdate(step.id, { name: e.target.value })}
          placeholder="Level name (e.g., Reviewer)"
        />
        <Select
          value={step.approver_role}
          onValueChange={val => onUpdate(step.id, { approver_role: val as any })}
        >
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <Users className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dynamicRoles.map(r => (
              <SelectItem key={r.id} value={r.system_role}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          className="h-8 w-20 text-xs"
          value={step.sla_hours || 48}
          onChange={e => onUpdate(step.id, { sla_hours: parseInt(e.target.value) || 48 } as any)}
          title="SLA in hours"
        />
        <span className="text-[10px] text-muted-foreground">hrs SLA</span>
        <div className="flex items-center gap-0.5 ml-auto">
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
            onClick={() => onDelete(step.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {!roleExists && (
        <p className="text-[11px] text-destructive mt-2">
          ⚠ The selected role no longer exists in Role Management. Please reassign.
        </p>
      )}
    </div>
  );
}

// ─── Flow View (read-only diagram) ───

function FlowView({
  steps,
  roleLabel,
}: {
  steps: WorkflowStep[];
  roleLabel: (sysRole: string) => string;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-stretch gap-2 min-w-max py-2">
        <FlowNode label="Submitted" tone="success" />
        <FlowArrow />
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-stretch gap-2">
            <FlowNode
              label={s.name || `Level ${i + 1}`}
              sub={roleLabel(s.approver_role)}
              tone="info"
              level={i + 1}
            />
            <FlowArrow />
          </div>
        ))}
        <FlowNode label="Approved" tone="primary" />
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Read-only diagram. Switch to <strong>Stack</strong> view to edit.
      </p>
    </div>
  );
}

function FlowNode({
  label, sub, tone, level,
}: {
  label: string;
  sub?: string;
  tone: 'success' | 'info' | 'primary';
  level?: number;
}) {
  const toneClasses =
    tone === 'success' ? 'bg-success/10 border-success/30 text-success' :
    tone === 'primary' ? 'bg-primary/10 border-primary/30 text-primary' :
    'bg-card border-border';
  return (
    <div className={`min-w-[160px] rounded-lg border-2 px-3 py-2.5 ${toneClasses}`}>
      {level !== undefined && (
        <Badge variant="outline" className="text-[9px] mb-1">Level {level}</Badge>
      )}
      <p className="text-sm font-medium leading-tight">{label}</p>
      {sub && (
        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
          <Users className="h-2.5 w-2.5" /> {sub}
        </p>
      )}
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center self-center">
      <ArrowRight className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
