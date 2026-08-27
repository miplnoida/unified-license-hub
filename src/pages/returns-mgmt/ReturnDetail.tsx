import { COLLAB_REVIEW_ENABLED } from '@/lib/featureFlags';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LegacyReturnsNotice } from '@/components/returns/LegacyReturnsNotice';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useReturnById,
  useReturnConfigForms,
  useReturnFormData,
  useReturnRequests,
  useReturnComments,
  useReturnAuditLog,
  useReturnEditRequests,
  useDecideReturnEditRequest,
} from '@/hooks/useReturnsManagement';
import { useLatestPublishedVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { StatusBadge } from '@/pages/entity/returns/EntityReturnsDashboard';
import { Loader2, CheckCircle, AlertTriangle, FileText, Shield, ArrowLeft, MessageSquare, History } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { resolveReturnWorkflow } from '@/lib/returnWorkflowResolver';
import { humanizeReviewError } from '@/lib/reviewErrors';
import { useWorkflowTotalSla } from '@/hooks/useWorkflowTotalSla';
import { TotalSlaBadge } from '@/components/workflows/TotalSlaBadge';
import { ReturnWorkflowPanel } from '@/components/returns/ReturnWorkflowPanel';
import { ReturnHistoryDrawer } from '@/components/audit/ReturnHistoryDrawer';
import { ReturnValidationAndRatiosPanel } from '@/components/returns/ReturnValidationAndRatiosPanel';
import { AccountingReconciliationPanel } from '@/components/returns/AccountingReconciliationPanel';
import { useWorkflowInstances } from '@/hooks/useWorkflowEngine';
import {
  logReturnActivity,
  logReturnApprovedLegacy,
  logEditRequestedLegacy,
  labelForReturnActivity,
} from '@/lib/returnActivityLogger';
import { useReturnRevisions, snapshotReturnRevision, pickEditBaseline } from '@/hooks/useReturnRevisions';
import { ReturnRevisionCompareDialog } from '@/components/returns/ReturnRevisionCompareDialog';
import { GitCompareArrows } from 'lucide-react';
import { CollaborativeReview } from '@/components/collab-review/CollaborativeReview';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { formatDateTime } from '@/lib/datetime';
import { legacyReturnReviewDecision } from '@/lib/supervisoryGovernedOps';


function formatCellValue(value: any): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/60">—</span>;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    return <span className="tabular-nums">{value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground/60">—</span>;
    return value
      .map((v) => (typeof v === 'object' && v !== null ? (v.name || v.label || v.fileName || JSON.stringify(v)) : String(v)))
      .join(', ');
  }
  if (typeof value === 'object') {
    // File-ish object
    const anyV = value as any;
    if (anyV.url || anyV.publicUrl || anyV.file_url) {
      const href = anyV.url || anyV.publicUrl || anyV.file_url;
      const name = anyV.name || anyV.fileName || anyV.file_name || 'View file';
      return <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">{name}</a>;
    }
    if (anyV.name || anyV.fileName) return String(anyV.name || anyV.fileName);
    return <code className="text-xs">{JSON.stringify(value)}</code>;
  }
  // Numeric-looking string
  const s = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return <span className="tabular-nums">{n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
  }
  return s;
}

function ReturnDataTable({
  formId,
  name,
  data,
  baseline,
  pinnedVersionId,
}: {
  formId: string;
  name: string;
  data: Record<string, any>;
  baseline?: Record<string, any> | null;
  pinnedVersionId?: string | null;
}) {
  const { data: latestVersion, isLoading: vLoading } = useLatestPublishedVersion(formId);
  const effectiveVersionId = pinnedVersionId || latestVersion?.id || null;
  const { data: sections = [], isLoading: sLoading } = useVersionSections(effectiveVersionId);
  const loading = vLoading || sLoading;

  const SKIP: Record<string, true> = { heading: true, paragraph: true };

  const isChanged = (fieldName: string): boolean => {
    if (!baseline) return false;
    const a = data?.[fieldName];
    const b = baseline?.[fieldName];
    const norm = (v: any) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
    return norm(a) !== norm(b);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <FileText className="h-4 w-4 text-primary" />
          <span>{name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading form...</div>
        ) : sections.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">No fields defined for this form.</p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px] py-2 px-2">#</TableHead>
                  <TableHead className="py-2 px-2">Label</TableHead>
                  <TableHead className="w-[35%] py-2 px-2 text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sections.map((section: any) => {
                  const fields = (section.fields || []).filter((f: any) => !SKIP[f.type]);
                  return (
                    <React.Fragment key={`sec-frag-${section.id}`}>
                      {section.title && (
                        <TableRow key={`sec-${section.id}`} className="bg-muted/40">
                          <TableCell colSpan={3} className="font-semibold text-xs py-2 px-2">
                            {section.title}
                          </TableCell>
                        </TableRow>
                      )}
                      {fields.length === 0 ? (
                        <TableRow key={`sec-${section.id}-empty`}>
                          <TableCell colSpan={3} className="text-[11px] text-muted-foreground italic py-2 px-2">
                            No data fields in this section.
                          </TableCell>
                        </TableRow>
                      ) : (
                        fields.map((f: any) => {
                          const changed = isChanged(f.fieldName);
                          return (
                            <TableRow key={f.id} className={changed ? 'bg-yellow-50 dark:bg-yellow-950/30' : undefined}>
                              <TableCell className="font-mono text-[11px] text-muted-foreground align-top py-1 px-2">
                                {f.lineCode || ''}
                              </TableCell>
                              <TableCell className="text-xs align-top py-1 px-2">
                                {f.label}
                                {changed && (
                                  <Badge variant="outline" className="ml-2 text-[9px] bg-yellow-100 text-yellow-800 border-yellow-300">edited</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs align-top py-1 px-2 text-right">
                                {formatCellValue(data?.[f.fieldName])}
                                {changed && baseline && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5 line-through">
                                    was {formatCellValue(baseline?.[f.fieldName])}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}



export default function ReturnDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const adminBasePath = window.location.pathname.startsWith('/admin/returns/') ? '/admin/returns/queue' : '/returns-management';
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: returnData, isLoading } = useReturnById(id);
  const { data: configForms = [] } = useReturnConfigForms(returnData?.return_configuration_id);
  const { data: fallbackConfigForms = [] } = useQuery({
    queryKey: [
      'fallback_return_forms_admin',
      returnData?.return_configuration_id,
      returnData?.return_configs?.sector_id,
      returnData?.return_configs?.subsector_id,
      returnData?.return_configs?.return_type_id,
    ],
    enabled: !!returnData?.return_configuration_id && configForms.length === 0,
    queryFn: async () => {
      const config = returnData?.return_configs;
      if (!config) return [];
      const { data, error } = await supabase
        .from('form_templates')
        .select('id, name, description, status, form_type, tab_name, form_order, sector_id, sub_sector_id, return_type_id, created_at')
        .eq('status', 'published')
        .eq('form_type', 'returns')
        .order('form_order', { ascending: true });
      if (error) throw error;
      const scoped = (data || []).filter((t: any) => {
        const sectorOk = !t.sector_id || (config.sector_id && t.sector_id === config.sector_id);
        const subOk = !t.sub_sector_id || (config.subsector_id && t.sub_sector_id === config.subsector_id);
        const rtOk = !t.return_type_id || (config.return_type_id && t.return_type_id === config.return_type_id);
        return sectorOk && subOk && rtOk;
      });
      return scoped.map((t: any, i: number) => ({
        id: `fallback-${t.id}`,
        form_id: t.id,
        return_configuration_id: returnData!.return_configuration_id,
        tab_name: (t.tab_name || t.name || 'General').trim() || 'General',
        display_order: t.form_order ?? i,
        status: 'active',
        form_templates: { id: t.id, name: t.name, description: t.description, status: t.status },
      }));
    },
  });
  const { data: formData = [] } = useReturnFormData(id);
  const { data: requests = [] } = useReturnRequests(id);
  const { data: editRequests = [] } = useReturnEditRequests(id);
  const decideEditRequest = useDecideReturnEditRequest();
  const pendingEditReq = editRequests.find((r: any) => r.status === 'pending');
  const [editDecisionComment, setEditDecisionComment] = useState('');
  const { data: comments = [] } = useReturnComments(id);
  const { data: auditLog = [] } = useReturnAuditLog(id);
  const { data: revisions = [], isLoading: revisionsLoading, error: revisionsError } = useReturnRevisions(id);
  const editBaselineRev = pickEditBaseline(revisions);
  const [compareOpen, setCompareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);



  const submittedFormIds = useMemo(
    () => [...new Set(formData.map((row: any) => row.form_id).filter(Boolean))],
    [formData],
  );
  const { data: submittedFormTemplates = [] } = useQuery({
    queryKey: ['submitted_return_templates_admin', submittedFormIds.slice().sort().join(',')],
    enabled: submittedFormIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_templates')
        .select('id, name, description, tab_name, form_order, created_at')
        .in('id', submittedFormIds);
      if (error) throw error;
      return data || [];
    },
  });
  const templateById = submittedFormTemplates.reduce<Record<string, any>>((acc, t: any) => { acc[t.id] = t; return acc; }, {});
  const submittedConfigForms = submittedFormIds.map((formId, i) => {
    const t = templateById[formId];
    return {
      id: `submitted-${formId}`,
      form_id: formId,
      return_configuration_id: returnData?.return_configuration_id,
      tab_name: (t?.tab_name || t?.name || 'Submitted Forms').trim() || 'Submitted Forms',
      display_order: t?.form_order ?? i,
      status: 'active',
      form_templates: { id: formId, name: t?.name || `Form ${i + 1}`, description: t?.description || null, status: 'submitted' },
    };
  });

  const mergedFormsMap = new Map<string, any>();
  [...configForms, ...fallbackConfigForms, ...submittedConfigForms].forEach((f: any) => {
    if (f?.form_id && !mergedFormsMap.has(f.form_id)) mergedFormsMap.set(f.form_id, f);
  });
  const effectiveConfigForms = Array.from(mergedFormsMap.values());

  const valuesByForm: Record<string, Record<string, any>> = {};
  const versionByForm: Record<string, string | null> = {};
  formData.forEach((d: any) => {
    if (!valuesByForm[d.form_id]) valuesByForm[d.form_id] = {};
    const key = d.field_name || d.field_id;
    let val: any = d.field_value ?? '';
    if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
      try { val = JSON.parse(val); } catch { /* keep */ }
    }
    valuesByForm[d.form_id][key] = val;
    if (d.form_version_id) versionByForm[d.form_id] = d.form_version_id;
  });
  const hasCurrentReturnValues = Object.values(valuesByForm).some((fields) => Object.keys(fields || {}).length > 0);
  const canCompareVersions = revisions.length >= 2 || (revisions.length >= 1 && hasCurrentReturnValues);
  const compareVersionsTitle = revisionsError
    ? 'Unable to load saved return versions. Please refresh and try again.'
    : revisionsLoading
      ? 'Loading saved return versions'
      : canCompareVersions
        ? 'Compare submission revisions'
        : 'At least one saved revision and current return data are required to compare';

  useEffect(() => {
    if (!revisionsError) return;
    toast.error(`Could not load return versions: ${(revisionsError as any)?.message || 'Access denied or network error'}`);
  }, [revisionsError]);

  const orderedForms = [...effectiveConfigForms].sort(
    (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );
  const tabs = orderedForms.map((f: any) => f.form_id as string);
  const [activeTab, setActiveTab] = useState('');
  useEffect(() => {
    if (tabs.length === 0) { if (activeTab) setActiveTab(''); return; }
    if (!activeTab || !tabs.includes(activeTab)) setActiveTab(tabs[0]);
  }, [activeTab, tabs]);

  // ───── Workflow action state ─────
  const [comments_, setComments] = useState('');
  const [submitting, setSubmitting] = useState<null | 'approve' | 'request_edit'>(null);

  const status = returnData?.workflow_status as string | undefined;
  const normalizedStatus = String(status || '').toUpperCase();
  const isReviewable = normalizedStatus === 'SUB';
  const isApproved = normalizedStatus === 'VAL';
  const isResubmissionRequested = normalizedStatus === 'TBR';
  const activeRequest = requests.find((r: any) => r.status === 'active');

  // Configurable workflow resolution — if a return-scoped approval_workflow
  // exists, we drive the UI through the same shared engine the application
  // approval flow uses. Otherwise we fall back to the legacy SUB→VAL/TBR
  // buttons so existing deployments continue to work.
  const { data: workflowResolution } = useQuery({
    queryKey: ['return-workflow-resolution', returnData?.id, returnData?.sector_id, returnData?.subsector_id, returnData?.return_configuration_id],
    enabled: !!returnData?.id,
    queryFn: () => resolveReturnWorkflow({
      return: {
        id: returnData!.id,
        sector_id: returnData!.sector_id,
        subsector_id: returnData!.subsector_id,
        return_configuration_id: returnData!.return_configuration_id,
        workflow_id: (returnData as any)?.workflow_id ?? null,
      },
    }),
    staleTime: 60_000,
  });
  const workflowEnabled = !!workflowResolution?.enabled;
  const matchedWorkflowId = workflowResolution?.matchedWorkflowId || (returnData as any)?.workflow_id || null;

  // Approval-action history (workflow-driven). Joined to profiles for display.
  const { data: approvalActions = [] } = useQuery({
    queryKey: ['approval_actions', 'return', returnData?.id],
    enabled: !!returnData?.id && workflowEnabled,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('approval_actions')
        .select('id, action_type, comments, created_at, actor_id')
        .eq('entity_type', 'return')
        .eq('entity_id', returnData!.id)
        .order('created_at', { ascending: false });
      return (data as any[]) || [];
    },
  });
  const { data: workflowInstances = [] } = useWorkflowInstances('return', returnData?.id);
  const hasActiveInstance = workflowInstances.some((i: any) => i.status === 'active' || i.status === 'paused');

  // Auto-start the workflow instance for a submitted return when one doesn't
  // exist yet. Idempotent — the RPC resumes any existing instance.
  useEffect(() => {
    if (!returnData?.id) return;
    if (!workflowEnabled) return;
    if (!isReviewable) return;
    if (hasActiveInstance) return;
    let cancelled = false;
    (async () => {
      const { error } = await (supabase as any).rpc('start_return_workflow', { _return_id: returnData.id });
      if (!cancelled && !error) {
        qc.invalidateQueries({ queryKey: ['workflow_instances', 'return', returnData.id] });
        qc.invalidateQueries({ queryKey: ['returns_filed', returnData.id] });
      }
    })();
    return () => { cancelled = true; };
  }, [returnData?.id, workflowEnabled, isReviewable, hasActiveInstance, qc]);

  // Legacy audit helper retained for any one-off callers; new code should use
  // logReturnApprovedLegacy / logEditRequestedLegacy below.
  async function logAudit(action: string, prev: string, next: string, note: string) {
    await logReturnActivity({
      return_id: id!,
      action,
      previous_status: prev,
      new_status: next,
      comments: note,
      performed_by: user?.id ?? null,
      event_key: `return.${action}`,
      source: 'client:ReturnDetail',
    });
  }

  async function handleApprove() {
    if (!id || !isReviewable) return;
    const confirm = await Swal.fire({
      title: 'Approve return?',
      text: 'This will mark the return as validated. The licensee will be notified.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Approve',
      confirmButtonColor: '#16a34a',
    });
    if (!confirm.isConfirmed) return;
    setSubmitting('approve');
    try {
      await legacyReturnReviewDecision(id!, 'approve', comments_.trim() || null);
      await logReturnApprovedLegacy({
        return_id: id!,
        previous_status: status || '',
        comments: comments_ || 'Return validated by admin',
        performed_by: user?.id ?? null,
      });
      if (comments_.trim()) {
        await (supabase as any).from('return_comments').insert({
          return_id: id,
          comment_text: comments_.trim(),
          commented_by: user?.id,
        });
      }
      toast.success('Return approved');
      setComments('');
      qc.invalidateQueries({ queryKey: ['returns_filed'] });
      qc.invalidateQueries({ queryKey: ['returns_filed', id] });
      qc.invalidateQueries({ queryKey: ['my_returns'] });
      qc.invalidateQueries({ queryKey: ['licensee-metrics'] });
      qc.invalidateQueries({ queryKey: ['return_requests', id] });
      qc.invalidateQueries({ queryKey: ['return_audit_log', id] });
      qc.invalidateQueries({ queryKey: ['return_data_revisions', id] });
      qc.invalidateQueries({ queryKey: ['return_comments', id] });
      if (comments_.trim()) {
        supabase.functions.invoke('dispatch-notification-event', {
          body: {
            event_key: 'return.comment_added',
            entity_type: 'return',
            entity_id: id,
            payload: {
              return_id: id,
              actor_id: user?.id,
              actor_name: user?.email,
              actor_email: user?.email,
              action_comments: comments_.trim(),
              comments: comments_.trim(),
              actor_excluded: true,
            },
          },
        }).catch(() => {});
      }
      supabase.functions.invoke('dispatch-notification-event', {
        body: {
          event_key: 'return.approved',
          entity_type: 'return',
          entity_id: id,
          payload: {
            return_id: id,
            unique_id: returnData?.unique_id,
            actor_id: user?.id,
            actor_name: user?.email,
            actor_email: user?.email,
            reviewer_name: user?.email,
            reviewer_email: user?.email,
            comments: comments_,
            action_comments: comments_,
            previous_status: status,
            new_status: 'VAL',
            validated_by: user?.id,
            validated_at: new Date().toISOString(),
            approved_at: new Date().toISOString(),
            cta_label: 'View Approved Return',
          },
        },
      }).catch(() => {});
    } catch (e: any) {
      toast.error(humanizeReviewError(e) || 'Failed to approve');
    } finally { setSubmitting(null); }
  }

  async function handleRequestEdit() {
    if (!id || !isReviewable) return;
    if (!comments_.trim()) {
      toast.error('Please provide the reason for requesting an edit.');
      return;
    }
    const confirm = await Swal.fire({
      title: 'Request edit from licensee?',
      text: 'The return will be reopened for the licensee to edit and resubmit.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Request edit',
      confirmButtonColor: '#d97706',
    });
    if (!confirm.isConfirmed) return;
    setSubmitting('request_edit');
    try {
      const { error: gateErr } = await supabase.rpc('reject_return', {
        _return_id: id,
        _reason: comments_.trim(),
      });
      if (gateErr) {
        toast.error(gateErr.message || 'Reject gate failed');
        setSubmitting(null);
        return;
      }

      // Snapshot the current state as the pre-edit baseline before flipping status.
      await snapshotReturnRevision({
        returnId: id,
        reason: 'edit_requested',
        previousStatus: status || null,
        newStatus: 'TBR',
      });
      const { error: rErr } = await (supabase as any).from('return_requests').insert({
        return_id: id,
        reasons: comments_.trim(),
        status: 'active',
        requested_by: user?.id,
      });
      if (rErr) throw rErr;
      await legacyReturnReviewDecision(id!, 'request_edit', comments_.trim());
      await (supabase as any).from('return_comments').insert({
        return_id: id,
        comment_text: comments_.trim(),
        commented_by: user?.id,
      });
      await logEditRequestedLegacy({
        return_id: id!,
        previous_status: status || '',
        comments: comments_.trim(),
        performed_by: user?.id ?? null,
      });
      toast.success('Edit request sent to licensee');
      setComments('');
      qc.invalidateQueries({ queryKey: ['returns_filed'] });
      qc.invalidateQueries({ queryKey: ['returns_filed', id] });
      qc.invalidateQueries({ queryKey: ['my_returns'] });
      qc.invalidateQueries({ queryKey: ['licensee-metrics'] });
      qc.invalidateQueries({ queryKey: ['return_requests', id] });
      qc.invalidateQueries({ queryKey: ['return_audit_log', id] });
      qc.invalidateQueries({ queryKey: ['return_data_revisions', id] });
      qc.invalidateQueries({ queryKey: ['return_comments', id] });
      supabase.functions.invoke('dispatch-notification-event', {
        body: {
          event_key: 'return.comment_added',
          entity_type: 'return',
          entity_id: id,
          payload: {
            return_id: id,
            actor_id: user?.id,
            actor_name: user?.email,
            actor_email: user?.email,
            action_comments: comments_.trim(),
            comments: comments_.trim(),
            actor_excluded: true,
          },
        },
      }).catch(() => {});
      supabase.functions.invoke('dispatch-notification-event', {
        body: {
          event_key: 'return.edit_requested',
          entity_type: 'return',
          entity_id: id,
          payload: {
            return_id: id,
            unique_id: returnData?.unique_id,
            actor_id: user?.id,
            actor_name: user?.email,
            actor_email: user?.email,
            reviewer_name: user?.email,
            reviewer_email: user?.email,
            comments: comments_.trim(),
            action_comments: comments_.trim(),
            reason: comments_.trim(),
            edit_reason: comments_.trim(),
            previous_status: status,
            new_status: 'TBR',
            cta_label: 'Edit Return',
          },
        },
      }).catch(() => {});
    } catch (e: any) {
      toast.error(humanizeReviewError(e) || 'Failed to request edit');
    } finally { setSubmitting(null); }
  }

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></DashboardLayout>;
  if (!returnData) return <DashboardLayout><p className="text-center py-20">Return not found</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <LegacyReturnsNotice />
        {/* Header */}

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(adminBasePath)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Returns
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} data-rbac="returns_management.view">
              <History className="h-4 w-4 mr-1" /> History
            </Button>
            <PermissionGate module="returns_management" action="view">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompareOpen(true)}
                disabled={revisionsLoading || !canCompareVersions}
                title={compareVersionsTitle}
                data-rbac="returns_management.view"
              >
                {revisionsLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <GitCompareArrows className="h-4 w-4 mr-1" />} Compare Versions
                {revisions.length > 0 && <Badge variant="outline" className="ml-2 text-[10px]">{revisions.length}</Badge>}
              </Button>
            </PermissionGate>
            <PermissionGate module="report_management" action="view">
              <Button variant="outline" size="sm" onClick={() => navigate(`${adminBasePath}/${id}/analysis`)} data-rbac="report_management.view">
                View Analysis
              </Button>
            </PermissionGate>
          </div>

        </div>
        <div className="bg-card border rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold">{returnData.unique_id}</h1>
              <p className="text-sm text-muted-foreground">{returnData.return_configs?.name}</p>
            </div>
            <StatusBadge status={returnData.workflow_status} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Entity</div>
              <div className="font-medium">
                {returnData.licensees?.name || returnData.on_behalf_of_licensees?.name || '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Return Year</div>
              <div className="font-medium">{returnData.return_year || '—'}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Return Period</div>
              <div className="font-medium">{returnData.return_period || '—'}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Return Type</div>
              <div className="font-medium">
                {returnData.return_configs?.return_types?.name || returnData.return_configs?.return_types?.code || '—'}
              </div>
            </div>
          </div>
          <ReturnTotalSlaRow returnId={returnData.id} />
        </div>

        {isApproved && (
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">This return has been validated and approved.</AlertDescription>
          </Alert>
        )}
        {isResubmissionRequested && activeRequest && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Edit requested:</strong> {activeRequest.reasons}
            </AlertDescription>
          </Alert>
        )}
        {editBaselineRev && !isResubmissionRequested && (
          <Alert className="border-yellow-400 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-700" />
            <AlertDescription className="text-yellow-900">
              This return was edited by the licensee after an edit request. Changed fields are highlighted in yellow below (baseline: revision v{editBaselineRev.revision_number}, {formatDateTime(editBaselineRev.created_at)}).
            </AlertDescription>
          </Alert>
        )}

        {pendingEditReq && (
          <Card className="border-amber-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-4 w-4" /> Licensee Edit Request Pending
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm">
                <div className="text-muted-foreground text-xs">Requested at {formatDateTime(pendingEditReq.requested_at)}</div>
                <div className="mt-1 whitespace-pre-wrap"><strong>Reason:</strong> {pendingEditReq.reason}</div>
              </div>
              <div>
                <Label htmlFor="edit-decision-comment" className="text-xs">Decision comment (optional for allow, recommended for deny)</Label>
                <Textarea
                  id="edit-decision-comment"
                  rows={3}
                  value={editDecisionComment}
                  onChange={(e) => setEditDecisionComment(e.target.value)}
                  placeholder="Add a note for the licensee..."
                  disabled={decideEditRequest.isPending}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <PermissionGate module="returns_management" action="approve">
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    disabled={decideEditRequest.isPending}
                    data-rbac="returns_management.approve"
                    onClick={async () => {
                      const confirm = await Swal.fire({
                        title: 'Allow licensee to edit?',
                        text: 'The return will be reopened for the licensee to correct and resubmit.',
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Allow Edit',
                        confirmButtonColor: '#16a34a',
                      });
                      if (!confirm.isConfirmed) return;
                      try {
                        await decideEditRequest.mutateAsync({ requestId: pendingEditReq.id, decision: 'allowed', comment: editDecisionComment, returnId: id! });
                        setEditDecisionComment('');
                      } catch { /* toast handled */ }
                    }}
                  >
                    {decideEditRequest.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Allow Edit
                  </Button>
                </PermissionGate>
                <PermissionGate module="returns_management" action="reject">
                  <Button
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    disabled={decideEditRequest.isPending}
                    data-rbac="returns_management.reject"
                    onClick={async () => {
                      if (!editDecisionComment.trim()) {
                        toast.error('Please provide a reason for denying the request.');
                        return;
                      }
                      const confirm = await Swal.fire({
                        title: 'Deny edit request?',
                        text: 'The licensee will be notified. The return status is unchanged.',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Deny Request',
                        confirmButtonColor: '#dc2626',
                      });
                      if (!confirm.isConfirmed) return;
                      try {
                        const { error: gateErr } = await supabase.rpc('reject_return', {
                          _return_id: id!,
                          _reason: editDecisionComment.trim(),
                        });
                        if (gateErr) { toast.error(gateErr.message || 'Reject gate failed'); return; }
                        await decideEditRequest.mutateAsync({ requestId: pendingEditReq.id, decision: 'denied', comment: editDecisionComment, returnId: id! });
                        setEditDecisionComment('');
                      } catch { /* toast handled */ }
                    }}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Deny Request
                  </Button>
                </PermissionGate>
              </div>

            </CardContent>
          </Card>
        )}



        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Forms */}
          <div className="lg:col-span-2 space-y-4">
            {tabs.length > 0 && (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="flex-wrap h-auto">
                  {orderedForms.map((cf: any) => (
                    <TabsTrigger key={cf.form_id} value={cf.form_id}>
                      {cf.form_templates?.name || cf.tab_name || 'Form'}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {orderedForms.map((cf: any) => {
                  const formComments = comments.filter((c: any) => c.form_id === cf.form_id);
                  return (
                    <TabsContent key={cf.form_id} value={cf.form_id} className="space-y-4">
                      <ReturnDataTable
                        formId={cf.form_id}
                        name={cf.form_templates?.name || 'Form'}
                        data={valuesByForm[cf.form_id] || {}}
                        baseline={editBaselineRev ? (editBaselineRev.snapshot?.[cf.form_id] || null) : null}
                        pinnedVersionId={versionByForm[cf.form_id] || null}
                      />
                      {formComments.length > 0 && (
                        <div className="border rounded-md p-3 space-y-2 bg-yellow-50/50">
                          <p className="text-xs font-semibold text-muted-foreground">Reviewer Comments</p>
                          {formComments.map((c: any) => <p key={c.id} className="text-sm">• {c.comment_text}</p>)}
                        </div>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}


            {workflowEnabled ? (
              <ReturnWorkflowPanel
                returnId={returnData.id}
                workflowId={matchedWorkflowId}
                workflowEnabled={workflowEnabled}
                returnStatus={returnData.workflow_status}
                returnSubmittedAt={(returnData as any).submit_date ?? null}
                returnCreatedAt={(returnData as any).created_at ?? null}
                onStatusChange={() => {
                  qc.invalidateQueries({ queryKey: ['returns_filed'] });
                  qc.invalidateQueries({ queryKey: ['returns_filed', id] });
                  qc.invalidateQueries({ queryKey: ['return_requests', id] });
                  qc.invalidateQueries({ queryKey: ['return_audit_log', id] });
      qc.invalidateQueries({ queryKey: ['return_data_revisions', id] });
                  qc.invalidateQueries({ queryKey: ['approval_actions', 'return', id] });
                }}
              />

            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> Approval Workflow
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isReviewable ? (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="action-comments" className="text-xs">
                          Comments / Reason (required for Request Edit)
                        </Label>
                        <Textarea id="action-comments" rows={4}
                          placeholder="Add a note for the licensee..."
                          value={comments_} onChange={(e) => setComments(e.target.value)}
                          disabled={!!submitting} />
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <PermissionGate module="returns_management" action="approve">
                          <Button onClick={handleApprove} disabled={!!submitting}
                            data-rbac="returns_management.approve"
                            className="bg-green-600 hover:bg-green-700">
                            {submitting === 'approve'
                              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              : <CheckCircle className="h-4 w-4 mr-2" />}
                            Approve Return
                          </Button>
                        </PermissionGate>
                        <PermissionGate module="returns_management" action="workflow_action">
                          <Button variant="outline" onClick={handleRequestEdit} disabled={!!submitting}
                            data-rbac="returns_management.workflow_action"
                            className="border-amber-500 text-amber-700 hover:bg-amber-50">
                            {submitting === 'request_edit'
                              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              : <AlertTriangle className="h-4 w-4 mr-2" />}
                            Request Edit
                          </Button>
                        </PermissionGate>
                      </div>

                    </div>
                  ) : isApproved ? (
                    <Alert className="border-green-500 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-xs text-green-800">
                        No further actions required. Return is approved.
                      </AlertDescription>
                    </Alert>
                  ) : isResubmissionRequested ? (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Waiting for licensee to edit and resubmit the return.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      No actions available for status: {status}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right-side status + validation sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Status</span>
                  <StatusBadge status={returnData.workflow_status} />
                </div>
                {workflowEnabled && (
                  <p className="text-[11px] text-muted-foreground">
                    Configurable approval workflow is active for this return.
                  </p>
                )}
              </CardContent>
            </Card>

            <ReturnValidationAndRatiosPanel
              returnId={returnData.id}
              returnConfigId={returnData.return_configuration_id}
              formData={valuesByForm}
              hideValidation
            />

            <AccountingReconciliationPanel
              allData={valuesByForm}
              forms={orderedForms.map((cf: any) => ({
                formId: cf.form_id,
                templateName: cf.form_templates?.name,
              }))}
              summaryOnly
            />



            {/* Edit-request history */}
            {requests.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" /> Edit Requests
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {requests.map((r: any) => (
                    <div key={r.id} className="border rounded-md p-2 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant={r.status === 'active' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {r.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateTime(r.created_at)}
                        </span>
                      </div>
                      <p className="text-xs">{r.reasons}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Unified Activity / History — merges workflow approval_actions
                with the enriched return_audit_log rows. */}
            {(auditLog.length > 0 || approvalActions.length > 0) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" /> Activity & History
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[28rem] overflow-y-auto">
                  {auditLog.map((a: any) => (
                    <div key={`audit-${a.id}`} className="text-xs border-l-2 border-primary/40 pl-2 py-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium">{labelForReturnActivity(a.action)}</span>
                        <span className="text-muted-foreground">{formatDateTime(a.created_at)}</span>
                      </div>
                      {(a.previous_status || a.new_status) && a.previous_status !== a.new_status && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Status: <span className="font-mono">{a.previous_status || '—'}</span>
                          {' → '}
                          <span className="font-mono">{a.new_status || '—'}</span>
                        </p>
                      )}
                      {(a.previous_step_id || a.new_step_id) && a.previous_step_id !== a.new_step_id && (
                        <p className="text-[10px] text-muted-foreground">
                          Step changed
                        </p>
                      )}
                      {a.comments && <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{a.comments}</p>}
                      {a.event_key && (
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5 font-mono">{a.event_key}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      <ReturnRevisionCompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        revisions={revisions}
        currentValues={valuesByForm}
        returnLabel={returnData.unique_id}
      />
      <ReturnHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        returnId={returnData.id}
        title={`Return history — ${returnData.unique_id}`}
      />
      {COLLAB_REVIEW_ENABLED && returnData?.id && (
        <CollaborativeReview
          entityType="return"
          entityId={returnData.id}
          fields={[
            { key: 'explanations', label: 'Explanations', value: (returnData as any)?.explanations ?? '' },
            { key: 'reviewer_notes', label: 'Reviewer notes', value: (returnData as any)?.reviewer_notes ?? '' },
          ]}
        />
      )}
    </DashboardLayout>
  );
}

function ReturnTotalSlaRow({ returnId }: { returnId: string }) {
  const { byEntityId } = useWorkflowTotalSla({ entityType: 'return', entityIds: [returnId] });
  const entry = byEntityId.get(returnId);
  if (!entry || entry.stepCount === 0) return null;
  return (
    <div className="mt-3">
      <TotalSlaBadge entry={entry} variant="card" />
    </div>
  );
}
