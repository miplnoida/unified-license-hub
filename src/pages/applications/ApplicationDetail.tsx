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

import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DocumentList } from '@/components/documents/DocumentList';
import { AttachmentList } from '@/components/shared/AttachmentList';
import { StatusTimeline } from '@/components/applications/StatusTimeline';
import { FeeComponentsPanel } from '@/components/applications/FeeComponentsPanel';
import { LicenseePaymentPanel } from '@/components/applications/LicenseePaymentPanel';
import { WorkflowPanel } from '@/components/applications/WorkflowPanel';
import { PaymentVerificationDialog } from '@/components/applications/PaymentVerificationDialog';
import { SubmittedForms } from '@/components/applications/SubmittedForms';
import { FormVersionAssignmentsPanel } from '@/components/applications/FormVersionAssignmentsPanel';
import { ApplicationReviewBuilder } from '@/components/applications/ApplicationReviewBuilder';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { useIsPreLicensee } from '@/hooks/useUserPermissions';
import { resolveWorkflowApproval } from '@/lib/workflowApprovalResolver';
import { toast } from 'sonner';
import { APPLICATION_STATUS_LABELS, ApplicationStatus, INTERNAL_ROLES } from '@/types/platform';
import { Send, Loader2, Building2, Layers, Tag, CheckCircle, XCircle, Ban, RotateCcw, Edit, Clock } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  submitted: 'default',
  in_progress: 'outline',
  approved: 'default',
  rejected: 'destructive',
  cancelled: 'destructive',
  resubmission_requested: 'outline',
  query_raised: 'outline',
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
  const { hasModuleAccess, enforceDynamic } = useUserDynamicPermissions();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [docRefresh, setDocRefresh] = useState(0);
  const [actionComment, setActionComment] = useState('');
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [workflowApprovalEnabled, setWorkflowApprovalEnabled] = useState(false);
  const [workflowActive, setWorkflowActive] = useState<boolean>(false);
  const [workflowChecked, setWorkflowChecked] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('details');
  const [showReview, setShowReview] = useState(false);
  const [templateNames, setTemplateNames] = useState<Record<string, string>>({});

  const isInternal = !!user && (enforceDynamic ? hasModuleAccess('application_management') : INTERNAL_ROLES.includes(user.role));
  const isPreLicensee = useIsPreLicensee();
  const isOwner = user && app?.applicant_id === user.id;

  const appData = app?.data as any || {};
  const formTemplateIds: string[] = appData?.form_template_ids || [];
  const formsData: Record<string, Record<string, any>> = appData?.forms_data || {};
  const formVersionIds: Record<string, string> = appData?.form_version_ids || {};
  const hasSubmittedForms = formTemplateIds.length > 0;

  const loadData = async () => {
    if (!id) return;
    setWorkflowChecked(false);
    const { data: appRow } = await supabase.from('applications').select('*').eq('id', id).single();

    if (appRow) {
      setApp(appRow as any);
      // Single source of truth for workflow ON/OFF — see lib/workflowApprovalResolver.ts
      const resolution = await resolveWorkflowApproval({ application: appRow as any });
      setWorkflowApprovalEnabled(resolution.enabled);
      setWorkflowActive(resolution.enabled);
      setWorkflowChecked(true);
    } else {
      setWorkflowApprovalEnabled(false);
      setWorkflowActive(false);
      setWorkflowChecked(true);
    }

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

    // Check if a successful payment exists for this application
    const { data: pays } = await supabase
      .from('payments')
      .select('id, status')
      .eq('application_id', id)
      .in('status', ['completed', 'success', 'paid']);
    setPaymentComplete(!!(pays && pays.length > 0));

    setLoading(false);
  };

  useEffect(() => { loadData(); }, [id]);

  // Load form template names for review modal
  useEffect(() => {
    if (formTemplateIds.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('form_templates')
        .select('id, name')
        .in('id', formTemplateIds);
      if (data) {
        const map: Record<string, string> = {};
        (data as any[]).forEach(t => { map[t.id] = t.name; });
        setTemplateNames(map);
      }
    })();
  }, [JSON.stringify(formTemplateIds)]);

  // Re-validate workflow ON/OFF state when window regains focus
  // (handles case where admin toggled workflow off in another tab)
  useEffect(() => {
    const onFocus = () => { loadData(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Realtime: if the assigned workflow's is_active toggles, refresh immediately
  useEffect(() => {
    const wfId = app?.workflow_id;
    if (!wfId) return;
    const channel = supabase
      .channel(`wf-active-${wfId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'approval_workflows',
        filter: `id=eq.${wfId}`,
      }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.workflow_id]);

  useEffect(() => {
    const channel = supabase
      .channel('review-settings-application-detail')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'site_settings',
        filter: 'key=eq.review_settings',
      }, () => { loadData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = async () => {
    if (!app || !user) return;
    if (!paymentComplete) {
      toast.error('Please complete the payment before submitting the application.');
      return;
    }
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-and-submit', {
        body: { application_id: app.id },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setProcessing(false);
        return;
      }
      toast.success(data?.message || 'Application submitted');
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to submit application');
    } finally {
      setProcessing(false);
    }
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

    // Reject path → trusted RPC (handles status, rejected_at, workflow cancel,
    // approval_action, audit, notification — all atomically + bypasses the
    // workflow-field lock trigger via app.workflow_mutation_context).
    if (newStatus === 'rejected') {
      const { data, error } = await supabase.rpc('reject_application_action' as any, {
        _application_id: app.id,
        _comments: comment,
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || 'Reject failed');
        setProcessing(false);
        return;
      }
      toast.success(`Application ${APPLICATION_STATUS_LABELS[newStatus]}`);
      setActionComment('');
      loadData();
      setProcessing(false);
      return;
    }

    // Other non-final transitions: only insert an action row (no locked-field write).
    await supabase.from('approval_actions').insert({
      application_id: app.id, action: actionType, actor_id: user.id, comments: comment || null,
    } as any);
    await logAudit({
      action: `application_${actionType}`, entityType: 'application', entityId: app.id,
      newValue: { status: newStatus, comments: comment },
    });

    toast.success(`Application ${APPLICATION_STATUS_LABELS[newStatus]}`);
    setActionComment('');
    loadData();
    setProcessing(false);
  };

  const handleCancel = async () => {
    if (!app || !user) return;
    if (!window.confirm('Are you sure you want to cancel this application? This action cannot be undone.')) return;
    setProcessing(true);

    const { data, error } = await supabase.rpc('cancel_application' as any, {
      _application_id: app.id,
      _reason: 'Application cancelled by applicant',
    });
    if (error) {
      toast.error(error.message);
      setProcessing(false);
      return;
    }
    if ((data as any)?.error) {
      toast.error((data as any).error);
      setProcessing(false);
      return;
    }
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

    try {
      const { data, error } = await supabase.functions.invoke('verify-and-submit', {
        body: { application_id: app.id },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      await supabase.from('approval_actions').insert({
        application_id: app.id,
        action: 'resubmitted',
        actor_id: user.id,
        comments: actionComment || 'Application resubmitted after revision',
      } as any);

      await logAudit({
        action: 'application_resubmitted',
        entityType: 'application',
        entityId: app.id,
        newValue: { status: 'submitted' },
      });

      toast.success(data?.message || 'Application resubmitted successfully');
      setActionComment('');
      loadData();
    } catch (err: any) {
      toast.error('Resubmission failed: ' + (err.message || 'Unknown error'));
    } finally {
      setProcessing(false);
    }
  };

  // Admin/Regulator requests resubmission (without workflow)
  const handleAdminRequestResubmission = async () => {
    if (!app || !user || !actionComment.trim()) {
      toast.error('Please provide remarks explaining what needs to be revised');
      return;
    }
    setProcessing(true);

    // Trusted RPC: pauses workflow, writes approval_action + audit + applicant
    // notification. Required because the workflow-field lock trigger blocks
    // direct status writes.
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      'request_resubmission_for_application' as any,
      { _application_id: app.id, _comments: actionComment },
    );
    if (rpcErr || (rpcData as any)?.error) {
      toast.error((rpcData as any)?.error || rpcErr?.message || 'Failed to request resubmission');
      setProcessing(false);
      return;
    }

    await logAudit({ action: 'resubmission_requested', entityType: 'application', entityId: app.id, newValue: { comments: actionComment } });
    toast.success('Resubmission requested. Applicant has been notified.');
    setActionComment('');
    loadData();
    setProcessing(false);
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  if (!app) return <DashboardLayout><div className="text-center py-12 text-muted-foreground">Application not found</div></DashboardLayout>;

  // Determine if there's a pending edit request from the applicant.
  // Edit-request handling bypasses the normal approval workflow.
  let _lastReqAt: string | null = null;
  let _lastResAt: string | null = null;
  // Any action other than `edit_requested` that happens AFTER the latest edit
  // request counts as a resolution — admin allow/deny, resubmission flow,
  // workflow transitions, or applicant resubmit. This avoids the pending card
  // sticking around when RLS hides specific resolution rows from the owner.
  for (const e of events) {
    const a = (e as any).action as string;
    const t = (e as any).created_at as string;
    if (a === 'edit_requested') {
      if (!_lastReqAt || t > _lastReqAt) _lastReqAt = t;
    } else {
      if (!_lastResAt || t > _lastResAt) _lastResAt = t;
    }
  }
  const EDIT_REQUEST_ALLOWED_STATUSES = ['submitted', 'in_progress'];
  const hasPendingEditRequest =
    EDIT_REQUEST_ALLOWED_STATUSES.includes(app.status) &&
    !!_lastReqAt && (!_lastResAt || _lastResAt < _lastReqAt);

  // Show manual actions for internal users when no workflow is configured.
  // Workflow is effectively ON only when the admin review toggle is enabled
  // and an active workflow with steps is attached.
  const workflowOn = workflowApprovalEnabled && !!app.workflow_id && workflowActive;
  // Workflow / manual actions are suppressed while an edit request is pending —
  // admins must first allow or deny the edit request before resuming review.
  const showWorkflowPanel = workflowChecked && workflowOn === true && !hasPendingEditRequest;
  const showManualActions = workflowChecked && workflowOn === false && isInternal && ['submitted', 'in_progress'].includes(app.status) && !hasPendingEditRequest;
  const showEditRequestAdminPanel = isInternal && hasPendingEditRequest;

  // Admin allows the applicant's edit request → pause workflow and move app to
  // resubmission_requested so the applicant can edit and resubmit.
  const handleAllowEdit = async () => {
    if (!app || !user) return;
    setProcessing(true);
    try {
      const reason = actionComment.trim() || 'Edit request approved by administrator';
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'request_resubmission_for_application' as any,
        { _application_id: app.id, _comments: reason },
      );
      if (rpcErr || (rpcData as any)?.error) {
        toast.error((rpcData as any)?.error || rpcErr?.message || 'Failed to allow edit');
        return;
      }
      await supabase.from('approval_actions').insert({
        application_id: app.id, action: 'edit_approved', actor_id: user.id, comments: reason,
      } as any);
      await logAudit({ action: 'edit_approved', entityType: 'application', entityId: app.id, newValue: { comments: reason } });
      toast.success('Edit request approved. Applicant can now edit the application.');
      setActionComment('');
      await loadData();
    } finally {
      setProcessing(false);
    }
  };

  // Admin denies the applicant's edit request → workflow continues as normal.
  const handleDenyEdit = async () => {
    if (!app || !user) return;
    if (!actionComment.trim()) {
      toast.error('Please provide a reason for denying the edit request');
      return;
    }
    setProcessing(true);
    try {
      await supabase.from('approval_actions').insert({
        application_id: app.id, action: 'edit_denied', actor_id: user.id, comments: actionComment,
      } as any);
      await logAudit({ action: 'edit_denied', entityType: 'application', entityId: app.id, newValue: { comments: actionComment } });
      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            action: 'dispatch',
            event_type: 'edit_denied',
            user_id: app.applicant_id,
            title: `Edit Request Denied: ${app.application_number}`,
            message: `Your request to edit application ${app.application_number} was denied.\n\nReason: ${actionComment}`,
            entity_type: 'application',
            entity_id: app.id,
          },
        });
      } catch (e) { console.error('Notification failed', e); }
      toast.success('Edit request denied');
      setActionComment('');
      await loadData();
    } finally {
      setProcessing(false);
    }
  };

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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="details">Details</TabsTrigger>
                {hasSubmittedForms && <TabsTrigger value="form">Submitted Forms</TabsTrigger>}
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="fees">{isInternal ? 'Fees' : 'Payment'}</TabsTrigger>
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
                {!isPreLicensee && (isInternal ? (
                  <FeeComponentsPanel
                    applicationId={app.id}
                    editable={isOwner && (app.status === 'draft' || app.status === 'resubmission_requested' || app.status === 'query_raised')}
                  />
                ) : (
                  <LicenseePaymentPanel
                    applicationId={app.id}
                    canPay={isOwner && (app.status === 'draft' || app.status === 'resubmission_requested' || app.status === 'query_raised')}
                    onPaid={loadData}
                  />
                ))}
                {isInternal && <FormVersionAssignmentsPanel applicationId={app.id} />}
              </TabsContent>

              {hasSubmittedForms && (
                <TabsContent value="form" className="mt-4">
                  <SubmittedForms
                    formTemplateIds={formTemplateIds}
                    formsData={formsData}
                    formVersionIds={formVersionIds}
                    applicationStatus={app.status}
                    editable={isOwner && (app.status === 'draft' || app.status === 'resubmission_requested' || app.status === 'query_raised')}
                    onSave={async (templateId, data, versionId) => {
                      const updatedFormsData = { ...formsData, [templateId]: data };
                      const updatedFormVersionIds = versionId
                        ? { ...formVersionIds, [templateId]: versionId }
                        : formVersionIds;
                      const updatedAppData = {
                        ...appData,
                        forms_data: updatedFormsData,
                        form_version_ids: updatedFormVersionIds,
                      };
                      const { error } = await supabase.from('applications').update({ data: updatedAppData } as any).eq('id', app.id);
                      if (error) { toast.error('Failed to save form'); return; }
                      // Lightweight inline state via SubmittedForms; no per-save toast spam.
                      await loadData();
                    }}
                    onAllFormsCompleted={() => {
                      // Auto-advance to next pending step after all forms are filled
                      const next = !paymentComplete ? 'fees' : 'documents';
                      toast.success('All forms saved — continue with the next step');
                      setActiveTab(next);
                    }}
                  />
                </TabsContent>
              )}

              <TabsContent value="documents" className="mt-4">
                <Card>
                  {isOwner && app.status !== 'approved' && app.status !== 'rejected' && app.status !== 'cancelled' && (
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        Upload Supporting Documents
                      </CardTitle>
                    </CardHeader>
                  )}
                  <CardContent className="pt-6 space-y-6">
                    {isOwner && app.status !== 'approved' && app.status !== 'rejected' && app.status !== 'cancelled' && (
                      <DocumentUpload
                        entityType="application"
                        entityId={app.id}
                        onUploaded={() => setDocRefresh(p => p + 1)}
                      />
                    )}
                    <div key={docRefresh} className="space-y-4">
                      <AttachmentList
                        entityType="application"
                        entityId={app.id}
                        includeFormFields
                        showHeader
                        title="All Application Documents"
                        emptyText="No documents uploaded yet"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="fees" className="mt-4 space-y-4">
                {isInternal ? (
                  <>
                    <ViewPaymentButton applicationId={app.id} />
                    <FeeComponentsPanel
                      applicationId={app.id}
                      editable={isOwner && (app.status === 'draft' || app.status === 'resubmission_requested' || app.status === 'query_raised')}
                    />
                  </>
                ) : (
                  <LicenseePaymentPanel
                    applicationId={app.id}
                    canPay={isOwner && (app.status === 'draft' || app.status === 'resubmission_requested' || app.status === 'query_raised')}
                    onPaid={loadData}
                  />
                )}
              </TabsContent>
            </Tabs>

            {/* Admin: Edit Request Pending — bypasses workflow */}
            {showEditRequestAdminPanel && (
              <Card className="border-warning/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-warning" />
                    Edit Request Pending
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    The applicant has requested to edit this application. Review the request below and either allow the edit (which will pause the workflow and let the applicant resubmit) or deny it (workflow continues as normal).
                  </p>
                  {(() => {
                    const latestReq = [...events].reverse().find(e => (e as any).action === 'edit_requested') as any;
                    return latestReq?.comments ? (
                      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Applicant's reason</p>
                        <p className="whitespace-pre-wrap">{latestReq.comments}</p>
                      </div>
                    ) : null;
                  })()}
                  <div className="space-y-2">
                    <Label className="text-sm">Remarks <span className="text-muted-foreground">(required to deny)</span></Label>
                    <Textarea
                      value={actionComment}
                      onChange={e => setActionComment(e.target.value)}
                      placeholder="Add remarks for the applicant..."
                      rows={3}
                      disabled={processing}
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={handleAllowEdit} disabled={processing}>
                      {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Allow Edit
                    </Button>
                    <Button variant="destructive" onClick={handleDenyEdit} disabled={processing}>
                      <XCircle className="h-4 w-4 mr-2" />Deny Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Workflow-based review panel — only when workflow is ON (active + has steps) */}
            {showWorkflowPanel && (
              <WorkflowPanel
                applicationId={app.id}
                workflowId={app.workflow_id}
                workflowEnabled={workflowOn}
                applicationStatus={app.status}
                onStatusChange={loadData}
              />
            )}

            {/* Manual staff actions (no workflow configured) */}
            {showManualActions && (
              <Card>
                <CardHeader><CardTitle className="text-base">Review Actions</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Approval workflow is not active for this request type. As an authorized reviewer, you can take direct action below.
                  </p>
                  <div className="space-y-2">
                    <Label className="text-sm">Remarks <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={actionComment}
                      onChange={e => setActionComment(e.target.value)}
                      placeholder="Enter your remarks before taking action..."
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={() => handleStageTransition('approved', 'approved', actionComment)}
                      disabled={processing}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />Approve
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleStageTransition('rejected', 'rejected', actionComment)}
                      disabled={processing}
                    >
                      <XCircle className="h-4 w-4 mr-2" />Reject
                    </Button>
                    <Button variant="outline" onClick={handleAdminRequestResubmission} disabled={processing}>
                      <RotateCcw className="h-4 w-4 mr-2" />Request Resubmission
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Admin approve resubmission for resubmission_requested/query_raised apps (no workflow) */}
            {workflowChecked && workflowOn === false && isInternal && (app.status === 'resubmission_requested' || app.status === 'query_raised') && (
              <Card>
                <CardHeader><CardTitle className="text-base">Resubmission Pending</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This application has been sent back to the applicant for resubmission. Once they resubmit, you can continue review.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Applicant submit action */}
            {isOwner && app.status === 'draft' && (() => {
              const allFormsCompleted = formTemplateIds.length > 0 && formTemplateIds.every(tid => {
                const fd = formsData[tid];
                return fd && Object.keys(fd).length > 0;
              });
              const canSubmit = allFormsCompleted && paymentComplete;
              return (
                <>
                  <div className="flex gap-2">
                    <Button onClick={() => setShowReview(true)} disabled={processing || !canSubmit} className="flex-1">
                      <Send className="h-4 w-4 mr-2" />
                      {processing
                        ? 'Submitting...'
                        : !allFormsCompleted
                          ? `Complete all forms (${formTemplateIds.filter(tid => formsData[tid] && Object.keys(formsData[tid]).length > 0).length}/${formTemplateIds.length})`
                          : !paymentComplete
                            ? 'Complete payment to submit'
                            : 'Review & Submit'}
                    </Button>
                    <Button variant="destructive" onClick={handleCancel} disabled={processing}>
                      <Ban className="h-4 w-4 mr-2" />Cancel
                    </Button>
                  </div>
                  <Dialog open={showReview} onOpenChange={setShowReview}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Review Application</DialogTitle>
                        <DialogDescription>
                          Please review your entered information before final submission.
                        </DialogDescription>
                      </DialogHeader>
                      <ApplicationReviewBuilder
                        templates={formTemplateIds.map((tid, i) => ({ id: tid, name: templateNames[tid] || `Form ${i + 1}` }))}
                        formProgressMap={Object.fromEntries(formTemplateIds.map(tid => [tid, { data: formsData[tid] || {} }]))}
                        versionIdByTemplate={formVersionIds}
                        mode="readonly"
                        loading={processing}
                        onAcknowledge={async () => { setShowReview(false); await handleSubmit(); }}
                      />
                    </DialogContent>
                  </Dialog>
                </>
              );
            })()}

            {/* Applicant resubmit action */}
            {isOwner && (app.status === 'resubmission_requested' || app.status === 'query_raised') && (
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
            {isOwner && EDIT_REQUEST_ALLOWED_STATUSES.includes(app.status) && (() => {

              if (hasPendingEditRequest) {
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-4 w-4 text-warning" />
                        Edit Request Pending
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Your request to edit this application is awaiting administrator review. You'll be notified once it's approved or denied.
                      </p>
                    </CardContent>
                  </Card>
                );
              }

              return (
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
              );
            })()}
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

function ViewPaymentButton({ applicationId }: { applicationId: string }) {
  const [payment, setPayment] = useState<any>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('payments' as any)
        .select('*')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPayment(data || null);
    })();
  }, [applicationId]);
  if (!payment) return null;
  return (
    <div className="flex justify-end">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        View Payment Details
      </Button>
      <PaymentVerificationDialog
        open={open}
        onOpenChange={setOpen}
        payment={payment}
        applicationNumber={payment.application_id}
        isAdminView={payment.status !== 'success'}
        onVerified={() => setOpen(false)}
      />
    </div>
  );
}
