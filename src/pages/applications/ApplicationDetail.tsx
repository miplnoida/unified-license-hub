import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLog';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DocumentList } from '@/components/documents/DocumentList';
import { toast } from 'sonner';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_FLOW, ApplicationStatus, INTERNAL_ROLES } from '@/types/platform';
import { Send, CheckCircle, XCircle, MessageSquare, ArrowRightLeft, Loader2, ArrowRight, Shield } from 'lucide-react';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary', submitted: 'default', scrutiny: 'outline', query_raised: 'outline',
  resubmitted: 'outline', technical_review: 'outline', pending_approval: 'outline',
  approved: 'default', rejected: 'destructive', license_issued: 'default',
};

interface Application {
  id: string; application_number: string; applicant_id: string; license_type: string;
  status: ApplicationStatus; workflow_id: string | null; current_step_id: string | null;
  data: Record<string, unknown>; submitted_at: string | null; approved_at: string | null;
  rejected_at: string | null; created_at: string; updated_at: string;
}

interface ApprovalAction {
  id: string; action: string; comments: string | null; actor_id: string; created_at: string; actor_email?: string;
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

      const { data: actionsData } = await supabase.from('approval_actions').select('*').eq('application_id', id).order('created_at', { ascending: false });
      if (actionsData) {
        const userIds = [...new Set((actionsData as any[]).map(a => a.actor_id))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', userIds);
          const emailMap: Record<string, string> = {};
          profiles?.forEach(p => { emailMap[p.id] = p.email; });
          setActions((actionsData as any[]).map(a => ({ ...a, actor_email: emailMap[a.actor_id] || a.actor_id })));
        } else {
          setActions(actionsData as any);
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const handleSubmit = async () => {
    if (!app || !user) return;
    setProcessing(true);
    const { error } = await supabase.from('applications')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() } as any).eq('id', app.id);
    if (error) { toast.error(error.message); setProcessing(false); return; }
    await logAudit({ action: 'application_submitted', entityType: 'application', entityId: app.id });
    toast.success('Application submitted');
    setApp(prev => prev ? { ...prev, status: 'submitted', submitted_at: new Date().toISOString() } : prev);
    setProcessing(false);
  };

  const handleResubmit = async () => {
    if (!app || !user) return;
    setProcessing(true);
    const { error } = await supabase.from('applications').update({ status: 'resubmitted' } as any).eq('id', app.id);
    if (error) { toast.error(error.message); setProcessing(false); return; }
    await logAudit({ action: 'application_resubmitted', entityType: 'application', entityId: app.id });
    toast.success('Application resubmitted');
    setApp(prev => prev ? { ...prev, status: 'resubmitted' } : prev);
    setProcessing(false);
  };

  const handleStageTransition = async (newStatus: ApplicationStatus, actionType: string) => {
    if (!app || !user) return;
    setProcessing(true);

    await supabase.from('approval_actions').insert({
      application_id: app.id, action: actionType, actor_id: user.id, comments: actionComment || null,
    } as any);

    const updates: any = { status: newStatus };
    if (newStatus === 'approved') updates.approved_at = new Date().toISOString();
    if (newStatus === 'rejected') updates.rejected_at = new Date().toISOString();

    await supabase.from('applications').update(updates).eq('id', app.id);
    await logAudit({ action: `application_${actionType}`, entityType: 'application', entityId: app.id, newValue: { status: newStatus, comments: actionComment } });

    // If license issued, create license record
    if (newStatus === 'license_issued') {
      await supabase.from('licenses' as any).insert({
        application_id: app.id, holder_id: app.applicant_id, license_type: app.license_type,
      } as any);
    }

    toast.success(`Application moved to ${APPLICATION_STATUS_LABELS[newStatus]}`);
    setApp(prev => prev ? { ...prev, status: newStatus, ...updates } : prev);
    setActionComment('');
    setProcessing(false);

    const { data: actionsData } = await supabase.from('approval_actions').select('*').eq('application_id', app.id).order('created_at', { ascending: false });
    if (actionsData) setActions(actionsData as any);
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  if (!app) return <DashboardLayout><div className="text-center py-12 text-muted-foreground">Application not found</div></DashboardLayout>;

  // Determine available actions based on current status
  const getAvailableActions = (): { label: string; status: ApplicationStatus; action: string; variant?: 'default' | 'destructive' | 'outline'; icon: React.ReactNode }[] => {
    if (!isInternal) return [];
    switch (app.status) {
      case 'submitted':
      case 'resubmitted':
        return [
          { label: 'Move to Scrutiny', status: 'scrutiny', action: 'scrutiny_start', icon: <ArrowRight className="h-4 w-4 mr-1" /> },
          { label: 'Reject', status: 'rejected', action: 'reject', variant: 'destructive', icon: <XCircle className="h-4 w-4 mr-1" /> },
        ];
      case 'scrutiny':
        return [
          { label: 'Raise Query', status: 'query_raised', action: 'query_raised', variant: 'outline', icon: <MessageSquare className="h-4 w-4 mr-1" /> },
          { label: 'Move to Technical Review', status: 'technical_review', action: 'technical_review_start', icon: <ArrowRight className="h-4 w-4 mr-1" /> },
          { label: 'Reject', status: 'rejected', action: 'reject', variant: 'destructive', icon: <XCircle className="h-4 w-4 mr-1" /> },
        ];
      case 'technical_review':
        return [
          { label: 'Raise Query', status: 'query_raised', action: 'query_raised', variant: 'outline', icon: <MessageSquare className="h-4 w-4 mr-1" /> },
          { label: 'Move to Approval', status: 'pending_approval', action: 'approval_start', icon: <ArrowRight className="h-4 w-4 mr-1" /> },
          { label: 'Reject', status: 'rejected', action: 'reject', variant: 'destructive', icon: <XCircle className="h-4 w-4 mr-1" /> },
        ];
      case 'pending_approval':
        return [
          { label: 'Approve', status: 'approved', action: 'approve', icon: <CheckCircle className="h-4 w-4 mr-1" /> },
          { label: 'Reject', status: 'rejected', action: 'reject', variant: 'destructive', icon: <XCircle className="h-4 w-4 mr-1" /> },
        ];
      case 'approved':
        return [
          { label: 'Issue License', status: 'license_issued', action: 'license_issued', icon: <Shield className="h-4 w-4 mr-1" /> },
        ];
      default:
        return [];
    }
  };

  const availableActions = getAvailableActions();
  const currentStageIndex = APPLICATION_STATUS_FLOW.indexOf(app.status);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Application ${app.application_number}`}
          description={app.license_type}
          backHref={isInternal ? '/applications/queue' : '/applications'}
          backLabel="Back to Applications"
          actions={<Badge variant={statusVariant[app.status] || 'outline'} className="text-sm px-3 py-1 capitalize">{APPLICATION_STATUS_LABELS[app.status]}</Badge>}
        />

        {/* Stage Pipeline */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-1 overflow-x-auto">
              {APPLICATION_STATUS_FLOW.filter(s => s !== 'query_raised' && s !== 'resubmitted').map((stage, i) => {
                const stageIndex = APPLICATION_STATUS_FLOW.indexOf(stage);
                const isCurrent = stage === app.status;
                const isPast = stageIndex < currentStageIndex && app.status !== 'rejected';
                return (
                  <div key={stage} className="flex items-center">
                    {i > 0 && <div className={`w-8 h-0.5 ${isPast ? 'bg-primary' : 'bg-border'}`} />}
                    <div className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${isCurrent ? 'bg-primary text-primary-foreground' : isPast ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {APPLICATION_STATUS_LABELS[stage]}
                    </div>
                  </div>
                );
              })}
              {app.status === 'rejected' && (
                <div className="flex items-center">
                  <div className="w-8 h-0.5 bg-destructive" />
                  <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-destructive text-destructive-foreground">Rejected</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Application Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">Application Number</p><p className="font-mono font-medium">{app.application_number}</p></div>
                  <div><p className="text-sm text-muted-foreground">License Type</p><p className="font-medium">{app.license_type}</p></div>
                  <div><p className="text-sm text-muted-foreground">Created</p><p>{new Date(app.created_at).toLocaleString()}</p></div>
                  <div><p className="text-sm text-muted-foreground">Last Updated</p><p>{new Date(app.updated_at).toLocaleString()}</p></div>
                  {app.submitted_at && <div><p className="text-sm text-muted-foreground">Submitted</p><p>{new Date(app.submitted_at).toLocaleString()}</p></div>}
                  {app.approved_at && <div><p className="text-sm text-muted-foreground">Approved</p><p>{new Date(app.approved_at).toLocaleString()}</p></div>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(isOwner && ['draft', 'query_raised'].includes(app.status)) && (
                  <DocumentUpload entityType="application" entityId={app.id} onUploaded={() => {}} />
                )}
                <DocumentList entityType="application" entityId={app.id} />
              </CardContent>
            </Card>

            {/* Staff Review Actions */}
            {isInternal && availableActions.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Review Actions</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><Label>Comments</Label><Textarea value={actionComment} onChange={e => setActionComment(e.target.value)} placeholder="Add review comments..." rows={3} /></div>
                  <div className="flex gap-2 flex-wrap">
                    {availableActions.map(a => (
                      <Button key={a.action} variant={a.variant || 'default'} onClick={() => handleStageTransition(a.status, a.action)} disabled={processing}>
                        {a.icon}{a.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Applicant actions */}
            {isOwner && app.status === 'draft' && (
              <Button onClick={handleSubmit} disabled={processing} className="w-full">
                <Send className="h-4 w-4 mr-2" />{processing ? 'Submitting...' : 'Submit Application'}
              </Button>
            )}
            {isOwner && app.status === 'query_raised' && (
              <Button onClick={handleResubmit} disabled={processing} className="w-full">
                <Send className="h-4 w-4 mr-2" />{processing ? 'Resubmitting...' : 'Resubmit Application'}
              </Button>
            )}
          </div>

          <div>
            <Card>
              <CardHeader><CardTitle className="text-base">Activity Log</CardTitle></CardHeader>
              <CardContent>
                {actions.length === 0 ? <p className="text-sm text-muted-foreground">No actions yet</p> : (
                  <div className="space-y-4">
                    {actions.map(a => (
                      <div key={a.id} className="border-l-2 border-border pl-3 py-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">{a.action.replace(/_/g, ' ')}</Badge>
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
