import { useState, useCallback } from 'react';
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
  GitBranch, Plus, Trash2, ArrowDown, GripVertical, Clock,
  CheckCircle2, XCircle, RotateCcw, Shield, AlertTriangle,
  ChevronRight, Settings2, Zap, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRegulator } from '@/contexts/RegulatorContext';
import { useSectors, useCategories } from '@/hooks/useMasterConfig';
import {
  useWorkflows, useWorkflowSteps,
  useCreateWorkflow, useUpdateWorkflow, useDeleteWorkflow,
  useCreateStep, useUpdateStep, useDeleteStep, useReorderSteps,
  ENTITY_TYPE_LABELS, ACTION_LABELS, ACTION_COLORS,
  type Workflow, type WorkflowStep, type WorkflowEntityType, type WorkflowActionType,
} from '@/hooks/useWorkflowEngine';
import { AppRole, ROLE_LABELS, ROLE_HIERARCHY, INTERNAL_ROLES } from '@/types/platform';
import { useRoles } from '@/hooks/useRoles';

const STEP_TYPE_LABELS: Record<string, string> = {
  sequential: 'Sequential',
  parallel: 'Parallel',
  conditional: 'Conditional',
};

const ALL_ACTIONS: WorkflowActionType[] = ['approve', 'reject', 'send_back', 'request_info', 'delegate', 'escalate'];

export default function WorkflowList() {
  const { activeRegulatorId } = useRegulator();
  const { data: workflows = [], isLoading } = useWorkflows(activeRegulatorId);
  const { data: dbSectors = [] } = useSectors();
  const { data: dbCategories = [] } = useCategories();
  const { data: dynamicRoles = [] } = useRoles();

  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const createStep = useCreateStep();
  const updateStep = useUpdateStep();
  const deleteStep = useDeleteStep();
  const reorderSteps = useReorderSteps();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLicenseType, setNewLicenseType] = useState('');
  const [newEntityType, setNewEntityType] = useState<WorkflowEntityType>('application');
  const [newSectorId, setNewSectorId] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');

  const selectedWorkflow = workflows.find(w => w.id === selectedId) || null;
  const { data: steps = [], isLoading: stepsLoading } = useWorkflowSteps(selectedId);

  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || !newLicenseType.trim()) {
      toast.error('Name and type/label are required');
      return;
    }
    try {
      const wf = await createWorkflow.mutateAsync({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        license_type: newLicenseType.trim(),
        entity_type: newEntityType,
        regulator_id: activeRegulatorId,
        sector_id: newSectorId || null,
        category_id: newCategoryId || null,
      });
      toast.success('Workflow created');
      setSelectedId(wf.id);
      setCreateOpen(false);
      setNewName(''); setNewDesc(''); setNewLicenseType('');
      setNewEntityType('application'); setNewSectorId(''); setNewCategoryId('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkflow.mutateAsync(id);
      if (selectedId === id) setSelectedId(null);
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
        name: `Step ${steps.length + 1}`,
        approver_role: 'licensing_officer',
        sla_hours: 48,
        allowed_actions: ['approve', 'reject', 'send_back'],
      });
      toast.success('Step added');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateStep = useCallback(async (stepId: string, updates: Partial<WorkflowStep>) => {
    try {
      await updateStep.mutateAsync({ id: stepId, ...updates } as any);
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [updateStep]);

  const handleDeleteStep = async (stepId: string) => {
    try {
      await deleteStep.mutateAsync(stepId);
      toast.success('Step removed');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
  };
  const handleDrop = async (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) return;
    const reordered = [...steps];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    const updates = reordered.map((s, i) => ({ id: s.id, step_order: i + 1 }));
    setDragIdx(null);
    try {
      await reorderSteps.mutateAsync(updates);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const activeSectors = dbSectors.filter(s => s.status === 'active');
  const filteredCategories = dbCategories.filter(c => newSectorId ? c.sector_id === newSectorId : true);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Workflow Engine"
          description="Configure multi-level approval workflows for applications, complaints, and inspections."
          actions={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Workflow
            </Button>
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
                    <GitBranch className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
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
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge variant="outline" className="text-[10px]">
                              {ENTITY_TYPE_LABELS[wf.entity_type as WorkflowEntityType] || wf.entity_type}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{wf.license_type}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge
                            variant={wf.is_active ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {wf.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={e => { e.stopPropagation(); handleDelete(wf.id); }}
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

          {/* Step Builder */}
          <div className="lg:col-span-8">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {selectedWorkflow ? selectedWorkflow.name : 'Select a Workflow'}
                    </CardTitle>
                    {selectedWorkflow && (
                      <CardDescription className="mt-1">
                        {ENTITY_TYPE_LABELS[selectedWorkflow.entity_type as WorkflowEntityType]} · {steps.length} step(s) · Drag to reorder
                      </CardDescription>
                    )}
                  </div>
                  {selectedWorkflow && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(selectedWorkflow)}
                      >
                        {selectedWorkflow.is_active ? 'Deactivate' : 'Activate'}
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
                    <Settings2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">Select a workflow to configure its steps</p>
                  </div>
                ) : stepsLoading ? (
                  <p className="text-muted-foreground text-center py-8 text-sm">Loading steps...</p>
                ) : steps.length === 0 ? (
                  <div className="text-center py-12">
                    <Zap className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">No steps defined yet</p>
                    <Button variant="outline" size="sm" onClick={handleAddStep}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add First Step
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Visual Pipeline Start */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-success/10 border border-success/20">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-xs font-medium text-success">Start</span>
                    </div>

                    {steps.map((step, idx) => (
                      <div key={step.id}>
                        <div className="flex justify-center py-0.5">
                          <ArrowDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <StepCard
                          step={step}
                          index={idx}
                          dynamicRoles={dynamicRoles}
                          onUpdate={handleUpdateStep}
                          onDelete={handleDeleteStep}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                        />
                      </div>
                    ))}

                    <div className="flex justify-center py-0.5">
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* Visual Pipeline End */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted border border-border">
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">End (Approved / Rejected)</span>
                    </div>
                  </div>
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
            <DialogTitle>Create Workflow</DialogTitle>
            <DialogDescription>Define a new approval workflow for a specific entity type and category.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Workflow Name <span className="text-destructive">*</span></Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Financial Advisory Approval" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Entity Type <span className="text-destructive">*</span></Label>
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
                <Label>Type / Label <span className="text-destructive">*</span></Label>
                <Input value={newLicenseType} onChange={e => setNewLicenseType(e.target.value)} placeholder="e.g., License Type" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sector (optional)</Label>
                <Select value={newSectorId} onValueChange={setNewSectorId}>
                  <SelectTrigger><SelectValue placeholder="Any sector" /></SelectTrigger>
                  <SelectContent>
                    {activeSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category (optional)</Label>
                <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Any category" /></SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Describe the workflow..." rows={2} />
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
    </DashboardLayout>
  );
}

// ─── Step Card Component ───

interface StepCardProps {
  step: WorkflowStep;
  index: number;
  dynamicRoles: { id: string; name: string; system_role: string }[];
  onUpdate: (id: string, updates: Partial<WorkflowStep>) => void;
  onDelete: (id: string) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: (e: React.DragEvent, idx: number) => void;
}

function StepCard({ step, index, dynamicRoles, onUpdate, onDelete, onDragStart, onDragOver, onDrop }: StepCardProps) {
  const [expanded, setExpanded] = useState(false);
  const allowedActions = (step.allowed_actions || ['approve', 'reject', 'send_back']) as WorkflowActionType[];

  const toggleAction = (action: WorkflowActionType) => {
    const newActions = allowedActions.includes(action)
      ? allowedActions.filter(a => a !== action)
      : [...allowedActions, action];
    onUpdate(step.id, { allowed_actions: newActions } as any);
  };

  const slaColor = (step.sla_hours || 48) <= 24
    ? 'text-destructive'
    : (step.sla_hours || 48) <= 48
      ? 'text-warning'
      : 'text-muted-foreground';

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => onDragOver(e, index)}
      onDrop={e => onDrop(e, index)}
      className="border rounded-lg bg-card transition-shadow hover:shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
        <Badge variant="outline" className="text-[10px] shrink-0">Step {step.step_order}</Badge>
        <Input
          className="h-7 text-xs font-medium flex-1"
          value={step.name}
          onChange={e => onUpdate(step.id, { name: e.target.value })}
        />
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="secondary" className="text-[10px] gap-0.5">
            <Users className="h-3 w-3" />
            {dynamicRoles.find(r => r.system_role === step.approver_role)?.name || ROLE_LABELS[step.approver_role] || step.approver_role}
          </Badge>
          <Badge variant="outline" className={`text-[10px] gap-0.5 ${slaColor}`}>
            <Clock className="h-3 w-3" /> {step.sla_hours || 48}h
          </Badge>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)}>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(step.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Allowed Actions Preview */}
      <div className="px-3 pb-2 flex flex-wrap gap-1">
        {allowedActions.map(action => (
          <Badge key={action} variant="outline" className={`text-[10px] ${ACTION_COLORS[action]}`}>
            {ACTION_LABELS[action]}
          </Badge>
        ))}
      </div>

      {/* Expanded Config */}
      {expanded && (
        <div className="border-t px-3 py-3 space-y-4 bg-muted/30">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Approver Role</Label>
              <Select value={step.approver_role} onValueChange={val => onUpdate(step.id, { approver_role: val } as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERNAL_ROLES.map(r => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Step Type</Label>
              <Select value={step.step_type} onValueChange={val => onUpdate(step.id, { step_type: val } as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STEP_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">SLA (hours)</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={step.sla_hours || 48}
                onChange={e => onUpdate(step.id, { sla_hours: parseInt(e.target.value) || 48 } as any)}
              />
            </div>
          </div>

          {/* Allowed Actions */}
          <div>
            <Label className="text-xs mb-2 block">Allowed Actions</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_ACTIONS.map(action => (
                <label key={action} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={allowedActions.includes(action)}
                    onCheckedChange={() => toggleAction(action)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs">{ACTION_LABELS[action]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Escalation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Escalation Role
              </Label>
              <Select
                value={step.escalation_role || 'none'}
                onValueChange={val => onUpdate(step.id, { escalation_role: val === 'none' ? null : val } as any)}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {INTERNAL_ROLES.map(r => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Escalate After (hours)</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={step.escalation_after_hours || ''}
                placeholder="e.g., 72"
                onChange={e => onUpdate(step.id, { escalation_after_hours: parseInt(e.target.value) || null } as any)}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs">Step Description</Label>
            <Textarea
              className="text-xs min-h-[60px]"
              value={step.description || ''}
              onChange={e => onUpdate(step.id, { description: e.target.value || null } as any)}
              placeholder="Describe what happens at this step..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
