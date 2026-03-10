import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLog';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DocumentList } from '@/components/documents/DocumentList';
import { toast } from 'sonner';
import { APPLICATION_STATUS_LABELS, ApplicationStatus, INTERNAL_ROLES, ROLE_LABELS, AppRole } from '@/types/platform';
import { Send, CheckCircle, XCircle, MessageSquare, ArrowRightLeft, Loader2 } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary', submitted: 'default', under_review: 'outline',
  pending_approval: 'outline', approved: 'default', rejected: 'destructive', returned: 'outline',
};

interface Application {
  id: string;
  application_number: string;
  applicant_id: string;
  license_type: string;
  status: ApplicationStatus;
  workflow_id: string | null;
  current_step_id: string | null;
  data: Record<string, unknown>;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ApprovalAction {
  id: string;
  action: string;
  comments: string | null;
  actor_id: string;
  created_at: string;
  actor_email?: string;
}

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [actions, setActions] = useState<ApprovalAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionComment, setActionComment] = useState('');
  const [processing, setProcessing] = useState(false);

  const isInternal = user && INTERNAL_ROLES.includes(user.role);
  const isOwner = user && app?.applicant_id === user.id;

  useEffect(() => {
    async function load() {
      if (!id) return;
      const { data: appData } = await supabase.from('applications').select('*').eq('id', id).single();
      if (appData) setApp(appData as any);

      const { data: actionsData } = await supabase
        .from('approval_actions')
        .select('*')
        .eq('application_id', id)
        .order('created_at', { ascending: false });

      if (actionsData) {
        const userIds = [...new Set((actionsData as any[]).map(a => a.actor_id))];
        const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', userIds);
        const emailMap: Record<string, string> = {};
        profiles?.forEach(p => { emailMap[p.id] = p.email; });
        setActions((actionsData as any[]).map(a => ({ ...a, actor_email: emailMap[a.actor_id] || a.actor_id })));
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const handleSubmit = async () => {
    if (!app || !user) return;
    setProcessing(true);
    const { error } = await supabase
      .from('applications')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() } as any)
      .eq('id', app.id);
    if (error) { toast.error(error.message); setProcessing(false); return; }

    await logAudit({ action: 'application_submitted', entityType: 'application', entityId: app.id });
    // Create notification for admins
    await supabase.from('notifications').insert({
      user_id: user.id,
      title: 'Application Submitted',
      message: `Application ${app.application_number} has been submitted for review.`,
      type: 'success',
      entity_type: 'application',
      entity_id: app.id,
    } as any);

    toast.success('Application submitted');
    setApp(prev => prev ? { ...prev, status: 'submitted', submitted_at: new Date().toISOString() } : prev);
    setProcessing(false);
  };

  const handleAction = async (actionType: 'approve' | 'reject' | 'request_info' | 'delegate') => {
    if (!app || !user) return;
    setProcessing(true);

    const statusMap: Record<string, ApplicationStatus> = {
      approve: 'approved',
      reject: 'rejected',
      request_info: 'returned',
      delegate: app.status,
    };

    // Record the action
    await supabase.from('approval_actions').insert({
      application_id: app.id,
      action: actionType,
      actor_id: user.id,
      comments: actionComment || null,
    } as any);

    // Update application status
    const newStatus = statusMap[actionType];
    const updates: any = { status: newStatus };
    if (actionType === 'approve') updates.approved_at = new Date().toISOString();
    if (actionType === 'reject') updates.rejected_at = new Date().toISOString();

    await supabase.from('applications').update(updates).eq('id', app.id);

    await logAudit({
      action: `application_${actionType}`,
      entityType: 'application',
      entityId: app.id,
      newValue: { status: newStatus, comments: actionComment },
    });

    toast.success(`Application ${actionType === 'request_info' ? 'returned for revision' : actionType + 'd'}`);
    setApp(prev => prev ? { ...prev, status: newStatus, ...updates } : prev);
    setActionComment('');
    setProcessing(false);

    // Reload actions
    const { data: actionsData } = await supabase
      .from('approval_actions').select('*').eq('application_id', app.id).order('created_at', { ascending: false });
    if (actionsData) setActions(actionsData as any);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!app) {
    return (
      <DashboardLayout>
        <div className="text-center py-12 text-muted-foreground">Application not found</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Application ${app.application_number}`}
          description={app.license_type}
          backHref={isInternal ? '/applications/queue' : '/applications'}
          backLabel="Back to Applications"
          actions={
            <Badge variant={statusVariant[app.status] || 'outline'} className="text-sm px-3 py-1 capitalize">
              {APPLICATION_STATUS_LABELS[app.status] || app.status}
            </Badge>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Application Info */}
            <Card>
              <CardHeader><CardTitle>Application Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Application Number</p>
                    <p className="font-mono font-medium">{app.application_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">License Type</p>
                    <p className="font-medium">{app.license_type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p>{new Date(app.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Updated</p>
                    <p>{new Date(app.updated_at).toLocaleString()}</p>
                  </div>
                  {app.submitted_at && (
                    <div>
                      <p className="text-sm text-muted-foreground">Submitted</p>
                      <p>{new Date(app.submitted_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(isOwner && app.status === 'draft') && (
                  <DocumentUpload entityType="application" entityId={app.id} onUploaded={() => {}} />
                )}
                <DocumentList entityType="application" entityId={app.id} />
              </CardContent>
            </Card>

            {/* Approval Actions for Internal Users */}
            {isInternal && ['submitted', 'under_review', 'pending_approval'].includes(app.status) && (
              <Card>
                <CardHeader><CardTitle>Review Actions</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Comments</Label>
                    <Textarea
                      value={actionComment}
                      onChange={e => setActionComment(e.target.value)}
                      placeholder="Add review comments..."
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleAction('approve')} disabled={processing} className="bg-success hover:bg-success/90 text-success-foreground">
                      <CheckCircle className="h-4 w-4 mr-1" />Approve
                    </Button>
                    <Button onClick={() => handleAction('reject')} disabled={processing} variant="destructive">
                      <XCircle className="h-4 w-4 mr-1" />Reject
                    </Button>
                    <Button onClick={() => handleAction('request_info')} disabled={processing} variant="outline">
                      <MessageSquare className="h-4 w-4 mr-1" />Request Info
                    </Button>
                    <Button onClick={() => handleAction('delegate')} disabled={processing} variant="outline">
                      <ArrowRightLeft className="h-4 w-4 mr-1" />Delegate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Submit for applicant */}
            {isOwner && app.status === 'draft' && (
              <Button onClick={handleSubmit} disabled={processing} className="w-full">
                <Send className="h-4 w-4 mr-2" />{processing ? 'Submitting...' : 'Submit Application'}
              </Button>
            )}
          </div>

          {/* Sidebar - Activity Log */}
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Activity Log</CardTitle></CardHeader>
              <CardContent>
                {actions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No actions yet</p>
                ) : (
                  <div className="space-y-4">
                    {actions.map(a => (
                      <div key={a.id} className="border-l-2 border-border pl-3 py-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">{a.action}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-sm mt-1">{a.actor_email}</p>
                        {a.comments && <p className="text-sm text-muted-foreground mt-1 italic">"{a.comments}"</p>}
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
