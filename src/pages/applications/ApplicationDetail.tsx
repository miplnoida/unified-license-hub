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
import { StatusTimeline } from '@/components/applications/StatusTimeline';
import { WorkflowPanel } from '@/components/applications/WorkflowPanel';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { useLatestPublishedVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { toast } from 'sonner';
import { APPLICATION_STATUS_LABELS, ApplicationStatus, INTERNAL_ROLES } from '@/types/platform';
import { Send, Loader2, Building2, Layers, Tag, CheckCircle, XCircle } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  submitted: 'default',
  in_progress: 'outline',
  approved: 'default',
  rejected: 'destructive',
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
  const formTemplateId = appData?.form_template_id || null;
  const formVersionId = appData?.form_version_id || null;
  const formDataSaved = appData?.form_data || {};

  const { data: publishedVersion } = useLatestPublishedVersion(formTemplateId);
  const versionToUse = formVersionId || publishedVersion?.id || null;
  const { data: sections = [] } = useVersionSections(versionToUse);

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
    const { error } = await supabase.from('applications')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() } as any).eq('id', app.id);
    if (error) { toast.error(error.message); setProcessing(false); return; }
    await logAudit({ action: 'application_submitted', entityType: 'application', entityId: app.id });
    toast.success('Application submitted');
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

    await supabase.from('approval_actions').insert({
      application_id: app.id, action: actionType, actor_id: user.id, comments: comment || null,
    } as any);

    const updates: any = { status: newStatus };
    if (newStatus === 'approved') updates.approved_at = new Date().toISOString();
    if (newStatus === 'rejected') updates.rejected_at = new Date().toISOString();

    await supabase.from('applications').update(updates).eq('id', app.id);
    await logAudit({
      action: `application_${actionType}`, entityType: 'application', entityId: app.id,
      newValue: { status: newStatus, comments: comment },
    });

    // Send notification on approve/reject
    if (newStatus === 'approved' || newStatus === 'rejected') {
      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            action: 'dispatch',
            event_type: newStatus === 'approved' ? 'application_approved' : 'application_rejected',
            user_id: app.applicant_id,
            title: `Application ${newStatus === 'approved' ? 'Approved' : 'Rejected'}: ${app.application_number}`,
            message: `Your application ${app.application_number} has been ${newStatus}.\n\nRemarks: ${comment}`,
            entity_type: 'application',
            entity_id: app.id,
          },
        });
      } catch (e) {
        console.error('Notification failed', e);
      }

      // Generate license on approval
      if (newStatus === 'approved') {
        const { data: lic, error: licErr } = await supabase.from('licenses').insert({
          application_id: app.id,
          holder_id: app.applicant_id,
          license_type: app.license_type,
          regulator_id: app.regulator_id,
          sector_id: (app.data as any)?.sector_id || null,
          sub_sector_id: (app.data as any)?.sub_sector_id || null,
          category_id: (app.data as any)?.category_id || null,
        } as any).select().single();

        if (!licErr && lic) {
          toast.success(`License ${(lic as any).license_number} generated!`);
        }
      }
    }

    toast.success(`Application ${APPLICATION_STATUS_LABELS[newStatus]}`);
    setActionComment('');
    loadData();
    setProcessing(false);
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  if (!app) return <DashboardLayout><div className="text-center py-12 text-muted-foreground">Application not found</div></DashboardLayout>;

  // Manual actions for staff (no workflow configured)
  const showManualActions = isInternal && !app.workflow_id && ['submitted', 'in_progress'].includes(app.status);

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
                {sections.length > 0 && <TabsTrigger value="form">Submitted Forms</TabsTrigger>}
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

              {sections.length > 0 && (
                <TabsContent value="form" className="mt-4">
                  <FormRenderer
                    formName="Application Form"
                    sections={sections}
                    initialData={formDataSaved}
                    onSaveDraft={() => {}}
                    onSubmit={() => {}}
                    readOnly
                  />
                </TabsContent>
              )}

              <TabsContent value="documents" className="mt-4">
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    {(isOwner && app.status === 'draft') && (
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

            {/* Manual staff actions (no workflow) */}
            {showManualActions && (
              <Card>
                <CardHeader><CardTitle className="text-base">Review Actions</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {app.status === 'submitted' && (
                    <Button
                      size="sm"
                      onClick={() => handleStageTransition('in_progress', 'start_review', '')}
                      disabled={processing}
                    >
                      Start Review (Move to In Progress)
                    </Button>
                  )}
                  {app.status === 'in_progress' && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm">
                          Remarks / Description <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                          value={actionComment}
                          onChange={e => setActionComment(e.target.value)}
                          placeholder="Enter your remarks (mandatory for approve/reject)..."
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          onClick={() => handleStageTransition('approved', 'approve', actionComment)}
                          disabled={processing}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleStageTransition('rejected', 'reject', actionComment)}
                          disabled={processing}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Applicant submit action */}
            {isOwner && app.status === 'draft' && (
              <Button onClick={handleSubmit} disabled={processing} className="w-full">
                <Send className="h-4 w-4 mr-2" />{processing ? 'Submitting...' : 'Submit Application'}
              </Button>
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
