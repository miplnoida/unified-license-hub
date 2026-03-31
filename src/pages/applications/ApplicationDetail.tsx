import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLog';
import { startWorkflowForApplication } from '@/lib/workflowService';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DocumentList } from '@/components/documents/DocumentList';
import { StatusTimeline } from '@/components/applications/StatusTimeline';
import { WorkflowPanel } from '@/components/applications/WorkflowPanel';
import { SubmittedForms } from '@/components/applications/SubmittedForms';
import { toast } from 'sonner';
import { APPLICATION_STATUS_LABELS, ApplicationStatus, INTERNAL_ROLES } from '@/types/platform';
import { Send, Loader2, Building2, Layers, Tag, CheckCircle, XCircle, Ban, RotateCcw, Edit } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  submitted: 'default',
  in_progress: 'outline',
  approved: 'default',
  rejected: 'destructive',
  cancelled: 'destructive',
  resubmission_requested: 'outline',
};

interface Application {
  id: string; application_number: string; applicant_id: string; license_type: string;
  status: ApplicationStatus; workflow_id: string | null; current_step_id: string | null;
  data: Record<string, unknown>; submitted_at: string | null; approved_at: string | null;
  rejected_at: string | null; created_at: string; updated_at: string; regulator_id: string | null;
}

interface TimelineEvent {
  id: string; action: string; status: string; comments: string | null; actor_id: string;
  created_at: string; actor_email?: string;
}

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [docRefresh, setDocRefresh] = useState(0);
  const [actionComment, setActionComment] = useState('');

  const isInternal = user && INTERNAL_ROLES.includes(user.role);
  const isOwner = user && app?.applicant_id === user.id;

  const appData = app?.data as any || {};
  const formTemplateIds: string[] = appData?.form_template_ids || [];
  const formsData: Record<string, Record<string, any>> = appData?.forms_data || {};
  const formVersionIds: Record<string, string> = appData?.form_version_ids || {};
  const hasSubmittedForms = formTemplateIds.length > 0;

  const loadData = async () => {
    if (!id) return;
    const { data: appRow } = await supabase.from('applications').select('*').eq('id', id).single();
    if (appRow) setApp(appRow as any);

    const { data: actions } = await supabase.from('approval_actions').select('*').eq('application_id', id).order('created_at', { ascending: true });
    if (actions) {
      const userIds = [...new Set((actions as any[]).map(a => a.actor_id))];
      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', userIds);
        profiles?.forEach(p => { emailMap[p.id] = p.email; });
      }
      setEvents((actions as any[]).map(a => ({
        ...a,
        status: a.action,
        actor_email: emailMap[a.actor_id] || a.actor_id,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [id]);

  const handleSubmit = async () => {
    if (!app || !user) return;
    setProcessing(true);

    // Use centralized workflow service (prevents duplicates)
    const wfResult = await startWorkflowForApplication(app.id, app.license_type);

    // Update application status
    const updates: any = {
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      workflow_id: wfResult.workflowId,
      current_step_id: wfResult.firstStepId,
    };
    const { error } = await supabase.from('applications').update(updates).eq('id', app.id);
    if (error) { toast.error(error.message); setProcessing(false); return; }

    await logAudit({ action: 'application_submitted', entityType: 'application', entityId: app.id });
    toast.success(wfResult.matched
      ? 'Application submitted and routed to workflow'
      : 'Application submitted (no matching workflow found)');
    loadData();
    setProcessing(false);
  };

  const handleStageTransition = async (newStatus: ApplicationStatus, actionType: string, comment: string) => {
    if (!app || !user) return;

    // Mandatory remarks for approve/reject
    if ((newStatus === 'approved' || newStatus === 'rejected') && !comment.trim()) {
      toast.error('Remarks are mandatory for Approve / Reject');
      return;
    }

    setProcessing(true);

    // For approvals, use the server-side edge function
    if (newStatus === 'approved') {
      try {
        const { data, error } = await supabase.functions.invoke('approve-pre-licensee', {
          body: { application_id: app.id, comments: comment },
        });
        if (error || data?.error) {
          toast.error(data?.error || error?.message || 'Approval failed');
          setProcessing(false);
          return;
        }
        toast.success(`Application approved! License: ${data.license_number}`);
        setActionComment('');
        loadData();
        setProcessing(false);
        return;
      } catch (e) {
        toast.error('Approval request failed');
        setProcessing(false);
        return;
      }
    }

    await supabase.from('approval_actions').insert({
      application_id: app.id, action: actionType, actor_id: user.id, comments: comment || null,
    } as any);

    const updates: any = { status: newStatus };
    if (newStatus === 'rejected') updates.rejected_at = new Date().toISOString();

    await supabase.from('applications').update(updates).eq('id', app.id);
    await logAudit({
      action: `application_${actionType}`, entityType: 'application', entityId: app.id,
      newValue: { status: newStatus, comments: comment },
    });

    // Send notification on reject
    if (newStatus === 'rejected') {
      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            action: 'dispatch',
            event_type: 'application_rejected',
            user_id: app.applicant_id,
            title: `Application Rejected: ${app.application_number}`,
            message: `Your application ${app.application_number} has been rejected.\n\nRemarks: ${comment}`,
            entity_type: 'application',
            entity_id: app.id,
          },
        });
      } catch (e) {
        console.error('Notification failed', e);
      }
    }

    toast.success(`Application ${APPLICATION_STATUS_LABELS[newStatus]}`);
    setActionComment('');
    loadData();
    setProcessing(false);
  };

  const handleCancel = async () => {
    if (!app || !user) return;
    if (!window.confirm('Are you sure you want to cancel this application? This action cannot be undone.')) return;
    setProcessing(true);

    // Cancel any active workflow instance
    if (app.workflow_id) {
      const { data: instances } = await supabase
        .from('workflow_instances')
        .select('id')
        .eq('entity_id', app.id)
        .eq('entity_type', 'application')
        .eq('status', 'active');
      if (instances?.length) {
        await supabase.from('workflow_instances').update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        } as any).eq('id', instances[0].id);
      }
    }

    await supabase.from('applications').update({ status: 'cancelled' } as any).eq('id', app.id);
    await supabase.from('approval_actions').insert({
      application_id: app.id, action: 'cancelled', actor_id: user.id, comments: 'Application cancelled by applicant',
    } as any);
    await logAudit({ action: 'application_cancelled', entityType: 'application', entityId: app.id });
    toast.success('Application cancelled');
    loadData();
    setProcessing(false);
  };

  // Applicant requests to edit their application (before approval)
  const handleRequestEdit = async () => {
    if (!app || !user || !actionComment.trim()) {
      toast.error('Please provide a reason for requesting to edit your application');
      return;
    }
    setProcessing(true);

    await supabase.from('approval_actions').insert({
      application_id: app.id, action: 'edit_requested', actor_id: user.id,
      comments: actionComment,
    } as any);
    await logAudit({ action: 'edit_requested', entityType: 'application', entityId: app.id, newValue: { comments: actionComment } });
    toast.success('Edit request submitted. Admin will review your request.');
    setActionComment('');
    loadData();
    setProcessing(false);
  };

  // Applicant resubmits application after resubmission was requested
  const handleResubmit = async () => {
    if (!app || !user) return;
    setProcessing(true);

    // Resume paused workflow instance
    const { data: instances } = await supabase
      .from('workflow_instances')
      .select('id, current_step_id')
      .eq('entity_id', app.id)
      .eq('entity_type', 'application')
      .eq('status', 'paused');

    if (instances?.length) {
      await supabase.from('workflow_instances').update({
        status: 'active',
      } as any).eq('id', instances[0].id);
    }

    await supabase.from('applications').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    } as any).eq('id', app.id);
    await supabase.from('approval_actions').insert({
      application_id: app.id, action: 'resubmitted', actor_id: user.id,
      comments: actionComment || 'Application resubmitted after revision',
    } as any);
    await logAudit({ action: 'application_resubmitted', entityType: 'application', entityId: app.id });
    toast.success('Application resubmitted successfully');
    setActionComment('');
    loadData();
    setProcessing(false);
  };

  // Admin/Regulator requests resubmission (without workflow)
  const handleAdminRequestResubmission = async () => {
    if (!app || !user || !actionComment.trim()) {
      toast.error('Please provide remarks explaining what needs to be revised');
      return;
    }
    setProcessing(true);

    await supabase.from('applications').update({
      status: 'resubmission_requested',
    } as any).eq('id', app.id);
    await supabase.from('approval_actions').insert({
      application_id: app.id, action: 'resubmission_requested', actor_id: user.id,
      comments: actionComment,
    } as any);

    // Send notification to applicant
    try {
      await supabase.functions.invoke('send-notification', {
        body: {
          action: 'dispatch',
          event_type: 'resubmission_requested',
          user_id: app.applicant_id,
          title: `Resubmission Requested: ${app.application_number}`,
          message: `Your application ${app.application_number} requires revisions.\n\nRemarks: ${actionComment}`,
          entity_type: 'application',
          entity_id: app.id,
        },
      });
    } catch (e) {
      console.error('Notification failed', e);
    }

    await logAudit({ action: 'resubmission_requested', entityType: 'application', entityId: app.id, newValue: { comments: actionComment } });
    toast.success('Resubmission requested. Applicant has been notified.');
    setActionComment('');
    loadData();
    setProcessing(false);
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  if (!app) return <DashboardLayout><div className="text-center py-12 text-muted-foreground">Application not found</div></DashboardLayout>;

  // Only show manual "Start Review" to move to in_progress, but no direct approve/reject without workflow
  const showManualActions = isInternal && !app.workflow_id && app.status === 'submitted';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Application ${app.application_number}`}
          description={app.license_type}
          backHref={isInternal ? '/applications/queue' : '/applications'}
          backLabel="Back to Applications"
          actions={
            <Badge variant={statusVariant[app.status] || 'outline'} className="text-sm px-3 py-1">
              {APPLICATION_STATUS_LABELS[app.status]}
            </Badge>
          }
        />

        {/* Simple Progress Bar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Application Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline currentStatus={app.status} events={events} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Forms and Documents tabs - always visible */}
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="details">Details</TabsTrigger>
                {hasSubmittedForms && <TabsTrigger value="form">Submitted Forms</TabsTrigger>}
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Application Number</p>
                        <p className="font-mono font-medium">{app.application_number}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">License Type</p>
                        <p className="font-medium">{app.license_type}</p>
                      </div>
                      {appData.sector_name && (
                        <div className="flex items-start gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Sector</p>
                            <p className="text-sm font-medium">{appData.sector_name}</p>
                          </div>
                        </div>
                      )}
                      {appData.sub_sector_name && (
                        <div className="flex items-start gap-2">
                          <Layers className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Sub-Sector</p>
                            <p className="text-sm font-medium">{appData.sub_sector_name}</p>
                          </div>
                        </div>
                      )}
                      {appData.category_name && (
                        <div className="flex items-start gap-2">
                          <Tag className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground">Category</p>
                            <p className="text-sm font-medium">{appData.category_name}</p>
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-muted-foreground">Created</p>
                        <p className="text-sm">{new Date(app.created_at).toLocaleString()}</p>
                      </div>
                      {app.submitted_at && (
                        <div>
                          <p className="text-sm text-muted-foreground">Submitted</p>
                          <p className="text-sm">{new Date(app.submitted_at).toLocaleString()}</p>
                        </div>
                      )}
                      {app.approved_at && (
                        <div>
                          <p className="text-sm text-muted-foreground">Approved</p>
                          <p className="text-sm">{new Date(app.approved_at).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {hasSubmittedForms && (
                <TabsContent value="form" className="mt-4">
                  <SubmittedForms
                    formTemplateIds={formTemplateIds}
                    formsData={formsData}
                    formVersionIds={formVersionIds}
                    editable={isOwner && (app.status === 'draft' || app.status === 'resubmission_requested')}
                    onSave={async (templateId, data) => {
                      const updatedFormsData = { ...formsData, [templateId]: data };
                      const updatedAppData = { ...appData, forms_data: updatedFormsData };
                      const { error } = await supabase.from('applications').update({ data: updatedAppData } as any).eq('id', app.id);
                      if (error) { toast.error('Failed to save form'); return; }
                      toast.success('Form saved successfully');
                      loadData();
                    }}
                  />
                </TabsContent>
              )}

              <TabsContent value="documents" className="mt-4">
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    {(isOwner && (app.status === 'draft' || app.status === 'resubmission_requested')) && (
                      <DocumentUpload
                        entityType="application"
                        entityId={app.id}
                        onUploaded={() => setDocRefresh(p => p + 1)}
                      />
                    )}
                    <div key={docRefresh}>
                      <DocumentList entityType="application" entityId={app.id} />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Workflow-based review panel */}
            {app.workflow_id && (
              <WorkflowPanel
                applicationId={app.id}
                workflowId={app.workflow_id}
                onStatusChange={loadData}
              />
            )}

            {/* Manual staff actions (no workflow configured) */}
            {showManualActions && (
              <Card>
                <CardHeader><CardTitle className="text-base">Review Actions</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    No approval workflow is configured for this license type. Please configure a workflow in the Workflows module to enable multi-level approval.
                  </p>
                  {/* Admin can request resubmission even without workflow */}
                  <div className="space-y-2">
                    <Label className="text-sm">Remarks <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={actionComment}
                      onChange={e => setActionComment(e.target.value)}
                      placeholder="Explain what needs to be revised..."
                      rows={3}
                    />
                  </div>
                  <Button variant="outline" onClick={handleAdminRequestResubmission} disabled={processing}>
                    <RotateCcw className="h-4 w-4 mr-2" />Request Resubmission
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Admin request resubmission for in_progress apps (with or without workflow) */}
            {isInternal && !app.workflow_id && (app.status === 'in_progress') && (
              <Card>
                <CardHeader><CardTitle className="text-base">Request Resubmission</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Remarks <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={actionComment}
                      onChange={e => setActionComment(e.target.value)}
                      placeholder="Explain what needs to be revised..."
                      rows={3}
                    />
                  </div>
                  <Button variant="outline" onClick={handleAdminRequestResubmission} disabled={processing}>
                    <RotateCcw className="h-4 w-4 mr-2" />Request Resubmission
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Applicant submit action */}
            {isOwner && app.status === 'draft' && (
              <div className="flex gap-2">
                <Button onClick={handleSubmit} disabled={processing} className="flex-1">
                  <Send className="h-4 w-4 mr-2" />{processing ? 'Submitting...' : 'Submit Application'}
                </Button>
                <Button variant="destructive" onClick={handleCancel} disabled={processing}>
                  <Ban className="h-4 w-4 mr-2" />Cancel
                </Button>
              </div>
            )}

            {/* Applicant resubmit action */}
            {isOwner && app.status === 'resubmission_requested' && (
              <Card>
                <CardHeader><CardTitle className="text-base">Resubmission Required</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    The reviewer has requested changes to your application. Please update your documents/forms and resubmit.
                  </p>
                  <div className="space-y-2">
                    <Label className="text-sm">Remarks (optional)</Label>
                    <Textarea
                      value={actionComment}
                      onChange={e => setActionComment(e.target.value)}
                      placeholder="Describe the changes you made..."
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleResubmit} disabled={processing} className="flex-1">
                      <Send className="h-4 w-4 mr-2" />{processing ? 'Resubmitting...' : 'Resubmit Application'}
                    </Button>
                    <Button variant="destructive" onClick={handleCancel} disabled={processing}>
                      <Ban className="h-4 w-4 mr-2" />Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Applicant request edit (before approval, while submitted/in_progress) */}
            {isOwner && (app.status === 'submitted' || app.status === 'in_progress') && (
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Request to Edit Application</Label>
                    <Textarea
                      value={actionComment}
                      onChange={e => setActionComment(e.target.value)}
                      placeholder="Explain why you need to edit your application..."
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleRequestEdit} disabled={processing} className="flex-1">
                      <Edit className="h-4 w-4 mr-2" />Request Edit
                    </Button>
                    <Button variant="destructive" onClick={handleCancel} disabled={processing}>
                      <Ban className="h-4 w-4 mr-2" />Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar - Activity Log */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No actions yet</p>
                ) : (
                  <div className="space-y-3">
                    {events.slice().reverse().map(a => (
                      <div key={a.id} className="border-l-2 border-border pl-3 py-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {a.action.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.actor_email}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </p>
                        {a.comments && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{a.comments}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
