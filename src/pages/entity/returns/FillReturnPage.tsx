import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getReturnFormStatus, statusLabel, type ReturnFormStatus } from '@/lib/returnsFormProgress';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useReturnById, useReturnConfigForms, useReturnFormData,
  useSaveReturnFormData, useMutateReturn, useInsertReturnAudit,
  useReturnRequests, useReturnComments,
} from '@/hooks/useReturnsManagement';
import { useResolveReturnFormVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { ReturnReviewPanel } from '@/components/returns/ReturnReviewPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { StatusBadge } from './EntityReturnsDashboard';
import { Save, Send, ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Clock, Eye } from 'lucide-react';
import { complianceReturnAcknowledge } from '@/lib/complianceReturnGovernedOps';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { format, differenceInDays } from 'date-fns';
import { useLicenseStatusGate } from '@/hooks/useLicenseStatusGate';
import { LicenseStatusBanner } from '@/components/shared/LicenseStatusBanner';
import { useLicenseeAccessGuard } from '@/hooks/useLicenseeAccessGuard';
import { AccountingReconciliationPanel } from '@/components/returns/AccountingReconciliationPanel';
import { evaluateAccountingReconciliation, formatReconciliationValue } from '@/lib/returnsAccountingReconciliation';
import { ReturnUploadPanel } from '@/components/returns/ReturnUploadPanel';

/* ------------------------------------------------------------------ */
/*  Sub-component: renders a single form template using FormRenderer  */
/* ------------------------------------------------------------------ */
interface SingleReturnFormProps {
  returnId: string;
  formTemplateId: string;
  initialData: Record<string, any>;
  readOnly: boolean;
  onDataChange: (formId: string, data: Record<string, any>, versionId: string | null) => void;
  saving?: boolean;
}

function SingleReturnForm({ returnId, formTemplateId, initialData, readOnly, onDataChange, saving }: SingleReturnFormProps) {
  const { data: resolved, isLoading: rLoading, error: rError } = useResolveReturnFormVersion(returnId, formTemplateId);
  const resolvedAny: any = resolved;
  const resolvedVersionId: string | null = resolvedAny?.version_id || null;
  const resolverError = rError
    ? 'The assigned form version could not be loaded. Please try again or contact support.'
    : resolvedAny?.error || null;
  const { data: sections = [], isLoading: sLoading } = useVersionSections(resolvedVersionId);

  // Only re-seed when the resolved version changes; `initialData` is a fresh
  // object each render and would otherwise cause a render/state loop that can
  // race with button clicks.
  useEffect(() => {
    if (!resolvedVersionId) return;
    onDataChange(formTemplateId, initialData, resolvedVersionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formTemplateId, resolvedVersionId]);

  if (rLoading || sLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading form...
      </div>
    );
  }

  if (resolverError) {
    return <p className="text-sm text-destructive py-2">{resolverError}</p>;
  }

  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No fields defined for this form.</p>;
  }

  return (
    <div className="space-y-3">

      <FormRenderer
        formName=""
        sections={sections}
        initialData={initialData}
        onSaveDraft={(data) => onDataChange(formTemplateId, data, resolvedVersionId)}
        onSubmit={(data) => onDataChange(formTemplateId, data, resolvedVersionId)}
        onChange={(data) => onDataChange(formTemplateId, data, resolvedVersionId)}
        readOnly={readOnly}
        saving={saving}
        showFullTabTitles
        hideActions
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */
export default function FillReturnPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const licenseGate = useLicenseStatusGate();
  const accessGuard = useLicenseeAccessGuard();
  const { data: returnData, isLoading: loadingReturn } = useReturnById(id);
  const { data: configForms = [] } = useReturnConfigForms(returnData?.return_configuration_id);
  const { data: fallbackConfigForms = [], isLoading: loadingFallbackForms } = useQuery({
    queryKey: [
      'fallback_return_forms',
      returnData?.return_configuration_id,
      returnData?.return_configs?.sector_id,
      returnData?.return_configs?.subsector_id,
      returnData?.return_configs?.return_type_id,
    ],
    enabled: !!returnData?.return_configuration_id && configForms.length === 0,
    queryFn: async () => {
      const config = returnData?.return_configs;
      if (!config) return [];

      // Sector / sub-sector / return_type on a form template act as scope filters:
      // NULL means "applies to all" so the template is still eligible. Newly
      // configured forms may have NULL return_type_id but still belong to a
      // sector / sub-sector that matches the return configuration — those must
      // remain visible to the licensee.
      const query = supabase
        .from('form_templates')
        .select('id, name, description, status, form_type, tab_name, form_order, return_template_id, sector_id, sub_sector_id, return_type_id, created_at')
        .eq('status', 'published')
        .eq('form_type', 'returns');

      const { data, error } = await query
        .order('form_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;

      const all = data || [];
      if (all.length === 0) return [];

      // Filter: keep templates whose sector / sub-sector / return_type is either
      // NULL ("all") or matches the configuration's value.
      const matches = all.filter(t => {
        const sectorOk = !t.sector_id || (config.sector_id && t.sector_id === config.sector_id);
        const subOk = !t.sub_sector_id || (config.subsector_id && t.sub_sector_id === config.subsector_id);
        const typeOk = !t.return_type_id || (config.return_type_id && t.return_type_id === config.return_type_id);
        return sectorOk && subOk && typeOk;
      });

      if (matches.length === 0) return [];

      // Effective-window enforcement: hide templates whose latest published
      // version is not currently effective (per admin-set effective dates).
      const ids = matches.map(t => t.id);
      const { data: versions } = await supabase
        .from('form_versions')
        .select('template_id, version, status, effective_from, effective_until')
        .in('template_id', ids)
        .eq('status', 'published')
        .order('version', { ascending: false });

      const nowIso = new Date().toISOString();
      const isEffective = (v: any): boolean => {
        const fromOk = !v.effective_from || v.effective_from <= nowIso;
        let untilOk = true;
        if (v.effective_until) {
          const until = new Date(v.effective_until);
          until.setUTCHours(23, 59, 59, 999);
          untilOk = until.toISOString() >= nowIso;
        }
        return fromOk && untilOk;
      };

      // Keep templates that have at least one published version, and where
      // the highest effective version (or latest published, if none have dates)
      // is effective right now. Templates with NO published version rows are
      // also kept (back-compat: legacy rows skip versioning).
      const versionsByTpl = new Map<string, any[]>();
      for (const v of (versions || []) as any[]) {
        if (!versionsByTpl.has(v.template_id)) versionsByTpl.set(v.template_id, []);
        versionsByTpl.get(v.template_id)!.push(v);
      }
      const effectiveMatches = matches.filter(t => {
        const vs = versionsByTpl.get(t.id);
        if (!vs || vs.length === 0) return true; // legacy: no versions tracked
        const eff = vs.filter(isEffective);
        return eff.length > 0;
      });

      if (effectiveMatches.length === 0) return [];

      return effectiveMatches
        .sort((a, b) => (a.form_order ?? 0) - (b.form_order ?? 0))
        .map((template, index) => ({
          id: `fallback-${template.id}`,
          form_id: template.id,
          return_configuration_id: returnData!.return_configuration_id,
          tab_name: (template.tab_name || template.name || 'General').trim() || 'General',
          display_order: template.form_order ?? index,
          status: 'active',
          form_templates: {
            id: template.id,
            name: template.name,
            description: template.description,
            status: template.status,
          },
        }));
    },
  });
  const { data: savedFormData = [], refetch: refetchFormData } = useReturnFormData(id);
  const saveFormData = useSaveReturnFormData();
  const { update: updateReturn } = useMutateReturn();
  const insertAudit = useInsertReturnAudit();
  const { data: requests = [] } = useReturnRequests(id);
  const { data: comments = [] } = useReturnComments(id);

  const effectiveConfigForms = configForms.length > 0 ? configForms : fallbackConfigForms;

  // Store all form data keyed by formTemplateId → { [fieldName]: value }
  const [allData, setAllData] = useState<Record<string, Record<string, any>>>({});
  // Track which form_version_id each form is pinned to (from saved data or selection)
  const [versionByForm, setVersionByForm] = useState<Record<string, string | null>>({});
  const [activeTab, setActiveTab] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [completedForms, setCompletedForms] = useState<Set<string>>(new Set());
  const autoSaveRef = useRef<NodeJS.Timeout>();
  const initializedRef = useRef(false);
  const [importNonce, setImportNonce] = useState(0);

  const hydrateFormDataRows = useCallback((rows: any[]) => {
    const init: Record<string, Record<string, any>> = {};
    const versions: Record<string, string | null> = {};
    for (const row of rows || []) {
      if (!init[row.form_id]) init[row.form_id] = {};
      init[row.form_id][row.field_name] = row.field_value || '';
      if ((row as any).form_version_id) versions[row.form_id] = (row as any).form_version_id;
    }
    setAllData(init);
    setVersionByForm(versions);
    initializedRef.current = true;
  }, []);

  // Build initial data + pinned versions from saved return_form_data rows
  useEffect(() => {
    if (savedFormData.length > 0 && !initializedRef.current) {
      hydrateFormDataRows(savedFormData);
    }
  }, [savedFormData, hydrateFormDataRows]);

  const handleImported = useCallback(async () => {
    if (!id) return;
    initializedRef.current = false;
    await qc.invalidateQueries({ queryKey: ['return_form_data', id] });
    const { data: refreshedRows = [] } = await refetchFormData();
    hydrateFormDataRows(refreshedRows as any[]);
    setImportNonce((n) => n + 1);
  }, [id, qc, refetchFormData, hydrateFormDataRows]);

  // One tab per linked form (ordered by display_order, then name).
  const orderedForms = useMemo(() => {
    return [...effectiveConfigForms].sort((a: any, b: any) => {
      const oa = a.display_order ?? 0;
      const ob = b.display_order ?? 0;
      if (oa !== ob) return oa - ob;
      return (a.form_templates?.name || '').localeCompare(b.form_templates?.name || '');
    });
  }, [effectiveConfigForms]);

  const tabs = useMemo(() => orderedForms.map((f: any) => f.form_id as string), [orderedForms]);

  useEffect(() => {
    if (tabs.length > 0 && !activeTab) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  const formStatuses = useMemo(() => {
    const m: Record<string, ReturnFormStatus> = {};
    for (const f of orderedForms) m[f.form_id] = getReturnFormStatus(f.form_id, allData, completedForms);
    return m;
  }, [orderedForms, allData, completedForms]);

  const completedCount = orderedForms.filter((f: any) => formStatuses[f.form_id] === 'completed').length;
  const allComplete = orderedForms.length > 0 && completedCount === orderedForms.length;

  const toggleCompleted = useCallback((formId: string, done: boolean) => {
    setCompletedForms(prev => {
      const next = new Set(prev);
      if (done) next.add(formId); else next.delete(formId);
      return next;
    });
  }, []);


  // Auto-save every 60 seconds
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (id && Object.keys(allData).length > 0) handleSave(true);
    }, 60000);
    return () => clearInterval(autoSaveRef.current);
  }, [allData, id]);

  const handleDataChange = useCallback((formId: string, data: Record<string, any>, versionId: string | null) => {
    setAllData(prev => ({ ...prev, [formId]: data }));
    if (versionId) setVersionByForm(prev => (prev[formId] === versionId ? prev : { ...prev, [formId]: versionId }));
  }, []);

  const handleSave = useCallback(async (auto = false) => {
    if (import.meta.env.DEV) {
      console.debug('[FillReturn] save click', { id, saving, forms: Object.keys(allData).length, auto });
    }
    if (!id) {
      if (!auto) toast.error('Return id missing — reload the page and try again.');
      return false;
    }
    if (saving) {
      if (!auto) toast.message('A save is already in progress...');
      return false;
    }
    setSaving(true);
    try {
      for (const [formId, dataMap] of Object.entries(allData)) {
        const fields = Object.entries(dataMap)
          .filter(([key]) => key !== '__repeatable' && !key.startsWith('_repeatable_'))
          .map(([fieldName, val]) => ({
            field_id: fieldName,
            field_name: fieldName,
            field_value: typeof val === 'object' ? JSON.stringify(val) : String(val ?? ''),
          }));
        if (fields.length > 0) {
          await saveFormData.mutateAsync({ returnId: id, formId, fields, formVersionId: versionByForm[formId] || null });
        }
      }
      // Transition TEMP → WIP on first save
      if (returnData?.workflow_status === 'TEMP') {
        await updateReturn.mutateAsync({ id, workflow_status: 'WIP', updated_by: user?.id });
        await insertAudit.mutateAsync({ return_id: id, action: 'draft_saved', previous_status: 'TEMP', new_status: 'WIP', performed_by: user?.id });
      }
      setLastSaved(new Date());
      if (!auto) toast.success('Draft saved');
      return true;
    } catch (e: any) {
      console.error('[FillReturn] save failed', e);
      const reason = e?.message || e?.error_description || 'Unknown error';
      toast.error(`Failed to save draft: ${reason}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, allData, returnData, saving, versionByForm, saveFormData, updateReturn, insertAudit, user?.id]);

  const handleSubmit = async (ackText?: string) => {
    if (import.meta.env.DEV) {
      console.debug('[FillReturn] submit click', { id, submitting, status: returnData?.workflow_status });
    }
    if (submitting) {
      toast.message('Submission already in progress...');
      return;
    }
    if (!id) {
      toast.error('Return id missing — reload the page and try again.');
      return;
    }
    if (licenseGate.isBlocked) {
      toast.error(licenseGate.blockedReason || 'Your license is not in good standing.');
      return;
    }
    setSubmitting(true);
    try {
      // Server-verified authorization for the licensee/sector on this return.
      const targetLicenseeId = (returnData as any)?.on_behalf_of_licensee_id || (returnData as any)?.entity_id || null;
      const targetSectorId = (returnData as any)?.sector_id || null;
      let authorized = false;
      try {
        authorized = await accessGuard.verify(targetLicenseeId, targetSectorId);
      } catch (err: any) {
        console.error('[FillReturn] access guard threw', err);
        toast.error(`Authorization check failed: ${err?.message || 'unknown error'}`);
        return;
      }
      if (!authorized) {
        toast.error('You are not authorized to submit this return.');
        return;
      }
      const result = await Swal.fire({
        title: 'Submit Return?',
        html: `<p>You are about to submit <strong>${returnData?.unique_id}</strong> for review.</p><p>This action cannot be undone.</p>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Submit',
      });
      if (!result.isConfirmed) return;

      // Save first — persist the latest form data so the server-side
      // evaluator sees exactly what the user is about to submit.
      const saved = await handleSave(true);
      if (!saved) {
        toast.error('Submission stopped because the latest draft could not be saved.');
        return;
      }

      // ------------------------------------------------------------------
      // BLOCKING accounting reconciliation.
      // Total Assets must equal Total Liabilities + Total Equity, and
      // P&L Total Income − Total Expenses must equal Pre-tax Profit.
      // ------------------------------------------------------------------
      const reconciliation = evaluateAccountingReconciliation(
        allData,
        orderedForms.map((f: any) => ({ formId: f.form_id, templateName: f.form_templates?.name })),
      );
      if (!reconciliation.passed) {
        const failed = reconciliation.checks.filter((c) => !c.skipped && !c.ok);
        const rows = failed.map((c) => `
          <tr>
            <td style="padding:4px 8px; text-align:left;">${c.label}</td>
            <td style="padding:4px 8px; text-align:right; font-variant-numeric:tabular-nums;">${formatReconciliationValue(c.lhs)}</td>
            <td style="padding:4px 8px; text-align:right; font-variant-numeric:tabular-nums;">${formatReconciliationValue(c.rhs)}</td>
            <td style="padding:4px 8px; text-align:right; color:#dc2626; font-variant-numeric:tabular-nums;">${formatReconciliationValue(c.diff)}</td>
          </tr>`).join('');
        await Swal.fire({
          title: 'Submission Blocked — Accounting Mismatch',
          html: `
            <p style="text-align:left; font-size:13px;">The Balance Sheet and P&amp;L totals do not reconcile. Please correct the following before submitting:</p>
            <table style="width:100%; font-size:12px; border-collapse:collapse; margin-top:8px;">
              <thead><tr style="background:#f3f4f6;">
                <th style="padding:4px 8px; text-align:left;">Check</th>
                <th style="padding:4px 8px; text-align:right;">LHS</th>
                <th style="padding:4px 8px; text-align:right;">RHS</th>
                <th style="padding:4px 8px; text-align:right;">Diff</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="text-align:left; font-size:11px; margin-top:8px; color:#6b7280;">Open the Review tab to see the full totals breakdown.</p>`,
          icon: 'error',
          confirmButtonText: 'Fix and Resubmit',
        });
        return;
      }

      // ------------------------------------------------------------------
      // BLOCKING pre-submit prudential validation.
      // We MUST evaluate rules + ratios + thresholds BEFORE flipping the
      // return to SUB. If any error-severity rule fails, we abort the
      // submission and surface the errors to the user via toast; the
      // ValidationResultPanel on the Review tab reads the persisted run.
      // ------------------------------------------------------------------
      let prudential: any = null;
      try {
        const { data: prudRes, error: prudErr } = await supabase.functions.invoke(
          'evaluate-return-prudential',
          { body: { return_id: id, dispatch_notifications: false, context: 'pre_submit' } },
        );
        if (prudErr) throw prudErr;
        prudential = prudRes;
      } catch (e: any) {
        toast.error(`Validation engine unavailable: ${e?.message || 'unknown error'}. Submission blocked.`);
        return;
      }
      const prudErrors = Array.isArray(prudential?.errors) ? prudential.errors : [];
      const prudWarnings = Array.isArray(prudential?.warnings) ? prudential.warnings : [];
      if (prudErrors.length > 0) {
        qc.invalidateQueries({ queryKey: ['return_validation_runs', id] });
        qc.invalidateQueries({ queryKey: ['return_calculated_ratios', id] });
        qc.invalidateQueries({ queryKey: ['return_threshold_breaches', id] });
        const preview = prudErrors.slice(0, 3).map((r: any) => `• ${r.rule_name}: ${r.message}`).join('<br/>');
        await Swal.fire({
          title: 'Submission Blocked',
          html: `<p>${prudErrors.length} validation error${prudErrors.length === 1 ? '' : 's'} must be resolved before submitting.</p><div class="text-left text-sm mt-2">${preview}</div>${prudErrors.length > 3 ? `<p class="text-xs mt-2">…and ${prudErrors.length - 3} more. See the Review tab.</p>` : ''}`,
          icon: 'error',
          confirmButtonText: 'Review Errors',
        });
        return;
      }
      if (prudWarnings.length > 0) {
        const ack = await Swal.fire({
          title: 'Warnings Detected',
          html: `<p>${prudWarnings.length} non-blocking warning${prudWarnings.length === 1 ? '' : 's'} were raised. Submit anyway?</p>`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Submit with warnings',
          cancelButtonText: 'Go back',
        });
        if (!ack.isConfirmed) return;
      }

      const now = new Date();
      const dueDate = returnData?.due_date ? new Date(returnData.due_date) : null;
      const ontime = dueDate ? (now <= dueDate ? 'ON_TIME' : 'LATE') : null;

      // Persist acknowledgement metadata on compliance_returns (best-effort)
      if (id && ackText) {
        // Governed: acknowledging officer and timestamp are recorded server-side.
        try {
          await complianceReturnAcknowledge(id, String(ackText));
        } catch (e) {
          console.error('acknowledgement could not be recorded', e);
        }
      }

      const previousStatus = String(returnData?.workflow_status || '').toUpperCase();

      // Resubmission path: prefer the resubmit-return edge function so the
      // workflow instance (if any) is reopened and the active edit-request
      // row is closed atomically. Falls back to a direct update for legacy
      // returns with no workflow configured.
      let resubmissionHandledByEdge = false;
      if (previousStatus === 'TBR') {
        const { data: resub, error: resubErr } = await supabase.functions.invoke('resubmit-return', {
          body: { return_id: id, comments: 'Licensee resubmission' },
        });
        if (resubErr || (resub as any)?.error) {
          // Fall back to legacy direct update
          try {
            await updateReturn.mutateAsync({
              id, workflow_status: 'SUB', submit_date: now.toISOString(),
              ontime_status: ontime, updated_by: user?.id,
            });
          } catch (e: any) { toast.error(e?.message || 'Failed to submit return'); return; }
          if (activeRequest?.id) {
            await supabase.from('return_requests')
              .update({ status: 'resolved', resolved_at: now.toISOString() })
              .eq('id', activeRequest.id);
          }
        } else {
          resubmissionHandledByEdge = true;
        }
      } else {
        try {
          await updateReturn.mutateAsync({
            id, workflow_status: 'SUB', submit_date: now.toISOString(),
            ontime_status: ontime, updated_by: user?.id,
          });
        } catch (e: any) {
          toast.error(e?.message || 'Failed to submit return');
          return;
        }
      }

      // Enriched activity rows for submit / resubmit.
      const isResub = previousStatus === 'TBR';
      insertAudit.mutate({
        return_id: id,
        action: isResub ? 'return_resubmitted' : 'return_submitted',
        previous_status: returnData?.workflow_status,
        new_status: 'SUB',
        performed_by: user?.id,
        event_key: isResub ? 'return.resubmitted' : 'return.submitted',
        source: 'client:FillReturnPage',
        metadata: { submitted_at: now.toISOString() },
      });
      // Status transition row (skip for resubmission path handled by RPC,
      // which already writes status_changed).
      if (!isResub) {
        insertAudit.mutate({
          return_id: id,
          action: 'status_changed',
          previous_status: returnData?.workflow_status,
          new_status: 'SUB',
          performed_by: user?.id,
          event_key: 'return.status_changed',
          source: 'client:FillReturnPage',
          metadata: { from: returnData?.workflow_status, to: 'SUB' },
        });
      }
      qc.invalidateQueries({ queryKey: ['returns_filed'] });
      qc.invalidateQueries({ queryKey: ['returns_filed', id] });
      qc.invalidateQueries({ queryKey: ['my_returns'] });
      qc.invalidateQueries({ queryKey: ['licensee-metrics'] });
      qc.invalidateQueries({ queryKey: ['return_requests', id] });
      qc.invalidateQueries({ queryKey: ['return_audit_log', id] });
      qc.invalidateQueries({ queryKey: ['return_comments', id] });
      // Ensure the configurable workflow (if any) is started so first-step
      // approvers can be resolved as notification recipients. Best-effort.
      let resolvedStepId: string | null = (returnData as any)?.current_step_id || null;
      let resolvedWorkflowId: string | null = (returnData as any)?.workflow_id || null;
      try {
        const { data: startRes } = await (supabase as any).rpc('start_return_workflow', { _return_id: id });
        const r = (startRes || {}) as Record<string, unknown>;
        if (r.step_id) resolvedStepId = String(r.step_id);
        if (r.workflow_id) resolvedWorkflowId = String(r.workflow_id);
      } catch { /* legacy returns with no workflow configured */ }
      // Re-read current_step_id from DB as a fallback (the RPC may update returns_filed directly).
      if (!resolvedStepId) {
        try {
          const { data: r2 } = await (supabase as any)
            .from('returns_filed')
            .select('current_step_id, workflow_id')
            .eq('id', id)
            .maybeSingle();
          resolvedStepId = (r2 as any)?.current_step_id || resolvedStepId;
          resolvedWorkflowId = (r2 as any)?.workflow_id || resolvedWorkflowId;
        } catch { /* ignore */ }
      }
      if (previousStatus !== 'TBR' || !resubmissionHandledByEdge) {
        const basePayload = {
          return_id: id,
          unique_id: returnData?.unique_id,
          return_unique_id: returnData?.unique_id,
          return_name: (returnData as any)?.return_configs?.name,
          return_config_name: (returnData as any)?.return_configs?.name,
          return_period: returnData?.return_period,
          return_year: returnData?.return_year,
          licensee_id: (returnData as any)?.on_behalf_of_licensee_id || (returnData as any)?.entity_id,
          entity_id: (returnData as any)?.entity_id,
          sector_id: (returnData as any)?.sector_id,
          submitted_by: user?.id,
          submitted_by_email: user?.email,
          submitted_by_name: user?.email || 'Licensee',
          submitted_at: now.toISOString(),
          submit_date: now.toISOString(),
          actor_id: user?.id,
          actor_name: user?.email || 'Licensee',
          actor_email: user?.email,
          previous_status: previousStatus,
          new_status: 'SUB',
          workflow_id: resolvedWorkflowId,
          current_step_id: resolvedStepId,
          step_id: resolvedStepId,
        };
        const reviewerEventKey = previousStatus === 'TBR' ? 'return.resubmitted' : 'return.submitted';
        const confirmationEventKey = previousStatus === 'TBR' ? 'return.resubmitted.confirmation' : 'return.submitted.confirmation';
        supabase.functions.invoke('dispatch-notification-event', {
          body: {
            event_key: reviewerEventKey,
            entity_type: 'return',
            entity_id: id,
            payload: { ...basePayload, cta_label: 'Review Return' },
          },
        }).catch(() => {});
        supabase.functions.invoke('dispatch-notification-event', {
          body: {
            event_key: confirmationEventKey,
            entity_type: 'return',
            entity_id: id,
            payload: { ...basePayload, cta_label: 'View Return' },
          },
        }).catch(() => {});
      }

      // Server-side prudential evaluation (validation + ratios + breaches + notifications).
      // Fire-and-forget: submission has already succeeded; failures here are logged.
      supabase.functions
        .invoke('evaluate-return-prudential', { body: { return_id: id, dispatch_notifications: true } })
        .catch((err) => console.warn('[prudential] evaluation failed', err));

      toast.success('Return submitted successfully!');
      navigate(`/entity/returns/${id}/view`);
    } catch (e: any) {
      console.error('[FillReturn] submit failed', e);
      toast.error(e?.message || 'Failed to submit return');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingReturn) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!returnData) {
    return (
      <DashboardLayout>
        <p className="text-center py-20">Return not found</p>
      </DashboardLayout>
    );
  }

  const tabIndex = tabs.indexOf(activeTab);
  const daysLeft = returnData.due_date ? differenceInDays(new Date(returnData.due_date), new Date()) : null;
  const activeRequest = requests.find((r: any) => r.status === 'active');
  const isEditable = ['TEMP', 'WIP', 'TBR'].includes(returnData.workflow_status);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <LicenseStatusBanner />
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-card border rounded-lg p-4">
          <div>
            <h1 className="text-lg font-bold">{returnData.unique_id} — {returnData.return_configs?.name}</h1>
            <p className="text-sm text-muted-foreground">{returnData.return_period} {returnData.return_year}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={returnData.workflow_status} />
            {daysLeft !== null && (
              <Badge variant={daysLeft < 0 ? 'destructive' : daysLeft <= 7 ? 'default' : 'secondary'}>
                <Clock className="h-3 w-3 mr-1" />
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
              </Badge>
            )}
            {saving && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
            {!saving && lastSaved && <span className="text-xs text-muted-foreground">Saved {format(lastSaved, 'HH:mm')}</span>}
          </div>
        </div>

        {/* TBR Alert */}
        {returnData.workflow_status === 'TBR' && activeRequest && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription><strong>Resubmission Required:</strong> {activeRequest.reasons}</AlertDescription>
          </Alert>
        )}

        {/* Comments for TBR */}
        {returnData.workflow_status === 'TBR' && comments.length > 0 && (
          <Alert>
            <AlertDescription>
              <strong>Reviewer Comments:</strong>
              {comments.map((c: any) => <p key={c.id} className="text-sm mt-1">• {c.comment_text}</p>)}
            </AlertDescription>
          </Alert>
        )}

        {/* Bulk upload template + import */}
        {isEditable && orderedForms.length > 0 && (
          <ReturnUploadPanel
            returnId={id!}
            returnUniqueId={returnData.unique_id}
            licenseeId={(returnData as any)?.on_behalf_of_licensee_id || (returnData as any)?.entity_id || null}
            orderedForms={orderedForms as any}
            allData={allData}
            disabled={!isEditable || saving || submitting}
            onImported={handleImported}
          />
        )}

        {/* Multi-form progress strip */}
        {orderedForms.length > 1 && (
          <div className="bg-card border rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-semibold">Forms in this return: {orderedForms.length}</span>
                <span className="text-muted-foreground ml-2">
                  {completedCount} / {orderedForms.length} completed
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {orderedForms.map((cf: any, i: number) => {
                  const s = formStatuses[cf.form_id];
                  const variant: any =
                    s === 'completed' ? 'default' : s === 'in_progress' ? 'secondary' : 'outline';
                  return (
                    <Badge
                      key={cf.form_id}
                      variant={variant}
                      className="cursor-pointer"
                      onClick={() => setActiveTab(cf.form_id)}
                    >
                      {i + 1}. {cf.form_templates?.name || 'Form'} · {statusLabel(s)}
                    </Badge>
                  );
                })}
              </div>
            </div>
            <Progress value={(completedCount / orderedForms.length) * 100} className="h-1.5" />
          </div>
        )}

        {/* Tabbed forms using FormRenderer + final Review tab */}
        {(tabs.length > 0 || loadingFallbackForms) && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto">
              {orderedForms.map((cf: any, i: number) => {
                const s = formStatuses[cf.form_id];
                return (
                  <TabsTrigger key={cf.form_id} value={cf.form_id} className="gap-1">
                    {s === 'completed' && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                    <span>{i + 1}. {cf.form_templates?.name || 'Form'}</span>
                  </TabsTrigger>
                );
              })}
              {isEditable && (
                <TabsTrigger value="__review__" className="gap-1">
                  <Eye className="h-3 w-3" /> Review &amp; Submit
                </TabsTrigger>
              )}
            </TabsList>

            {orderedForms.map((cf: any, i: number) => (
              <TabsContent key={cf.form_id} value={cf.form_id} className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
                      <span>
                        Form {i + 1} of {orderedForms.length} — {cf.form_templates?.name || 'Form'}
                      </span>
                      <Badge
                        variant={
                          formStatuses[cf.form_id] === 'completed'
                            ? 'default'
                            : formStatuses[cf.form_id] === 'in_progress'
                            ? 'secondary'
                            : 'outline'
                        }
                        className="text-[10px]"
                      >
                        {statusLabel(formStatuses[cf.form_id])}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SingleReturnForm
                      key={`${cf.form_id}:${importNonce}`}
                      returnId={id!}
                      formTemplateId={cf.form_id}
                      initialData={allData[cf.form_id] || {}}
                      readOnly={!isEditable}
                      onDataChange={handleDataChange}
                      saving={saving}
                    />
                    {isEditable && (
                      <div className="mt-4 pt-3 border-t flex items-center gap-2">
                        <Checkbox
                          id={`complete-${cf.form_id}`}
                          checked={completedForms.has(cf.form_id)}
                          onCheckedChange={(v) => toggleCompleted(cf.form_id, v === true)}
                        />
                        <label
                          htmlFor={`complete-${cf.form_id}`}
                          className="text-sm cursor-pointer"
                        >
                          I've completed this form
                        </label>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}

            {isEditable && (
              <TabsContent value="__review__" className="space-y-4">
                {!allComplete && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {orderedForms.length - completedCount} of {orderedForms.length} form
                      {orderedForms.length - completedCount === 1 ? '' : 's'} still need to be
                      marked as completed before you can submit.
                    </AlertDescription>
                  </Alert>
                )}
                <AccountingReconciliationPanel
                  allData={allData}
                  forms={orderedForms.map((cf: any) => ({
                    formId: cf.form_id,
                    templateName: cf.form_templates?.name,
                  }))}
                />
                <ReturnReviewPanel
                  loading={submitting}
                  disabled={!allComplete}
                  onAcknowledge={() =>
                    handleSubmit(
                      'I confirm that the data submitted in this return is accurate and complete to the best of my knowledge.'
                    )
                  }
                  returnSummary={[
                    { label: 'Reference', value: returnData?.unique_id || null },
                    { label: 'Return Type', value: returnData?.return_configs?.name || null },
                    { label: 'Period', value: `${returnData?.return_period || ''} ${returnData?.return_year || ''}`.trim() || null },
                    { label: 'Due Date', value: returnData?.due_date ? format(new Date(returnData.due_date), 'PP') : null },
                  ]}
                  forms={orderedForms.map((cf: any) => ({
                    formId: cf.form_id,
                    name: cf.form_templates?.name || 'Form',
                    tabName: cf.tab_name || 'General',
                    status: formStatuses[cf.form_id],
                  }))}
                  allData={allData}
                  onJumpToForm={(fid) => setActiveTab(fid)}
                />
              </TabsContent>
            )}
          </Tabs>
        )}


        {!loadingFallbackForms && tabs.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No active return forms are available for this return configuration. Either no forms are linked, or all matching forms are outside their effective date window. Please contact your administrator.
            </CardContent>
          </Card>
        )}

        {/* Navigation + Actions */}
        {isEditable && activeTab !== '__review__' && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-card border rounded-lg p-4">
            <div className="flex gap-2">
              {tabIndex > 0 && (
                <Button variant="outline" onClick={async () => { if (await handleSave(true)) setActiveTab(tabs[tabIndex - 1]); }} disabled={saving}>
                  <ArrowLeft className="h-4 w-4 mr-2" />Previous
                </Button>
              )}
              {tabIndex < tabs.length - 1 && (
                <Button variant="outline" onClick={async () => { if (await handleSave(true)) setActiveTab(tabs[tabIndex + 1]); }} disabled={saving}>
                  Next<ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {tabIndex === tabs.length - 1 && (
                <Button data-rbac="returns_management.edit" variant="outline" onClick={async () => { if (await handleSave(true)) setActiveTab('__review__'); }} disabled={saving}>
                  Review &amp; Submit<ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Draft'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
