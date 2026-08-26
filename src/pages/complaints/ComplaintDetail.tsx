import { COLLAB_REVIEW_ENABLED } from '@/lib/featureFlags';
import { useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logAction } from '@/hooks/useAuditLog';
import { ArrowLeft, Loader2, Printer, Paperclip, ExternalLink, Building2, Check, ChevronsUpDown, AlertTriangle, Gavel } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { getSignedUrl } from '@/lib/secureFileUpload';
import { ComplaintAcknowledgement, type ComplaintAckInput } from '@/components/complaints/ComplaintAcknowledgement';
import { slaBucketFromRow, slaStatusLabel, slaStatusVariant } from '@/lib/complaintsSla';
import ComplaintInvestigationTab from '@/components/complaints/ComplaintInvestigationTab';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { ConductClassificationCard } from '@/components/complaints/ConductClassificationCard';
import { TriageHistoryCard } from '@/components/complaints/TriageHistoryCard';
import { JurisdictionWorkspace } from '@/components/complaints/jurisdiction/JurisdictionWorkspace';
import { TriagePanel } from '@/components/complaints/triage/TriagePanel';
import { COMPLAINT_TRIAGE_HISTORY_ENABLED } from '@/lib/featureFlags';
import { DecisionGatesBanner } from '@/components/decision-gates/DecisionGatesBanner';
import { useWorkflowTotalSla } from '@/hooks/useWorkflowTotalSla';
import { TotalSlaBadge } from '@/components/workflows/TotalSlaBadge';
import { CollaborativeReview } from '@/components/collab-review/CollaborativeReview';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { ComplaintTrackingTimeline } from '@/components/complaints/ComplaintTrackingTimeline';
import { WorkflowActionPanel } from '@/components/complaints/WorkflowActionPanel';
import { VulnerabilityReviewBanner } from '@/components/complaints/VulnerabilityReviewBanner';
import { ComplaintRfiTab } from '@/components/complaints/ComplaintRfiTab';
import { ComplaintClosureSection } from '@/components/complaints/ComplaintClosureSection';
import { ComplaintCurrentStepPanel } from '@/components/complaints/ComplaintCurrentStepPanel';
import { ComplaintOverviewSummary } from '@/components/complaints/ComplaintOverviewSummary';
import { ComplaintEntityCard } from '@/components/complaints/ComplaintEntityCard';

import type { CaseSection, CaseWorkSection } from '@/lib/complaintWorkflow';

// Lifecycle mutations (assign / resolve / close / escalate / severity) are
// driven exclusively by the Complaint Management Workflow via
// <WorkflowActionPanel>. Notification dispatch is owned by
// `execute_complaint_workflow_action` → notification_outbox — never React.

import { complaintStatusLabel, complaintStatusVariant } from '@/lib/complaintStatus';
import { ConductRelatedCasesPanel } from '@/components/conduct/ConductRelatedCasesPanel';
import { CaseThreadsPanel } from '@/components/correspondence/CaseThreadsPanel';
import { CommunicationTimeline } from '@/components/notifications/CommunicationTimeline';
import { formatDateTime } from '@/lib/datetime';
import { SupervisoryAiPanel } from '@/components/ai/SupervisoryAiPanel';
import { AiReportsTab } from '@/components/ai/report/AiReportsTab';



const SEVERITY_META: Record<string, { label: string; variant: any }> = {
  low: { label: 'Low', variant: 'outline' },
  medium: { label: 'Medium', variant: 'secondary' },
  high: { label: 'High', variant: 'default' },
  critical: { label: 'Critical', variant: 'destructive' },
};


export default function ComplaintDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  // Guided navigation: `section` picks the top-level area, `sub` the Case work
  // sub-section, so Current step can deep-link into supporting work.
  const section = (params.get('section') as CaseSection) || 'overview';
  const sub = (params.get('sub') as CaseWorkSection) || 'investigation';
  const goSection = (next: CaseSection, nextSub?: CaseWorkSection) => {
    const p = new URLSearchParams(params);
    p.set('section', next);
    if (nextSub) p.set('sub', nextSub);
    setParams(p, { replace: true });
  };
  const openCaseWork = (nextSub: CaseWorkSection) => goSection('casework', nextSub);

  // Only presentation + data-helper state remains. All lifecycle mutations
  // (assign / resolve / close / escalate / notice / decision / appeal / payment)
  // execute through <WorkflowActionPanel>, surfaced on the Current step tab.

  const [severity, setSeverity] = useState<string>('');
  const [severityOverride, setSeverityOverride] = useState<null | { from: string; to: string }>(null);
  const [ackOpen, setAckOpen] = useState(false);

  const complaintQ = useQuery({
    queryKey: ['complaint', id],
    enabled: !!id,
    queryFn: async () => {
      // get_complaint RPC returns the row + server-computed sla_status,
      // scoped by has_complaint_perm / complainant_id.
      const { data, error } = await (supabase as any).rpc('get_complaint', { _id: id });
      if (error) throw error;
      return data as any;
    },
  });
  const complaint = complaintQ.data;
  const isLoading = complaintQ.isLoading;

  /**
   * Complainants can be internal staff (`profiles`) OR portal/applicant users
   * (`pre_license_users`). Looking only in `profiles` left Name / User Type
   * blank for every complaint filed from the applicant portal, so we resolve
   * from both sources and derive a plain-language user type.
   */
  const complainantQ = useQuery({
    queryKey: ['complaint_complainant', complaint?.complainant_id],
    enabled: !!complaint?.complainant_id,
    queryFn: async () => {
      const cid = complaint!.complainant_id as string;
      const [staff, portal] = await Promise.all([
        supabase.from('profiles').select('full_name, email, user_type').eq('id', cid).maybeSingle(),
        supabase.from('pre_license_users').select('full_name, email, entity_name').eq('id', cid).maybeSingle(),
      ]);
      if (staff.error && portal.error) throw staff.error;
      if (staff.data) {
        return {
          full_name: (staff.data as any).full_name,
          email: (staff.data as any).email,
          user_type_label: (staff.data as any).user_type
            ? String((staff.data as any).user_type).replace(/_/g, ' ')
            : 'Regulator staff',
        };
      }
      if (portal.data) {
        return {
          full_name: (portal.data as any).full_name || (portal.data as any).entity_name,
          email: (portal.data as any).email,
          user_type_label: 'Applicant / Licensee user',
        };
      }
      return null;
    },
  });
  const complainant = complainantQ.data;


  const complaintTypeQ = useQuery({
    queryKey: ['complaint_type', complaint?.complaint_type_id],
    enabled: !!complaint?.complaint_type_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('complaint_types')
        .select('name, sla_days')
        .eq('id', complaint!.complaint_type_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const complaintType = complaintTypeQ.data;

  const enforcementQ = useQuery({
    queryKey: ['complaint_enforcement', complaint?.enforcement_action_id],
    enabled: !!complaint?.enforcement_action_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('enforcement_actions')
        .select('id, case_number, status')
        .eq('id', complaint!.enforcement_action_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const enforcement = enforcementQ.data;

  const attachmentsQ = useQuery({
    queryKey: ['complaint_attachments', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_evidence' as any)
        .select('id, label, created_at, file_upload_id, file_uploads(file_name, file_path, file_size, mime_type)')
        .eq('complaint_id', id!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const attachments = attachmentsQ.data ?? [];

  async function openAttachment(filePath?: string) {
    if (!filePath) return;
    const { url, error } = await getSignedUrl(filePath, 300);
    if (error || !url) { toast.error(error || 'Unable to open file'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function formatSize(n?: number | null) {
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ['complaint', id] });

  // takeInvestigation / resolve / close / escalate lifecycle mutations were
  // removed — they now run through <WorkflowActionPanel> in the Tracking tab,
  // driven by the Complaint Management Workflow.



  // Optimistic concurrency: every mutation carries the updated_at we loaded, so
  // the RPC raises `complaint_stale` if another user modified the row.
  const handleMutationError = (e: any) => {
    const msg = String(e?.message ?? '');
    if (msg.includes('complaint_stale')) {
      toast.error('This complaint was updated by another user. Reload before continuing.');
    } else {
      toast.error(msg || 'Update failed');
    }
    invalidate();
  };

  const setSeverityMut = useMutation({
    mutationFn: async (opts?: { reason?: string }) => {
      if (!severity) throw new Error('Pick a severity');
      const current = complaint?.severity ?? null;
      const changed = current && current !== severity;
      const args: Record<string, unknown> = {
        _id: id!,
        _severity: severity,
        _expected_updated_at: complaint?.updated_at ?? null,
      };
      // Only pass _reason when a genuine reason exists (avoid null literals).
      if (changed && opts?.reason) args._reason = opts.reason;
      const { error } = await (supabase as any).rpc('update_complaint_severity', args);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Severity updated'); setSeverity(''); invalidate(); },
    onError: handleMutationError,
  });

  // Applies the severity change ONLY after the override is logged.
  async function applySeverityChange(next: string, from: string, reason: string) {
    const { error } = await (supabase as any).rpc('update_complaint_severity', {
      _id: id!, _severity: next, _reason: reason,
      _expected_updated_at: complaint?.updated_at ?? null,
    });
    if (error) { handleMutationError(error); return; }
    toast.success('Severity overridden');
    setSeverity('');
    invalidate();
  }

  function handleSeverityUpdate() {
    if (!severity) { toast.error('Pick a severity'); return; }
    const current = complaint?.severity;
    if (!current || current === severity) {
      setSeverityMut.mutate({});
      return;
    }
    setSeverityOverride({ from: current, to: severity });
  }

  // resolve / close / escalate lifecycle mutations were removed. All three
  // now execute through <WorkflowActionPanel> → `execute_complaint_workflow_action`,
  // which handles state transition, audit log, and notification-outbox rows.

  // Entity mapping (licensed vs applicant entity), its search fallback and the
  // link mutation all live in <ComplaintEntityCard>. This query only supplies
  // the linked entity's display name to other panels.
  const linkedLicenseeQ = useQuery({
    queryKey: ['complaint_linked_licensee', complaint?.licensee_id],
    enabled: !!complaint?.licensee_id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('licensees')
        .select('id, name, license_id, licenses:license_id(license_number)')
        .eq('id', complaint!.licensee_id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: (data as any).id,
        name: (data as any).name,
        license_number: (data as any).licenses?.license_number ?? null,
      };
    },
  });



  if (isLoading) return <DashboardLayout><div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div></DashboardLayout>;
  if (complaintQ.isError) return <DashboardLayout><div className="p-8"><QueryErrorState title="Failed to load complaint" error={complaintQ.error} onRetry={() => complaintQ.refetch()} /></div></DashboardLayout>;
  if (!complaint) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Complaint not found.</div></DashboardLayout>;
  const statusMeta = { label: complaintStatusLabel(complaint.status), variant: complaintStatusVariant(complaint.status) };

  const sevMeta = SEVERITY_META[complaint.severity] || { label: complaint.severity, variant: 'outline' };
  const slaDays = complaint.sla_days || complaintType?.sla_days || 30;
  const _openDays = Math.floor((Date.now() - new Date(complaint.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const displayDaysOpen = complaint.resolved_at
    ? Math.floor((new Date(complaint.resolved_at).getTime() - new Date(complaint.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : _openDays;
  // Canonical SLA — server-computed when available (list_complaints/get_complaint
  // return sla_status); JS helper is fallback for optimistic UI.
  const slaStatus = slaBucketFromRow(complaint);
  // Marker of the case as displayed — used only for advisory-analysis staleness.
  const aiStaleness = {
    status: complaint.status,
    severity: complaint.severity,
    updated_at: (complaint as any).updated_at ?? null,
    resolved_at: complaint.resolved_at ?? null,
    closed_at: (complaint as any).closed_at ?? null,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Complaint ${complaint.complaint_number}`}
          description={complaint.subject}
          actions={
            <div className="flex items-center gap-2">
              <HistoryButton
                entityType="complaint"
                entityId={complaint.id}
                label="Audit details"
                variant="ghost"
                title={`Audit details — ${complaint.complaint_number}`}
              />

              <Button data-rbac="complaint_management.edit" variant="outline" size="sm" onClick={() => setAckOpen(true)}>
                <Printer className="h-4 w-4 mr-2" />Reprint acknowledgement
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/complaints"><ArrowLeft className="h-4 w-4 mr-2" />Back to Complaints</Link>
              </Button>
            </div>
          }
        />

        <DecisionGatesBanner subjectType="complaint" subjectId={complaint.id} compact />

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Status</p><Badge variant={statusMeta.variant} className="mt-1">{statusMeta.label}</Badge></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Severity</p><Badge variant={sevMeta.variant} className="mt-1">{sevMeta.label}</Badge></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Days Open</p><p className="text-2xl font-semibold">{displayDaysOpen}<span className="text-xs text-muted-foreground ml-1">/ {slaDays}</span></p></CardContent></Card>
          <Card><CardContent className="pt-6 space-y-2"><p className="text-xs text-muted-foreground">SLA</p>
            <Badge variant={slaStatusVariant(slaStatus)} className="capitalize">{slaStatusLabel(slaStatus)}</Badge>
            <ComplaintTotalSla complaintId={complaint.id} />
          </CardContent></Card>
        </div>

        <VulnerabilityReviewBanner
          complaintId={complaint.id}
          reviewState={(complaint as any).vulnerability_review_state ?? null}
          onCompleted={() => complaintQ.refetch()}
        />

        <Tabs value={section} onValueChange={(v) => goSection(v as CaseSection)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="current">Current step</TabsTrigger>
            <TabsTrigger value="casework">Case work</TabsTrigger>
            <TabsTrigger value="comms">Evidence &amp; communications</TabsTrigger>
            <TabsTrigger value="ai">AI analysis reports</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-4">
            {/* Advisory AI only — summarisation, suggestions and draft wording.
                Nothing here changes status, severity, priority or outcome. */}
            <AiReportsTab
              description="Every AI-assisted analysis available for this complaint, in one place. These reports interpret the recorded case — they change no status, severity, priority, category or outcome."
              blocks={[
                {
                  id: 'ai-complaint-summary',
                  label: 'Case summary',
                  hint: 'plain-language summary of the recorded case',
                  node: (
                    <SupervisoryAiPanel
                      module="complaints"
                      analysisType="complaint_summary"
                      scopeId={complaint.id}
                      label={complaint.complaint_number || 'Complaint'}
                      title="AI complaint case summary"
                      actionLabel="Summarise complaint"
                      description="A plain-language summary of the recorded case. It does not change the status, severity, priority or outcome."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-complaint-classification',
                  label: 'Suggested categorisation',
                  hint: 'for a case officer to consider',
                  node: (
                    <SupervisoryAiPanel
                      module="complaints"
                      analysisType="complaint_classification"
                      scopeId={complaint.id}
                      label={complaint.complaint_number || 'Complaint'}
                      title="AI suggested categorisation"
                      actionLabel="Suggest categorisation"
                      description="Suggestions for a case officer to consider. Severity and category of record stay system- and human-controlled."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-similar-complaints',
                  label: 'Similar complaints observed',
                  hint: 'across recorded complaints for the same licensee',
                  node: (
                    <SupervisoryAiPanel
                      module="complaints"
                      analysisType="similar_complaints"
                      scopeId={complaint.id}
                      label={complaint.complaint_number || 'Complaint'}
                      title="AI similar complaints observed"
                      actionLabel="Find similar complaints"
                      description="Similarities across recorded complaints for the same licensee. Duplicate handling stays with the existing process."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-conduct-recurrence',
                  label: 'Recurring conduct patterns',
                  hint: 'themes across the recorded complaint history',
                  node: (
                    <SupervisoryAiPanel
                      module="conduct"
                      analysisType="conduct_recurrence"
                      scopeId={complaint.id}
                      label={complaint.complaint_number || 'Complaint'}
                      title="AI recurring conduct pattern observations"
                      actionLabel="Review recurring themes"
                      description="Recurring themes across the recorded complaint history. It creates no alert, rule or conduct action."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-investigation-support',
                  label: 'Investigation support notes',
                  hint: 'evidence gaps and lines of enquiry to consider',
                  node: (
                    <SupervisoryAiPanel
                      module="complaints"
                      analysisType="investigation_assistance"
                      scopeId={complaint.id}
                      label={complaint.complaint_number || 'Complaint'}
                      title="AI investigation support notes"
                      actionLabel="Suggest lines of enquiry"
                      description="Evidence gaps and questions for you to consider. No task is created or assigned by this analysis."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-resolution-draft',
                  label: 'Draft response text',
                  hint: 'suggested wording only, not saved to the case',
                  node: (
                    <SupervisoryAiPanel
                      module="complaints"
                      analysisType="resolution_draft"
                      scopeId={complaint.id}
                      label={complaint.complaint_number || 'Complaint'}
                      title="AI draft response text"
                      actionLabel="Draft response text"
                      description="Suggested wording only, not saved to the case. The outcome and final wording remain yours."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-closure-qa',
                  label: 'Closure quality observations',
                  hint: 'what the closure record contains and what looks missing',
                  node: (
                    <SupervisoryAiPanel
                      module="complaints"
                      analysisType="qa_assistance"
                      scopeId={complaint.id}
                      label={complaint.complaint_number || 'Complaint'}
                      title="AI closure quality observations"
                      actionLabel="Review closure record"
                      description="Observations on what the closure record contains and what looks missing. It cannot approve, reject or pass a QA review."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
              ]}
            />
          </TabsContent>


          <TabsContent value="overview" className="space-y-4">
            <ComplaintOverviewSummary
              complaint={complaint}
              complaintTypeName={complaintType?.name ?? null}
              complainantName={complainant?.full_name ?? null}
              licenseeName={linkedLicenseeQ.data?.name ?? null}
              onOpenCurrentStep={() => goSection('current')}
            />

            <Card>
              <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Type</p>
                  {complaintTypeQ.isError ? (
                    <QueryErrorState compact message="Failed to load complaint type" onRetry={() => complaintTypeQ.refetch()} />
                  ) : (
                    <p>{complaintType?.name || '—'}</p>
                  )}
                </div>
                <div><p className="text-muted-foreground">Description</p><p className="whitespace-pre-wrap">{complaint.description}</p></div>
                {complaint.resolution && <div><p className="text-muted-foreground">Resolution</p><p className="whitespace-pre-wrap">{complaint.resolution}</p></div>}
                {complaint.enforcement_action_id && (
                  <div>
                    <p className="text-muted-foreground">Linked Enforcement</p>
                    {enforcementQ.isError ? (
                      <QueryErrorState compact message="Failed to load enforcement case" onRetry={() => enforcementQ.refetch()} />
                    ) : enforcement ? (
                      <Link to={`/enforcement/${enforcement.id}`} className="text-primary underline">{enforcement.case_number} ({enforcement.status})</Link>
                    ) : (
                      <p className="text-muted-foreground">—</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Complainant</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm md:grid-cols-3">
                {complainantQ.isError ? (
                  <div className="md:col-span-3">
                    <QueryErrorState compact message="Failed to load complainant profile" onRetry={() => complainantQ.refetch()} />
                  </div>
                ) : (
                  <>
                    <div><p className="text-muted-foreground">Name</p><p>{complainant?.full_name || (complaint.email ? 'Not provided' : '—')}</p></div>
                    <div><p className="text-muted-foreground">Email</p><p>{complaint.email || complainant?.email || '—'}</p></div>
                    <div><p className="text-muted-foreground">User Type</p><p className="capitalize">{complainant?.user_type_label || (complaint.email ? 'Public complainant' : '—')}</p></div>
                  </>
                )}
              </CardContent>
            </Card>
            {attachments.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />Evidence supplied
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {attachments.length} file{attachments.length === 1 ? '' : 's'} attached — open the{' '}
                  <span className="text-foreground font-medium">Evidence &amp; communications</span> tab to view them.
                </CardContent>
              </Card>
            )}

            {/* Advisory AI now lives on its own tab so it can be presented as a
                report. Status, severity, priority and category of record are
                unchanged by anything there. */}



            <ConductClassificationCard complaint={complaint} />
            {COMPLAINT_TRIAGE_HISTORY_ENABLED && <TriageHistoryCard complaint={complaint} />}
          </TabsContent>

          <TabsContent value="current" className="space-y-4">
            <ComplaintCurrentStepPanel
              complaintId={complaint.id}
              status={complaint.status}
              licenseeId={(complaint as any).licensee_id ?? null}
              onOpenSection={openCaseWork}
            />
          </TabsContent>

          <TabsContent value="casework" className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Supporting case work. Lifecycle progression stays on the <strong>Current step</strong> tab.
              </p>
              <Button size="sm" variant="outline" onClick={() => goSection('current')}>Return to current step</Button>
            </div>

            <Tabs value={sub} onValueChange={(v) => goSection('casework', v as CaseWorkSection)}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="jurisdiction">Jurisdiction</TabsTrigger>
                <TabsTrigger value="triage">Triage</TabsTrigger>
                <TabsTrigger value="investigation">Investigation</TabsTrigger>
                <TabsTrigger value="rfis">Information requests</TabsTrigger>
                <TabsTrigger value="classification">Classification &amp; case setup</TabsTrigger>
                <TabsTrigger value="closure">Closure &amp; QA</TabsTrigger>
              </TabsList>

              <TabsContent value="jurisdiction" className="space-y-4">
                <JurisdictionWorkspace complaintId={id!} />
              </TabsContent>

              <TabsContent value="triage" className="space-y-4">
                <TriagePanel complaintId={id!} onOpenJurisdiction={() => openCaseWork('jurisdiction')} />
              </TabsContent>

              <TabsContent value="investigation" className="space-y-4">
                <ComplaintInvestigationTab complaintId={id!} complaintStatus={complaint.status} />
                <p className="text-xs text-muted-foreground">
                  AI investigation support notes and draft response wording are on the{' '}
                  <strong>AI analysis reports</strong> tab.
                </p>

              </TabsContent>


              <TabsContent value="classification" className="space-y-4">

            <Card>
              <CardHeader><CardTitle className="text-base">Override severity</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Severity is assigned automatically from triage configuration. Changing it here is
                  recorded as a supervisory override and requires a reason.
                </p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Severity</Label>
                    <Select value={severity || complaint.severity} onValueChange={setSeverity}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SEVERITY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button data-rbac="complaint_management.edit" onClick={handleSeverityUpdate} disabled={setSeverityMut.isPending || !severity}>Override</Button>
                </div>
              </CardContent>
            </Card>

            <ComplaintEntityCard
              complaintId={id!}
              regulatorId={complaint.regulator_id ?? null}
              enforcementActionId={complaint.enforcement_action_id ?? null}
            />


            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                These are classification and case-setup details, not lifecycle steps. The complaint only progresses
                through the workflow action shown on the <strong>Current step</strong> tab, exactly as configured in
                the Complaint Management Workflow.
              </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="rfis" className="space-y-4">
                <ComplaintRfiTab
                  complaintId={complaint.id}
                  complaintNumber={complaint.complaint_number}
                  licenseeId={(complaint as any).licensee_id ?? null}
                  licenseeName={linkedLicenseeQ.data?.name ?? null}
                />
              </TabsContent>

              <TabsContent value="closure" className="space-y-4">
                <ComplaintClosureSection

                  complaintId={complaint.id}
                  status={complaint.status}
                  onGoToCurrentStep={() => goSection('current')}
                />

              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="comms" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />Evidence &amp; attachments
                  {attachments.length > 0 && (
                    <span className="text-xs text-muted-foreground font-normal">({attachments.length})</span>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground">Files supplied with the complaint or added during the case.</p>
              </CardHeader>
              <CardContent className="text-sm">
                {attachmentsQ.isError ? (
                  <QueryErrorState message="Failed to load attachments" onRetry={() => attachmentsQ.refetch()} />
                ) : attachments.length === 0 ? (
                  <p className="text-muted-foreground">No files have been attached to this complaint.</p>
                ) : (
                  <ul className="divide-y">
                    {attachments.map((a: any) => {
                      const f = a.file_uploads || {};
                      const name = f.file_name || a.label || 'Attachment';
                      return (
                        <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{name}</p>
                            <p className="text-xs text-muted-foreground">
                              Added {formatDateTime(a.created_at)}
                              {f.file_size ? ` • ${formatSize(f.file_size)}` : ''}
                            </p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => openAttachment(f.file_path)} disabled={!f.file_path}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />View
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
            <ConductRelatedCasesPanel caseType="complaint" caseId={complaint.id} />
            <CaseThreadsPanel
              sourceType="complaint"
              sourceId={complaint.id}
              sourceReference={complaint.reference_number ?? null}
              licenseeId={(complaint as any).licensee_id ?? null}
              title="Messages with the complainant and licensee"
            />
            <CommunicationTimeline
              objectType="complaint"
              objectId={complaint.id}
              title="Emails and text messages sent"
            />
          </TabsContent>


          <TabsContent value="history" className="space-y-4">
            <ComplaintTrackingTimeline
              complaintId={complaint.id}
              enforcementId={complaint.enforcement_action_id ?? undefined}
            />
          </TabsContent>

        </Tabs>

        {severityOverride && complaint && (
          <OverrideReasonDialog
            open={!!severityOverride}
            onOpenChange={(o) => { if (!o) setSeverityOverride(null); }}
            module="complaints"
            entityType="complaint"
            entityId={complaint.id}
            ruleKey="complaints.triage.severity_override"
            originalValue={{ severity: severityOverride.from }}
            overriddenValue={{ severity: severityOverride.to }}
            metadata={{
              source: 'phase1_override_framework',
              screen: 'ComplaintDetail',
              complaint_id: complaint.id,
              previous_severity: severityOverride.from,
              new_severity: severityOverride.to,
              recommendation_source: 'triage_engine',
            }}
            title="Override complaint severity"
            description={`Changing severity from ${severityOverride.from} to ${severityOverride.to} contradicts the current triage classification. Provide a written justification.`}
            onOverridden={async (overrideId) => {
              const next = severityOverride.to;
              const from = severityOverride.from;
              setSeverityOverride(null);
              await applySeverityChange(next, from, `Override justification captured (override_id=${overrideId})`);
            }}
          />
        )}

        {/* Close-complaint modal removed — closure now runs through the workflow
            action panel in the Tracking tab. */}


        {ackOpen && complaint && (
          <ComplaintAcknowledgement
            open={ackOpen}
            onOpenChange={setAckOpen}
            complaint={{
              id: complaint.id,
              complaint_number: complaint.complaint_number,
              subject: complaint.subject,
              submitted_at: complaint.created_at,
              complainant_name: (complaint as any).complainant_name ?? null,
              complainant_email: (complaint as any).email ?? null,
              channel: (complaint as any).channel ?? 'staff_intake',
              sla_days: slaDays,
            } as ComplaintAckInput}
          />
        )}

        {COLLAB_REVIEW_ENABLED && id && (
          <CollaborativeReview
            entityType="complaint"
            entityId={id}
            fields={[
              { key: 'investigation_notes', label: 'Investigation notes', value: (complaint as any)?.investigation_notes ?? '' },
              { key: 'resolution_notes', label: 'Resolution notes', value: (complaint as any)?.resolution_notes ?? '' },
              { key: 'findings', label: 'Findings', value: (complaint as any)?.findings ?? '' },
            ]}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function ComplaintTotalSla({ complaintId }: { complaintId: string }) {
  const { byEntityId } = useWorkflowTotalSla({ entityType: 'complaint', entityIds: [complaintId] });
  const entry = byEntityId.get(complaintId);
  if (!entry || entry.stepCount === 0) return null;
  return <TotalSlaBadge entry={entry} />;
}
