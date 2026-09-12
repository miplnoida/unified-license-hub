import { COLLAB_REVIEW_ENABLED } from '@/lib/featureFlags';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivityTab } from '@/components/applications/ActivityTab';
import { ApplicationRfiTab } from '@/components/applications/ApplicationRfiTab';
import { ConsolidatedCaseTab } from '@/components/applications/ConsolidatedCaseTab';
import { CaseSnapshotFields } from '@/components/applications/CaseSnapshotFields';
import { ApplicantLicenseeIdentity } from '@/components/applications/ApplicantLicenseeIdentity';
import { ApplicationDocumentsPanel } from '@/components/applications/ApplicationDocumentsPanel';

import { ApplicationConditionsTab } from '@/components/applications/ApplicationConditionsTab';
import { HistoryButton } from '@/components/audit/HistoryButton';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getApplicationCategory, getApplicationCategoryLabel } from '@/lib/applicationCategory';
import { formatTaxonomyLabel } from '@/lib/formatTaxonomyLabel';

import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DocumentList } from '@/components/documents/DocumentList';
import { BatchDocumentUpload } from '@/components/shared/BatchDocumentUpload';
import { StatusTimeline } from '@/components/applications/StatusTimeline';
import { FeeComponentsPanel } from '@/components/applications/FeeComponentsPanel';
import { LicenseePaymentPanel } from '@/components/applications/LicenseePaymentPanel';
import { WorkflowPanel } from '@/components/applications/WorkflowPanel';

import { PaymentVerificationDialog } from '@/components/applications/PaymentVerificationDialog';
import { CollaborativeReview } from '@/components/collab-review/CollaborativeReview';
import { SubmittedForms } from '@/components/applications/SubmittedForms';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

import { ApplicationReviewBuilder } from '@/components/applications/ApplicationReviewBuilder';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { applicationRecordAction, applicationDraftSave, applicationClassificationUpdate } from '@/lib/applicationGovernedOps';
import { useIsPreLicensee } from '@/hooks/useUserPermissions';
import { resolveWorkflowApproval } from '@/lib/workflowApprovalResolver';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { APPLICATION_STATUS_LABELS, ApplicationStatus, INTERNAL_ROLES } from '@/types/platform';
import { markApplicationInProgressIfDraft, normalizeApplicationStatus } from '@/lib/applicationStatus';
import { Send, Loader2, Building2, Layers, Tag, CheckCircle, XCircle, Ban, RotateCcw, Edit, Clock } from 'lucide-react';
import { useLicenseStatusGate } from '@/hooks/useLicenseStatusGate';

// Strong active-tab treatment so the current tab is obvious on the wrapped tab strip.
const TAB_TRIGGER_CLASS =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=active]:ring-2 data-[state=active]:ring-primary/30 text-muted-foreground hover:bg-muted';
import { LicenseStatusBanner } from '@/components/shared/LicenseStatusBanner';
import { useLicenseeAccessGuard } from '@/hooks/useLicenseeAccessGuard';
import { usePpoc } from '@/contexts/PpocContext';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { LicenseAppealPanel } from '@/components/appeals/LicenseAppealPanel';
import { ReinstatedAfterAppealBanner } from '@/components/appeals/ReinstatedAfterAppealBanner';

import { DecisionGatesBanner } from '@/components/decision-gates/DecisionGatesBanner';
import { ConfigurableDecisionActions } from '@/components/applications/ConfigurableDecisionActions';
import { ApproverDecisionView } from '@/components/applications/ApproverDecisionView';
import { SubmissionAcknowledgementPanel } from '@/components/applications/SubmissionAcknowledgementPanel';
import { evaluateApplicationSufficiency } from '@/lib/applicationSufficiency';
import { useSectors, useSubSectors, useCategories } from '@/hooks/useMasterConfig';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CaseThreadsPanel } from '@/components/correspondence/CaseThreadsPanel';
import { CommunicationTimeline } from '@/components/notifications/CommunicationTimeline';
import { formatDateTime } from '@/lib/datetime';
import { ApplicationCaseHeader } from '@/components/applications/ApplicationCaseHeader';
import { ApplicationWithdrawalPanel } from '@/components/applications/ApplicationWithdrawalPanel';
import { ApplicationFitAndProperPanel } from '@/components/applications/ApplicationFitAndProperPanel';
import { ApplicationCurrentStepSummary } from '@/components/applications/ApplicationCurrentStepSummary';
import { useApplicationCase } from '@/hooks/useApplicationCaseModels';





const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  submitted: 'default',
  in_progress: 'outline',
  approved: 'default',
  rejected: 'destructive',
  cancelled: 'destructive',
  resubmission_requested: 'outline',
  resubmission_required: 'outline',
  returned_for_correction: 'outline',
  info_requested: 'outline',
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
  const [searchParams] = useSearchParams();
  const forceReadOnlyView = searchParams.get('view') === 'submitted';
  const initialTabParam = searchParams.get('tab');
  const justSubmitted = searchParams.get('submitted') === '1';
  const { user } = useAuth();
  const { hasModuleAccess, enforceDynamic } = useUserDynamicPermissions();
  const portalContext = useEffectivePortalContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [activeTab, setActiveTab] = useState<string>(initialTabParam || 'details');
  const [openRfiCount, setOpenRfiCount] = useState<number>(0);
  const [showReview, setShowReview] = useState(false);
  const [templateNames, setTemplateNames] = useState<Record<string, string>>({});
  const [taxSector, setTaxSector] = useState<string>('');
  const [taxSubSector, setTaxSubSector] = useState<string>('');
  const [taxCategory, setTaxCategory] = useState<string>('');
  const [savingTaxonomy, setSavingTaxonomy] = useState(false);
  const { data: allSectorsList = [] } = useSectors();
  const { data: allSubSectorsList = [] } = useSubSectors();
  const { data: allCategoriesList = [] } = useCategories();
  const { data: allFormTemplates = [] } = useFormTemplates(undefined, (app as any)?.regulator_id ?? undefined);

  // Count open RFI items on this application (drives the badge next to the RFI tab).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data: rfis } = await supabase
        .from('application_rfis' as any)
        .select('id')
        .eq('application_id', id)
        .in('status', ['open', 'responded']);
      const rfiIds = ((rfis as any[]) || []).map((r) => r.id);
      if (!rfiIds.length) {
        if (!cancelled) setOpenRfiCount(0);
        return;
      }
      const { count } = await supabase
        .from('application_rfi_items' as any)
        .select('id', { count: 'exact', head: true })
        .in('rfi_id', rfiIds)
        .neq('response_status', 'responded');
      if (!cancelled) setOpenRfiCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, activeTab]);



  const isInternal = !!user && !portalContext.loading && (portalContext.isInternal || (enforceDynamic ? hasModuleAccess('application_management') : INTERNAL_ROLES.includes(user.role)));
  const isPreLicensee = useIsPreLicensee();
  const isOwner = user && app?.applicant_id === user.id;
  const licenseGate = useLicenseStatusGate();
  const accessGuard = useLicenseeAccessGuard();
  const { resolvedLicenseeId } = usePpoc();
  // EPR-05 — canonical licensing case read model (stage, SLA, priority, blockers,
  // next action). Server-owned; nothing here is derived in the client.
  const { data: caseModel } = useApplicationCase(id, isInternal ? 'internal' : 'external');


  // Internal reviewers land on the Workflow tab when a workflow review is live,
  // unless the URL asked for a specific tab.
  const workflowTabAutoSelected = useRef(false);
  useEffect(() => {
    if (initialTabParam || workflowTabAutoSelected.current) return;
    if (!isInternal || !workflowChecked) return;
    const workflowLive = workflowApprovalEnabled && !!(app as any)?.workflow_id && workflowActive;
    if (!workflowLive) return;
    workflowTabAutoSelected.current = true;
    setActiveTab('workflow');
  }, [initialTabParam, isInternal, workflowChecked, workflowApprovalEnabled, workflowActive, (app as any)?.workflow_id]);



  const appData = app?.data as any || {};
  const formTemplateIds: string[] = appData?.form_template_ids || [];
  const formsData: Record<string, Record<string, any>> = appData?.forms_data || {};
  const formVersionIds: Record<string, string> = appData?.form_version_ids || {};
  const originalFormsData: Record<string, Record<string, any>> | undefined = appData?.original_forms_data || undefined;
  const isRenewalApplication: boolean = !!appData?.is_renewal;
  const legacyRenewalFallback: boolean = !!appData?.legacy_renewal_fallback;
  const hasRenewalDiff = isRenewalApplication && !!originalFormsData && Object.keys(originalFormsData).length > 0;
  const hasSubmittedForms = formTemplateIds.length > 0;

  const taxonomyEditable = !!app
    && !forceReadOnlyView
    && !isInternal
    && (['draft', 'in_progress'].includes(normalizeApplicationStatus(app.status)));

  // Sync local dropdown state with the loaded application record.
  useEffect(() => {
    if (!app) return;
    setTaxSector(appData?.sector_id || '');
    setTaxSubSector(appData?.sub_sector_id || '');
    setTaxCategory(appData?.category_id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id]);

  const filteredTaxSubSectors = (allSubSectorsList as any[]).filter(
    (s: any) => s.sector_id === taxSector && s.status === 'active'
  );
  const filteredTaxCategories = (allCategoriesList as any[]).filter(
    (c: any) => c.sub_sector_id === taxSubSector && c.status === 'active'
  );

  // EPR-05 — form/package applicability is SERVER authority. The browser sends the
  // requested classification and renders whatever requirement set the server
  // returns; it never matches templates or prunes regulatory answers itself.
  const persistTaxonomy = async (secId: string, subId: string, catId: string) => {
    if (!app) return;
    setSavingTaxonomy(true);
    try {
      const result = await applicationClassificationUpdate({
        applicationId: app.id,
        sectorId: secId,
        subSectorId: subId,
        categoryId: catId,
      });
      if (result?.archived_form_answers > 0) {
        toast.info(
          `${result.archived_form_answers} form response set(s) are no longer applicable and have been archived by the regulator system.`,
        );
      }
      const { data: refreshed } = await supabase
        .from('applications')
        .select('*')
        .eq('id', app.id)
        .single();
      if (refreshed) setApp(refreshed as any);
      queryClient.invalidateQueries({ queryKey: ['application', app.id] });
      queryClient.invalidateQueries({ queryKey: ['application_case', app.id] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update sector details');
    } finally {
      setSavingTaxonomy(false);
    }
  };


  const handleTaxSectorChange = (v: string) => {
    setTaxSector(v);
    setTaxSubSector('');
    setTaxCategory('');
    void persistTaxonomy(v, '', '');
  };
  const handleTaxSubSectorChange = (v: string) => {
    setTaxSubSector(v);
    setTaxCategory('');
    void persistTaxonomy(taxSector, v, '');
  };
  const handleTaxCategoryChange = (v: string) => {
    setTaxCategory(v);
    void persistTaxonomy(taxSector, taxSubSector, v);
  };



  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[ApplicationDetail] rendered from src/pages/applications/ApplicationDetail.tsx');
    }
  }, []);

  const loadData = async () => {
    if (!id) return;
    // Note: do NOT reset workflowChecked to false here. Doing so unmounts
    // <WorkflowPanel/> (and its open dialogs — e.g. signature upload) whenever
    // loadData refetches (window focus after OS file picker, realtime updates).
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
    const actionList = (actions as any[]) || [];
    const appAny = appRow as any;
    const applicantId = appAny?.applicant_id as string | undefined;
    const userIds = [...new Set([...actionList.map(a => a.actor_id).filter(Boolean), applicantId].filter(Boolean))] as string[];
    const nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      // Secure resolver so applicant (pre-licensee) names are visible to every
      // internal reviewer role, not just Super Admin / Licensing Officer.
      const { data: resolved } = await supabase.rpc('resolve_user_display_names' as any, {
        _ids: userIds,
      });
      ((resolved as any[]) ?? []).forEach((row: any) => {
        const label = row.display_name || row.email;
        if (label && !nameMap[row.id]) nameMap[row.id] = label;
      });
    }
    const resolveActor = (uid?: string | null) => {
      if (!uid) return 'System';
      if (nameMap[uid]) return nameMap[uid];
      const d = appAny?.data || {};
      return d.applicant_name || d.full_name || d.contact_person || d.email || 'Unknown user';
    };

    const enriched: TimelineEvent[] = actionList.map(a => ({
      ...a,
      status: a.action,
      actor_email: resolveActor(a.actor_id),
    }));
    const hasSubmittedAction = enriched.some(e => e.action === 'submitted' || e.action === 'submit');
    if (!hasSubmittedAction && appAny?.submitted_at) {
      enriched.unshift({
        id: `synthetic-submitted-${appAny.id}`,
        action: 'submitted',
        status: 'submitted',
        comments: null,
        actor_id: applicantId || '',
        created_at: appAny.submitted_at,
        actor_email: resolveActor(applicantId),
      });
    }
    setEvents(enriched);

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

  // Re-read the application whenever the reviewer opens the submitted forms or
  // RFI tab, so post-RFI applicant edits are always shown (never a snapshot
  // captured when the page first loaded).
  useEffect(() => {
    if (!id) return;
    if (activeTab !== 'form' && activeTab !== 'rfi') return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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

  // Auto-run sufficiency evaluation once when the app moves to submitted/review
  // and no evaluation exists yet. Guarded by ref so it only fires once per mount.
  const sufficiencyAutoRan = useRef<string | null>(null);
  useEffect(() => {
    if (!app || !user) return;
    const gatedStatuses = ['submitted', 'under_review', 'review', 'pending_review'];
    if (!gatedStatuses.includes(app.status)) return;
    if (sufficiencyAutoRan.current === app.id) return;
    sufficiencyAutoRan.current = app.id;
    (async () => {
      try {
        const { data: existing } = await supabase
          .from('sufficiency_evaluations' as any)
          .select('id, evaluated_at')
          .eq('application_id', app.id)
          .order('evaluated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const stale =
          !existing || Date.now() - new Date((existing as any).evaluated_at).getTime() > 30 * 60_000;
        if (stale) {
          await evaluateApplicationSufficiency({
            applicationId: app.id,
            triggerSource: existing ? 'rfi_closed' : 'application_submitted',
          });
        }
      } catch {
        /* silent — panel will show manual trigger */
      }
    })();
  }, [app?.id, app?.status, user?.id]);

  const handleSubmit = async () => {
    if (!app || !user) return;
    if (licenseGate.isBlocked) {
      toast.error(licenseGate.blockedReason || 'Your license is not in good standing.');
      return;
    }
    if (resolvedLicenseeId) {
      const sectorId = (app.data as any)?.sector_id || null;
      const authorized = await accessGuard.verify(resolvedLicenseeId, sectorId);
      if (!authorized) {
        toast.error('You are not authorized to submit this application for this licensee.');
        return;
      }
    }
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
      {
        const referenceNumber = (data as any)?.application_number || (data as any)?.reference || app.application_number;
        toast.success(data?.message || 'Application submitted', referenceNumber ? { description: `Reference: ${referenceNumber}` } : undefined);
      }
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

    // F4-B (GAP-F4-01): there is exactly ONE production final-approval path —
    // the governed workflow action (decision gates → maker/checker →
    // perform_final_workflow_approval → provision_application_entity).
    // The legacy manual-approval RPC has been retired, so this screen no longer
    // offers an ad-hoc approval route.
    if (newStatus === 'approved') {
      toast.error('Final approval must be taken in the Workflow panel', {
        description:
          'Licence approval runs through the governed workflow (decision gates, maker/checker and licence issuance). Use the Approval Workflow action on this application.',
      });
      setProcessing(false);
      return;
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
    try {
      await applicationRecordAction({ applicationId: app.id, action: actionType, comments: comment || null });
    } catch (actionErr: any) {
      const msg = actionErr?.message || '';
      const m = msg.match(/REVIEW_BLOCKED:(\d+)/);
      toast.error(m
        ? `Approval blocked: ${m[1]} unresolved blocking review comment(s). Resolve them before proceeding.`
        : (msg || 'Action failed'));
      setProcessing(false);
      return;
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

    try {
      await applicationRecordAction({
        applicationId: app.id, action: 'edit_requested', comments: actionComment,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Edit request failed');
      setProcessing(false);
      return;
    }
    toast.success('Edit request submitted. Admin will review your request.');
    setActionComment('');
    loadData();
    setProcessing(false);
  };

  // Applicant resubmits application after resubmission was requested
  const handleResubmit = async () => {
    if (!app || !user) return;
    if (licenseGate.isBlocked) {
      toast.error(licenseGate.blockedReason || 'Your license is not in good standing.');
      return;
    }
    if (resolvedLicenseeId) {
      const sectorId = (app.data as any)?.sector_id || null;
      const authorized = await accessGuard.verify(resolvedLicenseeId, sectorId);
      if (!authorized) {
        toast.error('You are not authorized to resubmit this application for this licensee.');
        return;
      }
    }
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

      await applicationRecordAction({
        applicationId: app.id,
        action: 'resubmitted',
        comments: actionComment || 'Application resubmitted after revision',
      });

      // `application.resubmitted` is written canonically by the status-change
      // trigger on public.applications and the approval_actions trigger.

      {
        const referenceNumber = (data as any)?.application_number || (data as any)?.reference || app.application_number;
        toast.success(data?.message || 'Application resubmitted successfully', referenceNumber ? { description: `Reference: ${referenceNumber}` } : undefined);
      }
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

    // `application.resubmission_requested` is written canonically by the
    // status-change trigger on public.applications.
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
  // Request Edit only applies once the application has been submitted for review.
  // 'in_progress' means the user has merely saved a form — they can still edit freely.
  const EDIT_REQUEST_ALLOWED_STATUSES = ['submitted', 'under_review', 'review', 'pending_review'];
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
  const showManualActions = workflowChecked && workflowOn === false && isInternal && ['submitted', 'under_review', 'review', 'pending_review'].includes(app.status) && !hasPendingEditRequest;
  const showEditRequestAdminPanel = isInternal && hasPendingEditRequest;
  const showResubmissionPendingNotice =
    workflowChecked && workflowOn === false && isInternal &&
    (app.status === 'resubmission_requested' || app.status === 'query_raised' || app.status === 'info_requested');
  // Workflow/review lives in its own tab so it no longer repeats under every tab.
  const showWorkflowTab =
    showWorkflowPanel || showManualActions || showEditRequestAdminPanel || showResubmissionPendingNotice;

  // Applicant-only "Request Edit" tab. Same eligibility rules as before —
  // owner, submitted-for-review status, and not a read-only view.
  const showRequestEditTab =
    isOwner && !forceReadOnlyView && EDIT_REQUEST_ALLOWED_STATUSES.includes(app.status);




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
      await applicationRecordAction({
        applicationId: app.id, action: 'edit_approved', comments: reason,
      });
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
      await applicationRecordAction({
        applicationId: app.id, action: 'edit_denied', comments: actionComment,
      });
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
          description={formatTaxonomyLabel(app.license_type)}
          backHref={isInternal ? '/applications/queue' : '/applications'}
          backLabel="Back to Applications"
          actions={
            <div className="flex items-center gap-2">
              <Badge
                variant={getApplicationCategory(appData) === 'post_license' ? 'default' : 'secondary'}
                className="text-sm px-3 py-1"
              >
                {getApplicationCategoryLabel(appData)} Application
              </Badge>
              <Badge variant={statusVariant[app.status] || 'outline'} className="text-sm px-3 py-1">
                {APPLICATION_STATUS_LABELS[app.status]}
              </Badge>
              {isOwner && (app.status === 'resubmission_requested' || app.status === 'query_raised' || app.status === 'info_requested') && (
                <Button onClick={handleResubmit} disabled={processing || licenseGate.isBlocked} size="sm">
                  <Send className="h-4 w-4 mr-2" />
                  {processing ? 'Resubmitting...' : 'Resubmit Application'}
                </Button>
              )}
              {isInternal && <HistoryButton entityType="application" entityId={app.id} title={`History — ${app.application_number}`} />}
            </div>
          }
        />

        {/* EPR-05 — standard licensing case header (server read model) */}
        <ApplicationCaseHeader
          applicationId={app.id}
          audience={isInternal ? 'internal' : 'external'}
          caseModel={caseModel}
        />

        {isOwner && <LicenseStatusBanner />}
        {isInternal && <DecisionGatesBanner applicationId={app.id} />}


        <ReinstatedAfterAppealBanner applicationId={app.id} status={app.status} />

        {app.status === 'rejected' && (
          <LicenseAppealPanel
            applicationId={app.id}
            applicationNumber={app.application_number}
            rejectedAt={(app as any).rejected_at || (app as any).updated_at}
            regulatorId={(app as any).regulator_id ?? null}
            canLodge={isOwner}
          />
        )}

        {/* F4-B2 — governed applicant withdrawal (withdraw_application RPC only).
            The component hides itself unless the signed-in user owns the
            application and the server-held status is non-terminal. */}
        <ApplicationWithdrawalPanel
          applicationId={app.id}
          applicationNumber={app.application_number}
          status={app.status}
          applicantId={app.applicant_id}
          entityId={(app as any).entity_id ?? null}
          applicationData={appData as Record<string, unknown>}
          onWithdrawn={() => loadData()}
        />

        {/* F5-B4 — fit & proper linkage. The RPC decides the audience: regulator
            staff see linkage detail, entity users only a safe state. */}
        <ApplicationFitAndProperPanel applicationId={app.id} />






        {/* Simple Progress Bar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Application Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline currentStatus={app.status} events={events} showActivityLog={false} />
          </CardContent>
        </Card>


        <div className="w-full">
          <div className="space-y-6">
            {/* Forms and Documents tabs - always visible */}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="details" className={TAB_TRIGGER_CLASS}>Details</TabsTrigger>
                {hasSubmittedForms && <TabsTrigger value="form" className={TAB_TRIGGER_CLASS}>Submitted Forms</TabsTrigger>}
                <TabsTrigger value="documents" className={TAB_TRIGGER_CLASS}>Documents</TabsTrigger>
                <TabsTrigger value="fees" className={TAB_TRIGGER_CLASS}>{isInternal ? 'Fees' : 'Payment'}</TabsTrigger>
                {showWorkflowTab && <TabsTrigger value="workflow" className={TAB_TRIGGER_CLASS}>Current Step</TabsTrigger>}
                <TabsTrigger value="activity" className={TAB_TRIGGER_CLASS}>Activity</TabsTrigger>
                <TabsTrigger value="rfi" className={`gap-1.5 ${TAB_TRIGGER_CLASS}`}>

                  RFI
                  {openRfiCount > 0 && (
                    <Badge variant="destructive" className="h-4 min-w-[1rem] px-1 text-[10px] leading-none">
                      {openRfiCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="communications" className={TAB_TRIGGER_CLASS}>Communications</TabsTrigger>
                {isInternal && app.status !== 'draft' && <TabsTrigger value="decision" className={TAB_TRIGGER_CLASS}>Decision</TabsTrigger>}
                {isInternal && <TabsTrigger value="consolidated" className={TAB_TRIGGER_CLASS}>Consolidated Case</TabsTrigger>}
                {app.status === 'approved' && <TabsTrigger value="conditions" className={TAB_TRIGGER_CLASS}>Conditions</TabsTrigger>}
                {showRequestEditTab && <TabsTrigger value="request-edit" className={TAB_TRIGGER_CLASS}>Request Edit</TabsTrigger>}


              </TabsList>



              <TabsContent value="details" className="space-y-4 mt-4">
                {activeTab === 'details' && !isInternal && (
                  <SubmissionAcknowledgementPanel
                    applicationId={app.id}
                    submitted={!!(app as any).submitted_at}
                    variant="applicant"
                    applicationNumber={app.application_number}
                    highlight={justSubmitted}
                  />
                )}
                {activeTab === 'details' && (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Application Number</p>
                          <p className="font-mono font-medium">{app.application_number}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">License Type</p>
                          <p className="font-medium">{formatTaxonomyLabel(app.license_type)}</p>
                        </div>
                        {taxonomyEditable ? (
                          <div className="col-span-2 space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">Sector Selection</p>
                              {savingTaxonomy && (
                                <span className="flex items-center text-xs text-muted-foreground">
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving…
                                </span>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="app-sector">Sector *</Label>
                              <Select value={taxSector} onValueChange={handleTaxSectorChange}>
                                <SelectTrigger id="app-sector">
                                  <SelectValue placeholder="Select Sector" />
                                </SelectTrigger>
                                <SelectContent position="popper" side="bottom" align="start" sideOffset={4} className="z-[9999] max-h-[300px] overflow-y-auto bg-popover">
                                  {(allSectorsList as any[])
                                    .filter((s: any) => s.status === 'active')
                                    .map((s: any) => (
                                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="app-subsector">Sub-Sector *</Label>
                              <Select value={taxSubSector} onValueChange={handleTaxSubSectorChange} disabled={!taxSector}>
                                <SelectTrigger id="app-subsector">
                                  <SelectValue placeholder={taxSector ? 'Select Sub-Sector' : 'Select a sector first'} />
                                </SelectTrigger>
                                <SelectContent position="popper" side="bottom" align="start" sideOffset={4} className="z-[9999] max-h-[300px] overflow-y-auto bg-popover">
                                  {filteredTaxSubSectors.map((s: any) => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="app-category">Category *</Label>
                              <Select value={taxCategory} onValueChange={handleTaxCategoryChange} disabled={!taxSubSector}>
                                <SelectTrigger id="app-category">
                                  <SelectValue placeholder={taxSubSector ? 'Select Category' : 'Select a sub-sector first'} />
                                </SelectTrigger>
                                <SelectContent position="popper" side="bottom" align="start" sideOffset={4} className="z-[9999] max-h-[300px] overflow-y-auto bg-popover">
                                  {filteredTaxCategories.map((c: any) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : (
                          <>
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
                          </>
                        )}


                        {isInternal && <CaseSnapshotFields application={app as any} />}
                        {isInternal && <ApplicantLicenseeIdentity application={app as any} />}


                        <div>
                          <p className="text-sm text-muted-foreground">Created</p>
                          <p className="text-sm">{formatDateTime(app.created_at)}</p>
                        </div>
                        {app.submitted_at && (
                          <div>
                            <p className="text-sm text-muted-foreground">Submitted</p>
                            <p className="text-sm">{formatDateTime(app.submitted_at)}</p>
                          </div>
                        )}
                        {app.approved_at && (
                          <div>
                            <p className="text-sm text-muted-foreground">Approved</p>
                            <p className="text-sm">{formatDateTime(app.approved_at)}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {hasSubmittedForms && (
                <TabsContent value="form" className="mt-4">
                  {activeTab === 'form' && (
                    <>
                      {hasRenewalDiff && (
                        <div className="mb-3 rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 px-3 py-2 text-xs text-yellow-900 dark:text-yellow-200">
                          Yellow fields indicate changes made compared to the original approved application.
                        </div>
                      )}
                      {isRenewalApplication && legacyRenewalFallback && (
                        <div className="mb-3 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                          Original approved application could not be located. This renewal is using the standard renewal form.
                        </div>
                      )}
                    <SubmittedForms
                      formTemplateIds={formTemplateIds}
                      formsData={formsData}
                      formVersionIds={formVersionIds}
                      originalFormsData={hasRenewalDiff ? originalFormsData : undefined}
                      formMeta={(appData.form_meta as Record<string, { saved_at?: string | null; submitted_at?: string | null; updated_at?: string | null; created_at?: string | null }>) || {}}
                      applicationStatus={app.status}
                      editable={!forceReadOnlyView && isOwner && (app.status === 'draft' || app.status === 'in_progress' || app.status === 'resubmission_requested' || app.status === 'query_raised' || app.status === 'info_requested')}
                      onSave={async (templateId, data, versionId) => {
                        const updatedFormsData = { ...formsData, [templateId]: data };
                        const updatedFormVersionIds = versionId
                          ? { ...formVersionIds, [templateId]: versionId }
                          : formVersionIds;
                        const now = new Date().toISOString();
                        const prevMeta = (appData.form_meta as Record<string, { saved_at?: string | null; submitted_at?: string | null; updated_at?: string | null; created_at?: string | null }>) || {};
                        const updatedFormMeta = {
                          ...prevMeta,
                          [templateId]: {
                            ...(prevMeta[templateId] || {}),
                            saved_at: now,
                            updated_at: now,
                            created_at: prevMeta[templateId]?.created_at || now,
                          },
                        };
                        const updatedAppData = {
                          ...appData,
                          forms_data: updatedFormsData,
                          form_version_ids: updatedFormVersionIds,
                          form_meta: updatedFormMeta,
                        };
                        try {
                          await applicationDraftSave({ applicationId: app.id, data: updatedAppData as any });
                        } catch (error: any) {
                          toast.error(error?.message || 'Failed to save form');
                          throw new Error(error?.message || 'Failed to save form');
                        }
                        const written = [{ id: app.id }];
                        if (!written || written.length === 0) {
                          const msg = 'This application is not currently open for editing — your changes were not saved.';
                          toast.error(msg);
                          throw new Error(msg);
                        }

                        try {
                          const nextStatus = await markApplicationInProgressIfDraft(app.id);
                          if (nextStatus) {
                            setApp((prev) => (prev ? { ...prev, status: normalizeApplicationStatus(nextStatus) as ApplicationStatus } : prev));
                          }
                          await Promise.all([
                            queryClient.invalidateQueries({ queryKey: ['pre-licensee-applications'] }),
                            queryClient.invalidateQueries({ queryKey: ['applications'] }),
                          ]);
                        } catch (statusError: any) {
                          console.error('[ApplicationDetail] Failed to promote draft application after form save:', statusError);
                          toast.error(statusError?.message || 'Form saved, but failed to update application status');
                        }
                        toast.success('Form saved');
                        await loadData();

                      }}
                      onAllFormsCompleted={() => {
                        // Auto-advance to next pending step after all forms are filled
                        const next = !paymentComplete ? 'fees' : 'documents';
                        toast.success('All forms saved — continue with the next step');
                        setActiveTab(next);
                      }}
                    />
                    </>
                  )}
                </TabsContent>
              )}

              <TabsContent value="documents" className="mt-4">
                {activeTab === 'documents' && (
                  <Card>
                    {isOwner && app.status !== 'approved' && app.status !== 'rejected' && app.status !== 'cancelled' && (
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          Upload Supporting Documents
                        </CardTitle>
                      </CardHeader>
                    )}
                    <CardContent className="pt-6 space-y-6">
                      {!forceReadOnlyView && isOwner && app.status !== 'approved' && app.status !== 'rejected' && app.status !== 'cancelled' && (
                        <>
                          <DocumentUpload
                            entityType="application"
                            entityId={app.id}
                            onUploaded={() => setDocRefresh(p => p + 1)}
                          />
                          {user?.id && (
                            <BatchDocumentUpload
                              entityType="application"
                              entityId={app.id}
                              userId={user.id}
                              helperText="Queue multiple files, tag each with a document type, and upload in one go."
                              onUploaded={() => setDocRefresh(p => p + 1)}
                            />
                          )}
                        </>
                      )}
                      {/* Submission acknowledgement is an applicant/licensee receipt only.
                          Internal reviewers no longer see it here (component retained). */}
                      {!isInternal && !!(app as any).submitted_at && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">System-generated artifacts</p>
                          <SubmissionAcknowledgementPanel
                            applicationId={app.id}
                            submitted={!!(app as any).submitted_at}
                            variant="artifact"
                            applicationNumber={app.application_number}
                          />
                        </div>
                      )}
                      <div className="space-y-4">
                        <ApplicationDocumentsPanel
                          applicationId={app.id}
                          formsData={formsData}
                          refreshKey={docRefresh}
                        />
                      </div>

                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {showRequestEditTab && (
                <TabsContent value="request-edit" className="mt-4">
                  {activeTab === 'request-edit' && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          {hasPendingEditRequest ? (
                            <>
                              <Clock className="h-4 w-4 text-warning" />
                              Edit Request Pending
                            </>
                          ) : (
                            <>
                              <Edit className="h-4 w-4 text-primary" />
                              Request to Edit Application
                            </>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {hasPendingEditRequest ? (
                          <p className="text-sm text-muted-foreground">
                            Your request to edit this application is awaiting administrator review. You'll be
                            notified once it's approved or denied.
                          </p>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Label className="text-sm">Reason for edit request</Label>
                              <Textarea
                                value={actionComment}
                                onChange={e => setActionComment(e.target.value)}
                                placeholder="Explain why you need to edit your application..."
                                rows={4}
                              />
                            </div>
                            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
                              <GuardedButton module="application_management" action="edit" data-rbac="application_management.edit"
                                variant="destructive"
                                onClick={handleCancel}
                                disabled={processing}
                                className="w-full sm:w-auto"
                              >
                                <Ban className="h-4 w-4 mr-2" />Cancel Application
                              </GuardedButton>
                              <Button
                                data-rbac="application_management.edit"
                                variant="outline"
                                onClick={handleRequestEdit}
                                disabled={processing}
                                className="w-full sm:w-auto"
                              >
                                <Edit className="h-4 w-4 mr-2" />Request Edit
                              </Button>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              )}



              <TabsContent value="fees" className="mt-4 space-y-4">
                {activeTab === 'fees' && (isInternal ? (
                  <>
                    <ViewPaymentButton applicationId={app.id} />
                    <FeeComponentsPanel
                      applicationId={app.id}
                      editable={!forceReadOnlyView && isOwner && (app.status === 'draft' || app.status === 'in_progress' || app.status === 'resubmission_requested' || app.status === 'query_raised' || app.status === 'info_requested')}
                    />
                  </>
                ) : (
                  <LicenseePaymentPanel
                    applicationId={app.id}
                    canPay={!forceReadOnlyView && isOwner && (app.status === 'draft' || app.status === 'in_progress' || app.status === 'resubmission_requested' || app.status === 'query_raised' || app.status === 'info_requested')}
                    onPaid={loadData}
                  />
                ))}
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                {activeTab === 'activity' && <ActivityTab applicationId={app.id} />}
              </TabsContent>

              <TabsContent value="rfi" className="mt-4">
                {activeTab === 'rfi' && user && (
                  <ApplicationRfiTab
                    applicationId={app.id}
                    currentUserId={user.id}
                    isInternal={isInternal}
                    isApplicant={user.id === app.applicant_id}
                    workflowTypeKey={(app as any).license_type ?? null}
                    sectorId={(app as any).sector_id ?? null}
                    formData={(app as any).data ?? null}
                  />
                )}
              </TabsContent>

              <TabsContent value="communications" className="mt-4 space-y-4">
                <CommunicationTimeline objectType="application" objectId={app.id} title="Outbound communications" />
                {activeTab === 'communications' && (

                  <CaseThreadsPanel
                    sourceType="application"
                    sourceId={app.id}
                    sourceReference={(app as any).application_number ?? null}
                    licenseeId={(app as any).licensee_id ?? null}
                    title="Case communications"
                  />
                )}
              </TabsContent>

              {isInternal && app.status !== 'draft' && (
                <TabsContent value="decision" className="mt-4">
                  {activeTab === 'decision' && (
                    <ApproverDecisionView
                      application={app as any}
                      events={events}
                      templateNames={templateNames}
                      paymentComplete={paymentComplete}
                      applicantName={
                        (app as any).applicant_name ||
                        (app as any).data?.applicant_name ||
                        (app as any).data?.entity_name ||
                        (app as any).data?.full_name ||
                        (app as any).data?.company_name ||
                        ''
                      }
                      currentUserId={user?.id ?? null}
                      onJumpToFormsTab={() => setActiveTab('form')}
                    />
                  )}
                </TabsContent>
              )}

              {isInternal && (

                <TabsContent value="consolidated" className="mt-4">
                  {activeTab === 'consolidated' && (
                    <ConsolidatedCaseTab applicationId={app.id} applicantId={app.applicant_id} />
                  )}
                </TabsContent>
              )}

              {app.status === 'approved' && (
                <TabsContent value="conditions" className="mt-4">
                  {activeTab === 'conditions' && (
                    <ApplicationConditionsTab
                      applicationId={app.id}
                      applicationStatus={app.status}
                      isInternal={isInternal}
                    />
                  )}
                </TabsContent>
              )}
            </Tabs>

            {/* EPR-05 — Current Step is the sole lifecycle controller for licensing */}
            {activeTab === 'workflow' && (
              <ApplicationCurrentStepSummary
                applicationId={app.id}
                audience={isInternal ? 'internal' : 'external'}
                caseModel={caseModel}
              />
            )}




            {/* Admin: Edit Request Pending — bypasses workflow (Workflow tab only) */}
            {activeTab === 'workflow' && showEditRequestAdminPanel && (
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
                    <Button data-rbac="application_management.edit" onClick={handleAllowEdit} disabled={processing}>
                      {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Allow Edit
                    </Button>
                    <Button data-rbac="application_management.edit" variant="destructive" onClick={handleDenyEdit} disabled={processing}>
                      <XCircle className="h-4 w-4 mr-2" />Deny Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Decision support lives in the "Decision" tab; no duplicate promo card here. */}

            {/* Per-step SLA is rendered inside WorkflowPanel for the active step. */}

            {/* Workflow-based review panel — rendered only in the Workflow tab */}
            {activeTab === 'workflow' && showWorkflowPanel && (
              <WorkflowPanel
                applicationId={app.id}
                workflowId={app.workflow_id}
                workflowEnabled={workflowOn}
                applicationStatus={app.status}
                onStatusChange={loadData}
                applicationSubmittedAt={app.submitted_at}
                applicationCreatedAt={app.created_at}
              />
            )}

            {/* Collaborative Review — hidden behind COLLAB_REVIEW_ENABLED. */}
            {COLLAB_REVIEW_ENABLED && id && (
              <CollaborativeReview
                entityType="application"
                entityId={id}
                fields={[
                  { key: 'assessment_notes', label: 'Assessment notes', value: (app as any)?.assessment_notes ?? '' },
                  { key: 'decision_rationale', label: 'Decision rationale', value: (app as any)?.decision_rationale ?? '' },
                  { key: 'review_notes', label: 'Review notes', value: (app as any)?.review_notes ?? '' },
                ]}
              />
            )}


            {/* Manual staff actions (no workflow configured) */}
            {activeTab === 'workflow' && showManualActions && (
              <Card>
                <CardContent className="pt-6">
                  <Accordion type="single" collapsible defaultValue="manual-review-actions" className="w-full rounded-md border border-border/60">
                    <AccordionItem value="manual-review-actions" className="border-b-0">
                      <AccordionTrigger className="px-4 py-4 hover:no-underline">
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-foreground">Review Actions</div>
                            <p className="text-sm text-muted-foreground">Workflow is not active/configured for this application.</p>
                          </div>
                          <Badge variant={statusVariant[app.status] || 'outline'} className="shrink-0">
                            {APPLICATION_STATUS_LABELS[app.status]}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="space-y-4">
                          <p className="text-sm text-muted-foreground">
                            Approval workflow is not active for this request type. As an authorized reviewer, you can take direct action below.
                          </p>
                          <ConfigurableDecisionActions
                            applicationId={app.id}
                            processing={processing}
                            context={{
                              application_type: (app as any).application_type ?? null,
                              license_type: (app as any).license_type ?? null,
                              sector_id: (app as any).sector_id ?? null,
                              status: app.status,
                            }}
                            templateVars={{
                              application_number: app.application_number,
                              applicant_name: (app as any).applicant_name,
                              application_type: (app as any).application_type,
                              license_type: (app as any).license_type,
                            }}
                            onExecute={async ({ option, rationale, conditions }) => {
                              setActionComment(rationale);
                              const outcome = option.outcome;
                              if (outcome === 'approve' || outcome === 'conditional_approve') {
                                const remarks = conditions
                                  ? `${rationale}\n\nConditions:\n${conditions}`
                                  : rationale;
                                await handleStageTransition('approved', 'approved', remarks);
                              } else if (outcome === 'reject') {
                                await handleStageTransition('rejected', 'rejected', rationale);
                              } else if (outcome === 'return' || outcome === 'info_request') {
                                setActionComment(rationale);
                                await handleAdminRequestResubmission();
                              } else {
                                await applicationRecordAction({
                                  applicationId: app.id,
                                  action: outcome,
                                  comments: rationale || null,
                                  metadata: { decision_option_id: option.id, decision_option_code: option.code, conditions: conditions || null },
                                });
                                toast.success(`Recorded: ${option.label}`);
                                loadData();
                              }
                            }}
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            )}

            {/* Admin approve resubmission for resubmission_requested/query_raised apps (no workflow) */}
            {activeTab === 'workflow' && showResubmissionPendingNotice && (
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
            {isOwner && (app.status === 'draft' || app.status === 'in_progress') && (() => {
              const taxonomyComplete = !!(appData?.sector_id && appData?.sub_sector_id && appData?.category_id);
              const allFormsCompleted = formTemplateIds.length > 0 && formTemplateIds.every(tid => {
                const fd = formsData[tid];
                return fd && Object.keys(fd).length > 0;
              });
              const noTemplates = taxonomyComplete && formTemplateIds.length === 0;
              const needsForms = taxonomyComplete && formTemplateIds.length > 0 && !allFormsCompleted;
              const canSubmit = taxonomyComplete && allFormsCompleted && paymentComplete && !licenseGate.isBlocked;
              const filledCount = formTemplateIds.filter(tid => formsData[tid] && Object.keys(formsData[tid]).length > 0).length;
              return (
                <>
                  <div className="flex gap-2">
                    <Button data-rbac="application_management.create"
                      onClick={() => {
                        if (needsForms) {
                          setActiveTab('form');
                          setTimeout(() => {
                            document.querySelector('[data-state="active"][role="tabpanel"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 50);
                          return;
                        }
                        setShowReview(true);
                      }}
                      disabled={processing || !taxonomyComplete || noTemplates || licenseGate.isBlocked || (!needsForms && !canSubmit)}
                      className="flex-1"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {processing
                        ? 'Submitting...'
                        : !taxonomyComplete
                          ? 'Select sector, sub-sector and category'
                          : licenseGate.isBlocked
                            ? 'License Not Active'
                            : noTemplates
                              ? 'No forms configured for this selection'
                              : needsForms
                                ? `Complete all forms (${filledCount}/${formTemplateIds.length})`
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
                        originalFormsData={hasRenewalDiff ? originalFormsData : undefined}
                        mode="readonly"
                        loading={processing}
                        onAcknowledge={async () => { setShowReview(false); await handleSubmit(); }}
                      />
                    </DialogContent>
                  </Dialog>
                </>
              );
            })()}
            {/* Request Edit now lives in its own applicant tab (see "Request Edit"). */}

          </div>

          {/* Activity trail lives solely in the "Activity" tab above. */}

        </div>

        {/* CollaborativeReview moved into the review column next to WorkflowPanel. */}
      </div>
    </DashboardLayout>
  );
}

function ViewPaymentButton({ applicationId }: { applicationId: string }) {
  const { user } = useAuth();
  const portalContext = useEffectivePortalContext();
  const isInternal = !!user && !portalContext.loading && portalContext.isInternal;
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
        isAdminView={isInternal}
        onVerified={() => setOpen(false)}
      />
    </div>
  );
}
