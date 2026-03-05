import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, ArrowRight, Edit, Trash2, GitBranch, CheckCircle } from 'lucide-react';

interface WorkflowState {
  id: string;
  name: string;
  type: 'start' | 'action' | 'decision' | 'end';
  transitions: { to: string; label: string; role: string }[];
}

const sampleWorkflow: WorkflowState[] = [
  { id: 'draft', name: 'Draft', type: 'start', transitions: [{ to: 'submitted', label: 'Submit', role: 'Public User' }] },
  { id: 'submitted', name: 'Submitted', type: 'action', transitions: [{ to: 'under_review', label: 'Assign', role: 'Admin' }] },
  { id: 'under_review', name: 'Under Review', type: 'action', transitions: [
    { to: 'query_raised', label: 'Raise Query', role: 'Reviewer' },
    { to: 'reviewed', label: 'Complete Review', role: 'Reviewer' },
  ]},
  { id: 'query_raised', name: 'Query Raised', type: 'action', transitions: [{ to: 'under_review', label: 'Respond', role: 'Public User' }] },
  { id: 'reviewed', name: 'Reviewed', type: 'decision', transitions: [
    { to: 'approved', label: 'Approve', role: 'Approver' },
    { to: 'rejected', label: 'Reject', role: 'Approver' },
    { to: 'returned', label: 'Return', role: 'Approver' },
  ]},
  { id: 'approved', name: 'Approved', type: 'end', transitions: [] },
  { id: 'rejected', name: 'Rejected', type: 'end', transitions: [] },
  { id: 'returned', name: 'Returned', type: 'action', transitions: [{ to: 'submitted', label: 'Resubmit', role: 'Public User' }] },
];

const workflows = [
  { id: '1', name: 'Pre-License Application', type: 'Application', states: 8, status: 'active' },
  { id: '2', name: 'Post-License Service', type: 'Service', states: 6, status: 'active' },
  { id: '3', name: 'Return Submission', type: 'Return', states: 5, status: 'active' },
  { id: '4', name: 'Penalty Appeal', type: 'Appeal', states: 7, status: 'draft' },
];

const typeColors: Record<string, string> = {
  start: 'bg-success/10 text-success border-success/30',
  action: 'bg-info/10 text-info border-info/30',
  decision: 'bg-warning/10 text-warning border-warning/30',
  end: 'bg-muted text-muted-foreground border-muted-foreground/30',
};

export default function WorkflowConfig() {
  const [selectedWorkflow, setSelectedWorkflow] = useState(workflows[0]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Workflow Configuration"
          description="Design and manage configurable workflows for applications and returns."
          backHref="/dashboard"
          backLabel="Dashboard"
          actions={<Button><Plus className="h-4 w-4 mr-2" />New Workflow</Button>}
        />

        <div className="grid lg:grid-cols-3 gap-6 animate-slide-up delay-100">
          {/* Workflow List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Workflows</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {workflows.map(wf => (
                <button
                  key={wf.id}
                  onClick={() => setSelectedWorkflow(wf)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    selectedWorkflow.id === wf.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{wf.name}</p>
                      <p className="text-sm text-muted-foreground">{wf.type} · {wf.states} states</p>
                    </div>
                    <Badge variant={wf.status === 'active' ? 'approved' : 'draft' as any} className="capitalize">{wf.status}</Badge>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Workflow States */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{selectedWorkflow.name}</CardTitle>
                  <CardDescription>State transition diagram</CardDescription>
                </div>
                <Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-2" />Edit</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {sampleWorkflow.map((state) => (
                <div
                  key={state.id}
                  className={`p-4 rounded-lg border ${typeColors[state.type]}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {state.type === 'end' ? <CheckCircle className="h-4 w-4" /> : <GitBranch className="h-4 w-4" />}
                      <span className="font-semibold">{state.name}</span>
                    </div>
                    <Badge variant="outline" className="capitalize text-xs">{state.type}</Badge>
                  </div>
                  {state.transitions.length > 0 && (
                    <div className="space-y-1 mt-3">
                      {state.transitions.map((t, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-medium">{t.label}</span>
                          <span className="text-muted-foreground">→ {t.to.replace('_', ' ')}</span>
                          <Badge variant="outline" className="text-xs ml-auto">{t.role}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
