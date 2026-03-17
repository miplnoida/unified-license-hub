import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { logAudit } from '@/hooks/useAuditLog';
import { useRegulator } from '@/contexts/RegulatorContext';
import { AppRole, ROLE_LABELS, ROLE_HIERARCHY } from '@/types/platform';
import { GitBranch, Plus, Trash2, ArrowDown } from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  license_type: string;
  is_active: boolean;
  regulator_id: string | null;
  created_at: string;
}

interface Step {
  id: string;
  workflow_id: string;
  step_order: number;
  name: string;
  description: string | null;
  approver_role: AppRole;
  step_type: string;
  sla_hours: number;
  is_required: boolean;
}

export default function WorkflowList() {
  const { activeRegulatorId } = useRegulator();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLicenseType, setNewLicenseType] = useState('');

  const loadWorkflows = async () => {
    setLoading(true);
    let query = supabase.from('approval_workflows').select('*').order('created_at', { ascending: false });
    if (activeRegulatorId) query = query.eq('regulator_id', activeRegulatorId);
    const { data } = await query;
    setWorkflows((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { loadWorkflows(); setSelectedWorkflow(null); setSteps([]); }, [activeRegulatorId]);

  const loadSteps = async (workflowId: string) => {
    setStepsLoading(true);
    const { data } = await supabase.from('approval_steps').select('*').eq('workflow_id', workflowId).order('step_order');
    setSteps((data || []) as any);
    setStepsLoading(false);
  };

  const handleCreate = async () => {
    if (!newName || !newLicenseType) { toast.error('Name and license type are required'); return; }
    const { data, error } = await supabase
      .from('approval_workflows')
      .insert({ name: newName, description: newDesc, license_type: newLicenseType, regulator_id: activeRegulatorId } as any)
      .select().single();
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: 'workflow_created', entityType: 'approval_workflow', entityId: (data as any).id, newValue: { name: newName, license_type: newLicenseType } });
    toast.success('Workflow created');
    setNewName(''); setNewDesc(''); setNewLicenseType('');
    setDialogOpen(false);
    loadWorkflows();
  };

  const handleSelectWorkflow = (wf: Workflow) => { setSelectedWorkflow(wf); loadSteps(wf.id); };

  const handleAddStep = async () => {
    if (!selectedWorkflow) return;
    const nextOrder = steps.length + 1;
    const { error } = await supabase.from('approval_steps').insert({
      workflow_id: selectedWorkflow.id, step_order: nextOrder, name: `Step ${nextOrder}`,
      approver_role: 'licensing_officer', step_type: 'sequential', sla_hours: 48, is_required: true,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success('Step added');
    loadSteps(selectedWorkflow.id);
  };

  const handleUpdateStep = async (stepId: string, updates: Partial<Step>) => {
    const { error } = await supabase.from('approval_steps').update(updates as any).eq('id', stepId);
    if (error) toast.error(error.message);
    else { toast.success('Step updated'); if (selectedWorkflow) loadSteps(selectedWorkflow.id); }
  };

  const handleDeleteStep = async (stepId: string) => {
    await supabase.from('approval_steps').delete().eq('id', stepId);
    toast.success('Step removed');
    if (selectedWorkflow) loadSteps(selectedWorkflow.id);
  };

  const handleDeleteWorkflow = async (id: string) => {
    await supabase.from('approval_workflows').delete().eq('id', id);
    await logAudit({ action: 'workflow_deleted', entityType: 'approval_workflow', entityId: id });
    toast.success('Workflow deleted');
    if (selectedWorkflow?.id === id) { setSelectedWorkflow(null); setSteps([]); }
    loadWorkflows();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <GitBranch className="h-6 w-6 text-primary" />Approval Workflows
            </h1>
            <p className="text-muted-foreground">Configure multi-step approval pipelines for each license type</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Workflow</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Approval Workflow</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Workflow Name</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Financial Advisory Approval" /></div>
                <div><Label>License Type</Label><Input value={newLicenseType} onChange={e => setNewLicenseType(e.target.value)} placeholder="e.g., Financial Advisory License" /></div>
                <div><Label>Description</Label><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Describe the workflow..." /></div>
                <Button onClick={handleCreate} className="w-full">Create Workflow</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Workflows ({workflows.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <p className="text-muted-foreground text-center py-4">Loading...</p>
              ) : workflows.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No workflows yet. Create one to get started.</p>
              ) : workflows.map(wf => (
                <div key={wf.id} className={`p-4 rounded-lg border cursor-pointer transition-colors ${selectedWorkflow?.id === wf.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`} onClick={() => handleSelectWorkflow(wf)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{wf.name}</p>
                      <p className="text-sm text-muted-foreground">{wf.license_type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={wf.is_active ? 'default' : 'secondary'}>{wf.is_active ? 'Active' : 'Inactive'}</Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteWorkflow(wf.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{selectedWorkflow ? `Steps: ${selectedWorkflow.name}` : 'Select a Workflow'}</CardTitle>
                {selectedWorkflow && <Button size="sm" onClick={handleAddStep}><Plus className="h-4 w-4 mr-1" />Add Step</Button>}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedWorkflow ? (
                <p className="text-muted-foreground text-center py-8">Select a workflow to configure its steps</p>
              ) : stepsLoading ? (
                <p className="text-muted-foreground text-center py-4">Loading steps...</p>
              ) : steps.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No steps yet. Add steps to define the approval flow.</p>
              ) : (
                <div className="space-y-3">
                  {steps.map((step, i) => (
                    <div key={step.id}>
                      <div className="p-4 rounded-lg border space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">Step {step.step_order}</Badge>
                            <Input value={step.name} onChange={e => setSteps(prev => prev.map(s => s.id === step.id ? { ...s, name: e.target.value } : s))} onBlur={() => handleUpdateStep(step.id, { name: step.name })} className="h-8 text-sm font-medium w-48" />
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteStep(step.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Approver Role</Label>
                            <Select value={step.approver_role} onValueChange={val => handleUpdateStep(step.id, { approver_role: val } as any)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{ROLE_HIERARCHY.filter(r => r !== 'applicant').map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Step Type</Label>
                            <Select value={step.step_type} onValueChange={val => handleUpdateStep(step.id, { step_type: val } as any)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sequential">Sequential</SelectItem>
                                <SelectItem value="parallel">Parallel</SelectItem>
                                <SelectItem value="conditional">Conditional</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">SLA (hours)</Label>
                            <Input type="number" className="h-8 text-xs" value={step.sla_hours} onChange={e => handleUpdateStep(step.id, { sla_hours: parseInt(e.target.value) || 48 } as any)} />
                          </div>
                        </div>
                      </div>
                      {i < steps.length - 1 && <div className="flex justify-center py-1"><ArrowDown className="h-4 w-4 text-muted-foreground" /></div>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
