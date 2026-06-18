import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Eye } from 'lucide-react';
import { WorkflowPanel } from '@/components/applications/WorkflowPanel';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { SlaInlineIndicator } from '@/components/workflows/SlaIndicator';

interface PendingRegistration {
  id: string;
  applicant_name: string;
  email: string;
  status: string;
  registration_reference: string;
  created_at: string;
  sector_id: string | null;
  workflow_id?: string | null;
  workflow_version_number?: number | null;
  workflow_name?: string | null;
  current_step_name?: string | null;
  sla_hours?: number | null;
  sla_warning_threshold_percent?: number | null;
  escalation_after_hours?: number | null;
  step_started_at?: string | null;
}

export default function RegistrationReview() {
  const [rows, setRows] = useState<PendingRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<PendingRegistration | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('registrations')
      .select('id, applicant_name, email, status, registration_reference, created_at, sector_id')
      .in('status', [
        'submitted',
        'pending',
        'pending_review',
        'under_review',
        'in_progress',
        'in_review',
        'resubmission_required',
        'resubmission_requested',
        'returned_for_correction',
        'return_for_correction',
        'info_requested',
        'more_info_requested',
        'query_raised',
      ])
      .order('created_at', { ascending: false });

    const base = (data || []) as PendingRegistration[];
    if (base.length === 0) {
      setRows(base);
      setLoading(false);
      return;
    }

    const ids = base.map(r => r.id);
    const { data: instances } = await supabase
      .from('workflow_instances')
      .select('entity_id, workflow_id, workflow_version_id, current_step_id, current_step_key, version_snapshot')
      .eq('entity_type', 'registration')
      .in('entity_id', ids);

    const verIds = Array.from(new Set((instances || []).map((i: any) => i.workflow_version_id).filter(Boolean))) as string[];
    const wfIds = Array.from(new Set((instances || []).map((i: any) => i.workflow_id).filter(Boolean))) as string[];

    const [versions, workflows] = await Promise.all([
      verIds.length
        ? supabase.from('approval_workflow_versions' as any).select('id, version_number').in('id', verIds)
        : Promise.resolve({ data: [] as any[] }),
      wfIds.length
        ? supabase.from('approval_workflows').select('id, name').in('id', wfIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const verMap = new Map<string, number>((versions.data || []).map((v: any) => [v.id, v.version_number]));
    const wfMap = new Map<string, string>((workflows.data || []).map((w: any) => [w.id, w.name]));
    const instByEntity = new Map<string, any>((instances || []).map((i: any) => [i.entity_id, i]));

    const hydrated = base.map(r => {
      const inst = instByEntity.get(r.id);
      if (!inst) return r;
      const snap = inst.version_snapshot as { steps?: Array<{ local_id: string; name: string; sla_hours: number | null }> } | null;
      const stepKey = inst.current_step_key ?? (inst.current_step_id ? String(inst.current_step_id) : null);
      const step = snap?.steps?.find(s => s.local_id === stepKey) ?? null;
      return {
        ...r,
        workflow_id: inst.workflow_id ?? null,
        workflow_version_number: inst.workflow_version_id ? verMap.get(inst.workflow_version_id) ?? null : null,
        workflow_name: inst.workflow_id ? wfMap.get(inst.workflow_id) ?? null : null,
        current_step_name: step?.name ?? null,
        sla_hours: step?.sla_hours ?? null,
      };
    });
    setRows(hydrated);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the open drawer's row in sync after any action
  const refreshReviewing = useCallback(async () => {
    if (!reviewing) return;
    await load();
    setReviewing(prev => prev ? rows.find(r => r.id === prev.id) ?? prev : prev);
  }, [load, reviewing, rows]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Registration Review"
          description="Review and act on pending licensee registrations through the configured Registration approval workflow."
        />

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">No registrations awaiting review.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Current Step</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm">{r.registration_reference}</TableCell>
                        <TableCell className="font-medium">{r.applicant_name}</TableCell>
                        <TableCell className="text-sm">{r.email}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{r.status.replace(/_/g, ' ')}</Badge></TableCell>
                        <TableCell className="text-sm">
                          {r.workflow_name ?? <span className="text-muted-foreground">No workflow</span>}
                          {r.workflow_version_number ? <Badge variant="secondary" className="ml-2">v{r.workflow_version_number}</Badge> : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.current_step_name ?? '—'}
                          {r.sla_hours ? <span className="text-muted-foreground"> · SLA {r.sla_hours}h</span> : null}
                        </TableCell>
                        <TableCell className="text-sm">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="default" onClick={() => setReviewing(r)}>
                            <Eye className="h-4 w-4 mr-1" /> Open Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!reviewing} onOpenChange={(o) => { if (!o) setReviewing(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {reviewing && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>Registration Review · {reviewing.registration_reference}</SheetTitle>
                <SheetDescription>
                  {reviewing.applicant_name} · {reviewing.email}
                </SheetDescription>
              </SheetHeader>
              {reviewing.workflow_id ? (
                <ErrorBoundary
                  context="RegistrationReview · WorkflowPanel"
                  fallback={
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                      <p className="font-medium text-destructive">Unable to load workflow details</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        An unexpected error occurred while rendering this registration's workflow.
                        Please refresh the page or contact an administrator.
                      </p>
                    </div>
                  }
                >
                  <WorkflowPanel
                    entityType="registration"
                    entityNoun="registration"
                    applicationId={reviewing.id}
                    workflowId={reviewing.workflow_id}
                    workflowEnabled={true}
                    applicationStatus={reviewing.status}
                    onStatusChange={refreshReviewing}
                  />
                </ErrorBoundary>
              ) : (
                <div className="rounded-md border border-warning/40 bg-warning/5 p-4 text-sm">
                  <p className="font-medium">No Registration workflow attached</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No active Registration workflow could be matched for this submission. Configure one under
                    <strong> Approval Workflows → Used For: Registration</strong> and re-trigger workflow start.
                  </p>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
