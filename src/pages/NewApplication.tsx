import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useApplicationSettings } from '@/hooks/useApplicationSettings';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useSectors, useSubSectors, useCategories } from '@/hooks/useMasterConfig';
import { useFormTemplates, useResolveAppFormVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { useAuth } from '@/contexts/AuthContext';
import { useRegulator } from '@/contexts/RegulatorContext';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { AttachmentList } from '@/components/shared/AttachmentList';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { getApplicationStatusLabel, markApplicationInProgressIfDraft, normalizeApplicationStatus } from '@/lib/applicationStatus';
import {
  ArrowLeft, ArrowRight, CheckCircle2, FileText, Upload, Loader2,
  Building2, Layers, Tag, ClipboardList, Paperclip, Send, Clock, PlayCircle,
  CreditCard, AlertCircle, RefreshCw, Receipt,
} from 'lucide-react';
import { ReviewAcknowledgement } from '@/components/applications/ReviewAcknowledgement';
import { ApplicationReviewBuilder } from '@/components/applications/ApplicationReviewBuilder';
import { useReviewSettings } from '@/hooks/useReviewSettings';
import { useQueryClient } from '@tanstack/react-query';

type WizardStep = 'selection' | 'forms' | 'filling' | 'documents' | 'payment' | 'review';
type FormStatus = 'not_started' | 'in_progress' | 'completed' | 'needs_update';
type PaymentStatus = 'pending' | 'success' | 'failed';

type ExistingPaymentRecord = {
  id: string;
  status: string;
  amount: number | null;
  transaction_ref?: string | null;
  receipt_number?: string | null;
  currency?: string | null;
  paid_at?: string | null;
  created_at: string;
};

type ExistingFormResponseRecord = {
  template_id: string;
  version_id: string | null;
  response_data: Record<string, any> | null;
  status: string | null;
  updated_at?: string | null;
};

const SUCCESSFUL_PAYMENT_STATUSES = new Set(['completed', 'success', 'paid']);
const PENDING_PAYMENT_STATUSES = new Set(['pending', 'processing', 'initiated']);
const SAVED_FORM_RESPONSE_STATUSES = new Set(['draft', 'submitted', 'completed']);

interface FormProgress {
  templateId: string;
  status: FormStatus;
  data: Record<string, any>;
  versionId?: string | null;
  assignedVersionId?: string | null;
}

const hasNonEmptyFormData = (data?: Record<string, any> | null) => (
  !!data && typeof data === 'object' && Object.keys(data).length > 0
);

const WIZARD_STEPS: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
  { key: 'selection', label: 'Select Category', icon: <Layers className="h-4 w-4" /> },
  { key: 'forms', label: 'Required Forms', icon: <ClipboardList className="h-4 w-4" /> },
  { key: 'documents', label: 'Upload Documents', icon: <Paperclip className="h-4 w-4" /> },
  { key: 'payment', label: 'Payment', icon: <CreditCard className="h-4 w-4" /> },
  { key: 'review', label: 'Submit', icon: <Send className="h-4 w-4" /> },
];

export default function NewApplication() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const draftIdParam = searchParams.get('draft');
  const stepParam = searchParams.get('step');
  const continueModeParam = searchParams.get('mode') === 'continue';
  const continueIdFromPath = useMemo(() => {
    const match = location.pathname.match(/^\/applications\/([^/]+)\/continue$/);
    return match?.[1] || null;
  }, [location.pathname]);
  const continuedApplicationId = continueIdFromPath || draftIdParam;
  const isContinuingDraft = !!continuedApplicationId && continueModeParam;
  const { user } = useAuth();
  const { activeRegulator } = useRegulator();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<WizardStep>('selection');
  const [activeFormTemplateId, setActiveFormTemplateId] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedSubSector, setSelectedSubSector] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [formProgressMap, setFormProgressMap] = useState<Record<string, FormProgress>>({});
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<string>('draft');
  const [saving, setSaving] = useState(false);
  const { data: reviewSettings } = useReviewSettings();
  const [submitting, setSubmitting] = useState(false);
  const [docRefresh, setDocRefresh] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentReceiptNumber, setPaymentReceiptNumber] = useState<string | null>(null);
  const [hasSuccessfulPaymentRecord, setHasSuccessfulPaymentRecord] = useState(false);
  const [feeAmount, setFeeAmount] = useState<number>(0);
  const [feeBreakdown, setFeeBreakdown] = useState<{ name: string; amount: number }[]>([]);
  const [showInlineReview, setShowInlineReview] = useState(false);
  const [hydratedDraftTemplates, setHydratedDraftTemplates] = useState<Array<{ id: string; name: string }>>([]);

  const { data: appSettings } = useApplicationSettings();

  const { data: sectors = [] } = useSectors();
  const { data: allSubSectors = [] } = useSubSectors();
  const { data: allCategories = [] } = useCategories();
  const { data: formTemplates = [] } = useFormTemplates(undefined, activeRegulator?.id);

  // Re-application guard state. The actual per-triple check runs in
  // handleProceedToForms once the user has chosen sector / sub-sector /
  // category, since the rule is keyed on (applicant, sector, sub-sector,
  // category).
  const [reappBlocked, setReappBlocked] = useState(false);
  const [sectorBlockMessage, setSectorBlockMessage] = useState('');
  const [blockedExistingAppId, setBlockedExistingAppId] = useState<string | null>(null);
  const [blockedCode, setBlockedCode] = useState<string | null>(null);

  const filteredSubSectors = allSubSectors.filter(s => s.sector_id === selectedSector);
  const filteredCategories = allCategories.filter(c => c.sub_sector_id === selectedSubSector);

  // Find ALL matching form templates
  const matchedTemplates = useMemo(() => {
    if (!selectedCategory) return [];
    const published = formTemplates.filter(t =>
      t.status === 'published' &&
      (t.form_type === 'pre_license' || t.form_type === 'application')
    );

    // Priority 1: Match by category_id (most specific)
    const byCategory = published.filter(t => t.category_id === selectedCategory);
    if (byCategory.length > 0) return byCategory;

    // Priority 2: Match by sub_sector_id (no category set on template)
    const bySubSector = published.filter(t => t.sub_sector_id === selectedSubSector && !t.category_id);
    if (bySubSector.length > 0) return bySubSector;

    // Priority 3: Match by sector_id (no sub-sector or category set)
    const bySector = published.filter(t => t.sector_id === selectedSector && !t.sub_sector_id && !t.category_id);
    if (bySector.length > 0) return bySector;

    // Priority 4: Fallback to string-based name matching for legacy templates
    const catObj = allCategories.find(c => c.id === selectedCategory);
    const subObj = allSubSectors.find(s => s.id === selectedSubSector);
    const secObj = sectors.find(s => s.id === selectedSector);
    if (!catObj || !subObj || !secObj) return [];

    return published.filter(t =>
      (t.category && t.category === catObj.name) ||
      (t.sub_sector && t.sub_sector === subObj.name && !t.category) ||
      (t.sector && t.sector === secObj.name && !t.category && !t.sub_sector)
    );
  }, [selectedCategory, selectedSubSector, selectedSector, formTemplates, allCategories, allSubSectors, sectors]);

  const reviewTemplates = useMemo(
    () => (matchedTemplates.length > 0
      ? matchedTemplates.map((template) => ({ id: template.id, name: template.name }))
      : hydratedDraftTemplates),
    [matchedTemplates, hydratedDraftTemplates]
  );

  const loadDraftTemplatesByIds = useCallback(async (templateIds: string[]) => {
    if (templateIds.length === 0) return [] as Array<{ id: string; name: string }>;

    const knownTemplates = new Map(
      formTemplates.map((template) => [template.id, { id: template.id, name: template.name }])
    );

    const missingIds = templateIds.filter((templateId) => !knownTemplates.has(templateId));
    if (missingIds.length > 0) {
      const { data, error } = await supabase
        .from('form_templates')
        .select('id, name')
        .in('id', missingIds);

      if (error) {
        console.warn('[NewApplication] failed to load draft template metadata:', error);
      } else {
        for (const template of (data || []) as Array<{ id: string; name: string | null }>) {
          knownTemplates.set(template.id, {
            id: template.id,
            name: template.name || `Form ${template.id.slice(0, 8).toUpperCase()}`,
          });
        }
      }
    }

    return templateIds.map((templateId) => knownTemplates.get(templateId) || {
      id: templateId,
      name: `Form ${templateId.slice(0, 8).toUpperCase()}`,
    });
  }, [formTemplates]);

  // Active form template being filled
  const activeTemplate = useMemo(() => {
    return matchedTemplates.find(t => t.id === activeFormTemplateId) || null;
  }, [activeFormTemplateId, matchedTemplates]);

  const [assignedVersionByTemplate, setAssignedVersionByTemplate] = useState<Record<string, string>>({});
  const { data: resolvedFormVersion, isLoading: resolvingFormVersion, error: resolveFormVersionError } = useResolveAppFormVersion(
    applicationId,
    activeTemplate?.id || null,
  );
  const resolvedVersion: any = resolvedFormVersion;
  const resolvedVersionId = resolvedVersion?.version_id || null;
  const resolvedVersionLabel = resolvedVersion?.semantic_version || resolvedVersion?.version_number || null;
  const resolverMessage = resolveFormVersionError
    ? 'The assigned form version could not be loaded. Please try again or contact support.'
    : resolvedVersion?.error || null;
  const { data: sections = [] } = useVersionSections(resolvedVersionId);

  // Hydrate previously-pinned versions from an existing draft application so
  // the user keeps editing the version they started on.
  useEffect(() => {
    if (!applicationId) return;
    (async () => {
      const { data } = await supabase.from('applications').select('data').eq('id', applicationId).maybeSingle();
      const pinned = (data?.data as any)?.form_version_ids as Record<string, string> | undefined;
      if (pinned) setAssignedVersionByTemplate(prev => ({ ...pinned, ...prev }));
    })();
  }, [applicationId]);

  const loadExistingPayment = useCallback(async (targetApplicationId: string) => {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('id, status, amount, transaction_ref, receipt_number, currency, paid_at, created_at')
      .eq('application_id', targetApplicationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const list = (payments || []) as ExistingPaymentRecord[];
    const successful = list.find((payment) => SUCCESSFUL_PAYMENT_STATUSES.has((payment.status || '').toLowerCase())) || null;
    const pending = list.find((payment) => PENDING_PAYMENT_STATUSES.has((payment.status || '').toLowerCase())) || null;

    return {
      successful,
      pending,
      latest: successful || pending || list[0] || null,
      hasSuccessfulPayment: !!successful,
    };
  }, []);

  const latestPublishedVersionRef = useRef<Record<string, string | null>>({});
  useEffect(() => {
    if (matchedTemplates.length === 0) {
      latestPublishedVersionRef.current = {};
      return;
    }

    let cancelled = false;
    (async () => {
      const templateIds = matchedTemplates.map((template) => template.id);
      const { data, error } = await supabase
        .from('form_versions')
        .select('id, template_id, version, status, effective_from, effective_until')
        .in('template_id', templateIds)
        .eq('status', 'published')
        .order('version', { ascending: false });

      if (cancelled || error) {
        if (error) console.warn('[NewApplication] latest version lookup failed:', error);
        return;
      }

      const now = new Date();
      const nextMap: Record<string, string | null> = {};
      templateIds.forEach((id) => { nextMap[id] = null; });

      for (const row of (data || []) as Array<{ id: string; template_id: string; effective_from?: string | null; effective_until?: string | null }>) {
        if (nextMap[row.template_id]) continue;
        const fromOk = !row.effective_from || new Date(row.effective_from) <= now;
        let untilOk = true;
        if (row.effective_until) {
          const until = new Date(row.effective_until);
          until.setUTCHours(23, 59, 59, 999);
          untilOk = until >= now;
        }
        if (fromOk && untilOk) {
          nextMap[row.template_id] = row.id;
        }
      }

      latestPublishedVersionRef.current = nextMap;
    })();

    return () => { cancelled = true; };
  }, [matchedTemplates]);

  const existingFormResponsesRef = useRef<Record<string, ExistingFormResponseRecord>>({});
  const activeFormTemplateIdRef = useRef<string | null>(null);
  const latestDraftDataRef = useRef<Record<string, any>>({});
  useEffect(() => {
    activeFormTemplateIdRef.current = activeFormTemplateId;
  }, [activeFormTemplateId]);

  const loadExistingFormResponses = useCallback(async (
    targetApplicationId: string,
    templates: Array<{ id: string }>,
    versionMap: Record<string, string>,
  ) => {
    if (!targetApplicationId || templates.length === 0) {
      existingFormResponsesRef.current = {};
      return {} as Record<string, ExistingFormResponseRecord>;
    }

    const templateIds = templates.map((template) => template.id);
    const { data, error } = await supabase
      .from('form_responses')
      .select('template_id, version_id, response_data, status, updated_at')
      .eq('entity_id', targetApplicationId)
      .eq('entity_type', 'application')
      .in('template_id', templateIds)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const responseMap: Record<string, ExistingFormResponseRecord> = {};
    for (const response of (data || []) as ExistingFormResponseRecord[]) {
      const assignedVersionId = versionMap[response.template_id] || null;
      const normalizedStatus = (response.status || '').toLowerCase();
      const hasData = hasNonEmptyFormData(response.response_data || {});
      const isEligible = hasData || SAVED_FORM_RESPONSE_STATUSES.has(normalizedStatus);
      if (!isEligible) continue;

      const current = responseMap[response.template_id];
      const isAssignedVersionMatch = !!assignedVersionId && response.version_id === assignedVersionId;

      if (!current) {
        responseMap[response.template_id] = response;
        continue;
      }

      const currentMatchesAssigned = !!assignedVersionId && current.version_id === assignedVersionId;
      if (!currentMatchesAssigned && isAssignedVersionMatch) {
        responseMap[response.template_id] = response;
      }
    }

    existingFormResponsesRef.current = responseMap;
    return responseMap;
  }, []);

  const hydrateFormProgress = useCallback(async (
    targetApplicationId: string,
    templates: Array<{ id: string }>,
    versionMap: Record<string, string>,
  ) => {
    if (!targetApplicationId || templates.length === 0) {
      existingFormResponsesRef.current = {};
      setFormProgressMap((prev) => {
        if (Object.keys(prev).length === 0) return prev;
        return {};
      });
      return;
    }

    const templateIds = templates.map((template) => template.id);
    const { data: appRecord, error: appError } = await supabase
      .from('applications')
      .select('data')
      .eq('id', targetApplicationId)
      .maybeSingle();

    if (appError) throw appError;

    const appData = ((appRecord as any)?.data || {}) as Record<string, any>;
    latestDraftDataRef.current = appData;
    const storedFormsData = (appData.forms_data || {}) as Record<string, Record<string, any>>;
    const storedVersionIds = (appData.form_version_ids || {}) as Record<string, string>;

    const effectiveVersionMap = templateIds.reduce<Record<string, string>>((acc, templateId) => {
      const resolved = versionMap[templateId] || storedVersionIds[templateId] || latestPublishedVersionRef.current[templateId] || '';
      if (resolved) acc[templateId] = resolved;
      return acc;
    }, {});

    const responseMap = await loadExistingFormResponses(targetApplicationId, templates, effectiveVersionMap);

    setAssignedVersionByTemplate((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const templateId of templateIds) {
        const resolved = effectiveVersionMap[templateId];
        if (resolved && next[templateId] !== resolved) {
          next[templateId] = resolved;
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setFormProgressMap((prev) => {
      const next: Record<string, FormProgress> = {};

      for (const templateId of templateIds) {
        const assignedVersionId = effectiveVersionMap[templateId] || storedVersionIds[templateId] || null;
        const existingResponse = responseMap[templateId];
        const responseVersionMatches = !!assignedVersionId && existingResponse?.version_id === assignedVersionId;
        const responseData = existingResponse?.response_data || {};
        const storedData = storedFormsData[templateId] || {};
        const storedVersionMatches = !!assignedVersionId
          ? (storedVersionIds[templateId] ? storedVersionIds[templateId] === assignedVersionId : true)
          : hasNonEmptyFormData(storedData);
        const localProgress = prev[templateId];
        const localAssignedVersionMatches = !!assignedVersionId
          ? (localProgress?.versionId ? localProgress.versionId === assignedVersionId : true)
          : hasNonEmptyFormData(localProgress?.data);
        const activeLocalData = activeFormTemplateIdRef.current === templateId ? localProgress?.data || {} : {};
        const shouldPreserveLocalActiveData = activeFormTemplateIdRef.current === templateId && hasNonEmptyFormData(activeLocalData);

        let status: FormStatus = 'not_started';
        let data: Record<string, any> = {};
        let versionId: string | null = assignedVersionId;

        if (responseVersionMatches && hasNonEmptyFormData(responseData)) {
          status = 'completed';
          data = responseData;
          versionId = existingResponse?.version_id || assignedVersionId;
        } else if (hasNonEmptyFormData(storedData) && storedVersionMatches) {
          status = 'completed';
          data = storedData;
          versionId = assignedVersionId || storedVersionIds[templateId] || null;
        } else if ((existingResponse && hasNonEmptyFormData(responseData) && !responseVersionMatches) || (hasNonEmptyFormData(storedData) && !storedVersionMatches)) {
          status = 'needs_update';
          data = {};
          versionId = assignedVersionId;
        } else if (localProgress && hasNonEmptyFormData(localProgress.data) && localAssignedVersionMatches) {
          status = localProgress.status === 'completed' ? 'completed' : 'in_progress';
          data = localProgress.data;
          versionId = localProgress.versionId || assignedVersionId;
        }

        if (shouldPreserveLocalActiveData) {
          data = activeLocalData;
          status = localProgress?.status === 'completed' && localAssignedVersionMatches ? 'completed' : 'in_progress';
          versionId = localProgress?.versionId || assignedVersionId;
        }

        next[templateId] = {
          templateId,
          status,
          data,
          versionId,
          assignedVersionId,
        };
      }

      return next;
    });
  }, [loadExistingFormResponses, matchedTemplates]);

  const loadReceiptNumber = useCallback(async (targetPaymentId: string, fallback?: string | null) => {
    if (fallback) return fallback;
    const { data: receipt } = await supabase
      .from('payment_receipts')
      .select('receipt_number')
      .eq('payment_id', targetPaymentId)
      .maybeSingle();
    return (receipt as { receipt_number?: string | null } | null)?.receipt_number || null;
  }, []);

  // Hydrate existing payment for this application so the user cannot pay twice.
  // If a successful payment exists we lock the payment step into the success state.
  const hydratePaymentState = useCallback(async (targetApplicationId: string) => {
    const existing = await loadExistingPayment(targetApplicationId);

    if (existing.successful) {
      setHasSuccessfulPaymentRecord(true);
      setPaymentId(existing.successful.id);
      setPaymentReceiptNumber(await loadReceiptNumber(existing.successful.id, existing.successful.receipt_number || existing.successful.transaction_ref || null));
      setPaymentStatus('success');
      if (Number(existing.successful.amount || 0) > 0) {
        setFeeAmount(prev => prev || Number(existing.successful.amount || 0));
      }
      return existing;
    }

    if (existing.pending) {
      setHasSuccessfulPaymentRecord(false);
      setPaymentId(existing.pending.id);
      setPaymentReceiptNumber(await loadReceiptNumber(existing.pending.id, existing.pending.receipt_number || existing.pending.transaction_ref || null));
      setPaymentStatus('pending');
      if (Number(existing.pending.amount || 0) > 0) {
        setFeeAmount(prev => prev || Number(existing.pending.amount || 0));
      }
      return existing;
    }

    setHasSuccessfulPaymentRecord(false);
    setPaymentId(null);
    setPaymentReceiptNumber(null);
    setPaymentStatus('pending');
    return existing;
  }, [loadExistingPayment, loadReceiptNumber]);

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    (async () => {
      try {
        await hydratePaymentState(applicationId);
      } catch (err) {
        if (!cancelled) console.warn('[NewApplication] payment hydration failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId, hydratePaymentState]);

  useEffect(() => {
    if (!applicationId || currentStep !== 'payment') return;
    void hydratePaymentState(applicationId).catch((err) => {
      console.warn('[NewApplication] payment-step hydration failed:', err);
    });
  }, [applicationId, currentStep, hydratePaymentState]);

  useEffect(() => {
    if (!activeTemplate?.id || !resolvedVersionId) return;
    setAssignedVersionByTemplate(prev => (
      prev[activeTemplate.id] === resolvedVersionId
        ? prev
        : { ...prev, [activeTemplate.id]: resolvedVersionId }
    ));
  }, [activeTemplate?.id, resolvedVersionId]);

  // Progress calculations
  const isFormComplete = useCallback((tid: string) => {
    const fp = formProgressMap[tid];
    const assignedVersionId = fp?.assignedVersionId || assignedVersionByTemplate[tid] || null;
    const hasMatchingLocalData = !!fp && hasNonEmptyFormData(fp.data) && (!assignedVersionId || !fp.versionId || fp.versionId === assignedVersionId);

    if (fp?.status === 'completed' && hasMatchingLocalData) return true;
    if (hasMatchingLocalData && fp?.status !== 'needs_update') return true;

    const existingResponse = existingFormResponsesRef.current[tid];
    const hasMatchingSavedResponse = !!existingResponse
      && hasNonEmptyFormData(existingResponse.response_data || {})
      && (!assignedVersionId || existingResponse.version_id === assignedVersionId);

    return hasMatchingSavedResponse;
  }, [assignedVersionByTemplate, formProgressMap]);
  const completedCount = matchedTemplates.filter(t => isFormComplete(t.id)).length;
  const allFormsCompleted = matchedTemplates.length > 0 && completedCount === matchedTemplates.length;

  // Wizard step index (skip 'filling' from display)
  const displayStep = currentStep === 'filling' ? 'forms' : currentStep;
  const stepIndex = WIZARD_STEPS.findIndex(s => s.key === displayStep);
  const progress = ((stepIndex + 1) / WIZARD_STEPS.length) * 100;
  const paymentComplete = feeAmount === 0 || paymentStatus === 'success' || hasSuccessfulPaymentRecord;
  const hasReusablePendingPayment = paymentStatus === 'pending' && !!paymentId && !hasSuccessfulPaymentRecord;

  const sectorObj = sectors.find(s => s.id === selectedSector);
  const subSectorObj = allSubSectors.find(s => s.id === selectedSubSector);
  const categoryObj = allCategories.find(c => c.id === selectedCategory);

  // Hydration: load latest draft once when user is available — non-blocking.
  const hasHydratedRef = useRef(false);
  const hasUserInteractedRef = useRef(false);
  const [hydratingDraft, setHydratingDraft] = useState(false);
  useEffect(() => {
    if (hasHydratedRef.current) return;
    if (!user) return;
    hasHydratedRef.current = true;
    // Only hydrate an existing application when the URL explicitly asks
    // for it (?draft=<id> or /applications/<id>/continue). Clicking
    // "New Application" must always start a clean selection flow and
    // must NOT silently auto-load an older draft / in-progress app.
    const targetDraftId = continuedApplicationId || draftIdParam;
    if (!targetDraftId) {
      return;
    }
    setHydratingDraft(true);
    (async () => {
      try {
        const { data: draft } = await supabase
          .from('applications')
          .select('*')
          .eq('applicant_id', user.id)
          .eq('id', targetDraftId)
          .maybeSingle();

        if (draft) {
          const d = ((draft as any).data || {}) as Record<string, any>;
          latestDraftDataRef.current = d;
          setApplicationId((draft as any).id);
          setAppStatus(((draft as any).status || 'draft').toLowerCase());
          if (d.sector_id) setSelectedSector(d.sector_id);
          if (d.sub_sector_id) setSelectedSubSector(d.sub_sector_id);
          if (d.category_id) setSelectedCategory(d.category_id);

          const tmplIds = getDraftTemplateIds(d);
          setHydratedDraftTemplates(await loadDraftTemplatesByIds(tmplIds));
          if (import.meta.env.DEV) {
            console.debug('[NewApplication] hydrate draft', {
              draftId: (draft as any).id,
              savedStep: d.wizard_step,
              urlStep: stepParam,
              formTemplateIds: tmplIds,
              formsDataKeys: Object.keys(d.forms_data || {}),
              formVersionIds: Object.keys(d.form_version_ids || {}),
            });
          }
          if (tmplIds.length > 0) {
            const progress: Record<string, FormProgress> = {};
            tmplIds.forEach(tid => {
              progress[tid] = {
                templateId: tid,
                status: 'not_started',
                data: {},
                versionId: null,
                assignedVersionId: d.form_version_ids?.[tid] || null,
              };
            });
            setFormProgressMap(progress);
          }
          if (d.form_version_ids && typeof d.form_version_ids === 'object') {
            setAssignedVersionByTemplate(d.form_version_ids);
          }

          // Restore wizard step from URL → saved → inferred (with access guard).
          const savedStep = d.wizard_step;
          let hydratedStep: WizardStep | null = null;
          if (isValidWizardStep(stepParam) && canAccessStep(stepParam, d)) {
            hydratedStep = stepParam;
          } else if (isValidWizardStep(savedStep) && canAccessStep(savedStep, d)) {
            hydratedStep = savedStep;
          } else {
            hydratedStep = inferWizardStepFromDraft(d);
          }
          if (hydratedStep === 'filling' && d.last_active_form_template_id) {
            setActiveFormTemplateId(d.last_active_form_template_id);
          }
          setCurrentStep(hydratedStep);

          try {
            await hydratePaymentState((draft as any).id);
          } catch (paymentHydrationError) {
            console.warn('[NewApplication] draft payment hydration failed:', paymentHydrationError);
          }

          try {
            const pinnedVersions = (d.form_version_ids && typeof d.form_version_ids === 'object') ? d.form_version_ids : {};
            const hydratedTemplates = tmplIds
              .map((templateId) => formTemplates.find((template) => template.id === templateId))
              .filter(Boolean) as typeof matchedTemplates;
            if (hydratedTemplates.length > 0) {
              await hydrateFormProgress((draft as any).id, hydratedTemplates, pinnedVersions);
            }
          } catch (formHydrationError) {
            console.warn('[NewApplication] draft form hydration failed:', formHydrationError);
          }

          // Always reflect the loaded draft id + step in the URL so refresh
          // restores the same view.
          const params = new URLSearchParams(window.location.search);
          params.set('draft', (draft as any).id);
          params.set('step', hydratedStep);
          if (continueIdFromPath) params.set('mode', 'continue');
          navigate(`${location.pathname}?${params.toString()}`, { replace: true });
        }
      } catch (err) {
        console.warn('[NewApplication] draft hydration failed:', err);
      } finally {
        setHydratingDraft(false);
      }
    })();
  }, [user?.id, continuedApplicationId, draftIdParam, stepParam, continueIdFromPath, hydrateFormProgress, hydratePaymentState, loadDraftTemplatesByIds, formTemplates, matchedTemplates, navigate, location.pathname]);

  const handleSectorChange = useCallback((val: string) => {
    setSelectedSector(prev => {
      if (val === prev) return prev;
      hasUserInteractedRef.current = true;
      setSelectedSubSector('');
      setSelectedCategory('');
      return val;
    });
  }, []);

  const handleSubSectorChange = useCallback((val: string) => {
    setSelectedSubSector(prev => {
      if (val === prev) return prev;
      hasUserInteractedRef.current = true;
      setSelectedCategory('');
      return val;
    });
  }, []);

  const handleCategoryChange = useCallback((val: string) => {
    setSelectedCategory(prev => {
      if (val === prev) return prev;
      hasUserInteractedRef.current = true;
      return val;
    });
  }, []);

  // ─── Wizard step persistence ──────────────────────────────────────────
  // Source of truth for current step is applications.data.wizard_step so
  // browser refresh restores the user to the same step.
  const isValidWizardStep = (step: any): step is WizardStep =>
    ['selection', 'forms', 'filling', 'documents', 'payment', 'review'].includes(step);

  const computeCompletedSteps = (step: WizardStep): WizardStep[] => {
    switch (step) {
      case 'selection': return [];
      case 'forms': return ['selection'];
      case 'filling': return ['selection', 'forms'];
      case 'documents': return ['selection', 'forms'];
      case 'payment': return ['selection', 'forms', 'documents'];
      case 'review': return ['selection', 'forms', 'documents', 'payment'];
      default: return [];
    }
  };

  const getDraftTemplateIds = useCallback((d?: Record<string, any> | null) => {
    if (!d) return [] as string[];
    if (Array.isArray(d.form_template_ids)) return d.form_template_ids.filter((value): value is string => typeof value === 'string' && value.length > 0);
    return reviewTemplates.map((template) => template.id);
  }, [reviewTemplates]);

  const hasResponseDataForTemplate = useCallback((templateId: string, versionId?: string | null) => {
    const existingResponse = existingFormResponsesRef.current[templateId];
    if (!existingResponse || !hasNonEmptyFormData(existingResponse.response_data || {})) return false;
    return !versionId || !existingResponse.version_id || existingResponse.version_id === versionId;
  }, []);

  const hasSavedFormDataForTemplate = useCallback((templateId: string, draftData?: Record<string, any> | null) => {
    const normalizedDraft = draftData || latestDraftDataRef.current || {};
    const formsData = (normalizedDraft.forms_data || {}) as Record<string, Record<string, any>>;
    const versionIds = (normalizedDraft.form_version_ids || {}) as Record<string, string>;
    const localProgress = formProgressMap[templateId];
    const assignedVersionId = localProgress?.assignedVersionId
      || localProgress?.versionId
      || assignedVersionByTemplate[templateId]
      || versionIds[templateId]
      || null;

    const hasLocalData = hasNonEmptyFormData(localProgress?.data || {})
      && (!assignedVersionId || !localProgress?.versionId || localProgress.versionId === assignedVersionId);
    const hasStoredData = hasNonEmptyFormData(formsData[templateId] || {})
      && (!assignedVersionId || !versionIds[templateId] || versionIds[templateId] === assignedVersionId);
    const hasSavedResponse = hasResponseDataForTemplate(templateId, assignedVersionId);

    return hasLocalData || hasSavedResponse || hasStoredData || !!versionIds[templateId];
  }, [assignedVersionByTemplate, formProgressMap, hasResponseDataForTemplate]);

  const buildReviewProgressMap = useCallback(() => {
    const draftData = latestDraftDataRef.current || {};
    const storedFormsData = (draftData.forms_data || {}) as Record<string, Record<string, any>>;
    const versionIds = (draftData.form_version_ids || {}) as Record<string, string>;
    const next: Record<string, FormProgress> = { ...formProgressMap };

    for (const template of reviewTemplates) {
      const templateId = template.id;
      const local = formProgressMap[templateId];
      const response = existingFormResponsesRef.current[templateId];
      const appStored = storedFormsData[templateId];

      let data: Record<string, any> = {};
      let source: 'local' | 'form_responses' | 'applications.data.forms_data' | 'empty' = 'empty';

      if (hasNonEmptyFormData(local?.data || {})) {
        data = local?.data || {};
        source = 'local';
      } else if (hasNonEmptyFormData(response?.response_data || {})) {
        data = response?.response_data || {};
        source = 'form_responses';
      } else if (hasNonEmptyFormData(appStored || {})) {
        data = appStored || {};
        source = 'applications.data.forms_data';
      }

      if (import.meta.env.DEV) {
        console.debug('[NewApplication] review data source', {
          templateId,
          source,
          keys: Object.keys(data || {}),
        });
      }

      next[templateId] = {
        templateId,
        status: hasNonEmptyFormData(data) ? 'completed' : local?.status || 'not_started',
        data,
        versionId: local?.versionId || response?.version_id || assignedVersionByTemplate[templateId] || versionIds[templateId] || null,
        assignedVersionId: assignedVersionByTemplate[templateId] || versionIds[templateId] || null,
      };
    }

    return next;
  }, [assignedVersionByTemplate, formProgressMap, reviewTemplates]);

  const canAccessStep = (step: WizardStep, d: Record<string, any>): boolean => {
    const hasSelection = !!d.sector_id && !!d.sub_sector_id && !!d.category_id;
    const tmplIds = getDraftTemplateIds(d);
    const formsData = (d.forms_data || {}) as Record<string, any>;
    const versionIds = (d.form_version_ids || {}) as Record<string, string>;
    const hasTemplates = tmplIds.length > 0;
    const hasFormDataFor = (tid: string) => hasSavedFormDataForTemplate(tid, d);
    const hasAnyFormData = tmplIds.some(hasFormDataFor) || Object.keys(versionIds).length > 0;
    const hasAllFormsData = tmplIds.every(hasFormDataFor);
    const hasPaymentSignal = !!d.payment_status || !!d.payment_id;
    const reviewDraftShapeValid = hasSelection && hasTemplates && tmplIds.every((tid) => !!versionIds[tid] || hasSavedFormDataForTemplate(tid, d));

    if (import.meta.env.DEV && step === 'review') {
      console.debug('[NewApplication] canAccess review', {
        templateIds: tmplIds,
        formsDataKeys: Object.keys(formsData || {}),
        formVersionIds: Object.keys(versionIds || {}),
        responseKeys: Object.keys(existingFormResponsesRef.current || {}),
        result: hasAllFormsData || hasPaymentSignal || reviewDraftShapeValid,
      });
    }

    if (step === 'selection') return true;
    if (!hasSelection || !hasTemplates) return false;
    if (step === 'forms' || step === 'filling') return true;
    if (step === 'documents' || step === 'payment') return hasAnyFormData || hasPaymentSignal;
    if (step === 'review') return hasAllFormsData || hasPaymentSignal || reviewDraftShapeValid;
    return false;
  };

  const inferWizardStepFromDraft = (d: Record<string, any>): WizardStep => {
    if (!d.sector_id || !d.sub_sector_id || !d.category_id) return 'selection';
    const tmplIds = getDraftTemplateIds(d);
    if (tmplIds.length === 0) return 'forms';
    const hasAllFormsData = tmplIds.every((templateId) => hasSavedFormDataForTemplate(templateId, d));
    if (!hasAllFormsData) return 'forms';
    if (d.payment_status === 'success') return 'review';
    if (d.payment_status && d.payment_status !== 'success') return 'payment';
    return 'payment';
  };

  const updateWizardUrl = useCallback((draftId: string, step: WizardStep) => {
    const params = new URLSearchParams(window.location.search);
    params.set('draft', draftId);
    params.set('step', step);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [navigate, location.pathname]);

  const persistWizardStep = useCallback(async (
    step: WizardStep,
    extra?: Record<string, any>,
  ) => {
    if (!applicationId) return;
    try {
      const { data: existing, error } = await supabase
        .from('applications')
        .select('data')
        .eq('id', applicationId)
        .maybeSingle();
      if (error) {
        console.warn('[NewApplication] Failed to load application for wizard step persistence', error);
        return;
      }
      const existingData = ((existing as any)?.data || {}) as Record<string, any>;
      const updatedData = {
        ...existingData,
        wizard_step: step,
        completed_steps: computeCompletedSteps(step),
        last_active_form_template_id: step === 'filling' ? activeFormTemplateId : null,
        wizard_updated_at: new Date().toISOString(),
        ...(extra || {}),
      };
      const { error: updateError } = await supabase
        .from('applications')
        .update({ data: updatedData } as any)
        .eq('id', applicationId);
      if (updateError) {
        console.warn('[NewApplication] Failed to persist wizard step', updateError);
      }
    } catch (e) {
      console.warn('[NewApplication] persistWizardStep error', e);
    }
  }, [applicationId, activeFormTemplateId]);

  const goToStep = useCallback(async (
    step: WizardStep,
    extra?: Record<string, any>,
  ) => {
    setCurrentStep(step);
    if (applicationId) {
      updateWizardUrl(applicationId, step);
      await persistWizardStep(step, extra);
    }
  }, [applicationId, persistWizardStep, updateWizardUrl]);

  // Auto-sync URL + draft data whenever step changes for an existing draft.
  useEffect(() => {
    if (!applicationId) return;
    updateWizardUrl(applicationId, currentStep);
    void persistWizardStep(currentStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, currentStep, activeFormTemplateId]);

  const buildDraftPayload = (existing: Record<string, any> | null) => {
    const licenseType = [sectorObj?.name, subSectorObj?.name, categoryObj?.name].filter(Boolean).join(' - ');
    const tmplIds = matchedTemplates.map(t => t.id);
    const tmplIdSet = new Set(tmplIds);

    const prevFormsData = (existing?.forms_data || {}) as Record<string, any>;
    const prevVersionIds = (existing?.form_version_ids || {}) as Record<string, string>;
    const keptFormsData: Record<string, any> = {};
    const keptVersionIds: Record<string, string> = {};
    Object.keys(prevFormsData).forEach(k => { if (tmplIdSet.has(k)) keptFormsData[k] = prevFormsData[k]; });
    Object.keys(prevVersionIds).forEach(k => { if (tmplIdSet.has(k)) keptVersionIds[k] = prevVersionIds[k]; });

    return {
      license_type: licenseType,
      status: 'draft' as const,
      regulator_id: activeRegulator?.id || null,
      data: {
        ...(existing || {}),
        sector_id: selectedSector,
        sub_sector_id: selectedSubSector,
        category_id: selectedCategory,
        sector_name: sectorObj?.name,
        sub_sector_name: subSectorObj?.name,
        category_name: categoryObj?.name,
        form_template_ids: tmplIds,
        forms_data: keptFormsData,
        form_version_ids: keptVersionIds,
      },
    };
  };

  // Upsert (create or update) the draft application
  const upsertDraftApplication = async (): Promise<string | null> => {
    if (!user || !selectedCategory) return null;
    if (applicationId) {
      const { data: existing } = await supabase
        .from('applications')
        .select('data')
        .eq('id', applicationId)
        .maybeSingle();
      const payload = buildDraftPayload((existing as any)?.data || null);
      const { error } = await supabase
        .from('applications')
        .update({
          license_type: payload.license_type,
          regulator_id: payload.regulator_id,
          data: payload.data,
        } as any)
        .eq('id', applicationId);
      if (error) {
        toast.error('Failed to update draft: ' + error.message);
        return null;
      }
      return applicationId;
    } else {
      const payload = buildDraftPayload(null);
      const { data, error } = await supabase
        .from('applications')
        .insert({
          applicant_id: user.id,
          license_type: payload.license_type,
          status: 'draft',
          data: payload.data,
          regulator_id: payload.regulator_id,
        } as any)
        .select()
        .single();
      if (error) {
        toast.error('Failed to create application: ' + error.message);
        return null;
      }
      const newId = (data as any).id as string;
      setApplicationId(newId);
      // `application.created` is written canonically by the DB trigger on
      // public.applications (tg_applications_audit). No frontend log needed.
      return newId;
    }
  };

  // Stable key of matched template ids so auto-save only re-runs when the
  // actual set of applicable templates changes.
  const matchedTemplateIdsKey = useMemo(
    () => matchedTemplates.map(t => t.id).sort().join(','),
    [matchedTemplates]
  );
  const assignedVersionKey = useMemo(
    () => matchedTemplates.map((template) => `${template.id}:${assignedVersionByTemplate[template.id] || ''}`).sort().join('|'),
    [assignedVersionByTemplate, matchedTemplates]
  );

  useEffect(() => {
    if (!applicationId || matchedTemplates.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        await hydrateFormProgress(applicationId, matchedTemplates, assignedVersionByTemplate);
      } catch (err) {
        if (!cancelled) console.warn('[NewApplication] form progress hydration failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId, matchedTemplateIdsKey, assignedVersionKey, hydrateFormProgress]);

  // NOTE: Draft is no longer auto-saved on Sector/Sub-Sector/Category change.
  // It is upserted only when the user clicks "Proceed to Forms" (see handleProceedToForms).
  // This prevents network round-trips and re-renders that caused the page to flicker
  // while the user was still picking their category.

  const handleProceedToForms = async () => {
    if (!selectedCategory) {
      toast.error('Please select all fields');
      return;
    }
    if (matchedTemplates.length === 0) {
      toast.error('No forms available for this category');
      return;
    }

    // ─── Server-side guard (RPC apply_application_guard) ────────────────
    // Single source of truth for: continue-draft / pending-payment redirect /
    // active duplicate block / re-application policy. Mirrored by a DB
    // trigger so direct inserts can't bypass it.
    if (user) {
      let guardRaw: any = null;
      let guardErr: any = null;
      try {
        const res = await (supabase as any).rpc(
          'apply_application_guard',
          {
            _sector_id: selectedSector,
            _sub_sector_id: selectedSubSector || null,
            _category_id: selectedCategory || null,
            _service_id: null,
          },
        );
        guardRaw = res?.data;
        guardErr = res?.error;
      } catch (e) {
        guardErr = e;
      }

      const guard = (guardRaw || {}) as {
        action?: string;
        application_id?: string;
        message?: string;
        code?: string;
      };

      // If we got a structured business response, use it even if an
      // accompanying error was reported (defensive).
      if (!guard.action && guardErr) {
        // Genuine technical failure — log raw error for developers.
        // eslint-disable-next-line no-console
        console.error('[apply_application_guard] technical error:', guardErr);
        toast.error('Could not verify existing applications. Please try again.');
        return;
      }

      if (guard.action === 'continue_draft' && guard.application_id && guard.application_id !== applicationId) {
        toast.info(guard.message || 'Continuing your existing draft for this selection.');
        hasHydratedRef.current = false;
        hasUserInteractedRef.current = false;
        navigate(`/applications/${guard.application_id}/continue?draft=${guard.application_id}&mode=continue`, { replace: true });
        return;
      }
      if (guard.action === 'redirect_payment' && guard.application_id) {
        toast.error(guard.message || 'Please complete payment for your existing application first.');
        navigate(`/applications/${guard.application_id}`);
        return;
      }
      if (guard.action === 'block') {
        const msg = guard.message || 'You already have an active application for this sector, sub-sector, and category. You cannot start a new application until the existing application is finalized.';
        setReappBlocked(true);
        setSectorBlockMessage(msg);
        setBlockedCode(guard.code || null);
        setBlockedExistingAppId(guard.application_id || null);
        toast.error(msg);
        return;
      }
    }

    setSaving(true);
    const appId = await upsertDraftApplication();
    if (appId) {
      // Initialize progress entries only for new templates not already present
      setFormProgressMap(prev => {
        const next = { ...prev };
        matchedTemplates.forEach(t => {
          if (!next[t.id]) {
            next[t.id] = { templateId: t.id, status: 'not_started', data: {} };
          }
        });
        // Drop any progress for templates no longer applicable
        const validIds = new Set(matchedTemplates.map(t => t.id));
        Object.keys(next).forEach(k => { if (!validIds.has(k)) delete next[k]; });
        return next;
      });
      try {
        await hydrateFormProgress(appId, matchedTemplates, assignedVersionByTemplate);
      } catch (formHydrationError) {
        console.warn('[NewApplication] form progress hydration after proceed failed:', formHydrationError);
      }
      await goToStep('forms', { wizard_step: 'forms' });
    }
    setSaving(false);
  };

  const handleStartForm = async (templateId: string) => {
    setActiveFormTemplateId(templateId);
    // Mark as in_progress if not_started
    setFormProgressMap(prev => ({
      ...prev,
      [templateId]: {
        ...prev[templateId],
        status: prev[templateId]?.status === 'completed' ? 'completed' : 'in_progress',
      },
    }));
    await goToStep('filling', { last_active_form_template_id: templateId });
  };

  const handleFormSaveDraft = async (data: Record<string, any>) => {
    if (!activeFormTemplateId) return;
    setFormProgressMap(prev => ({
      ...prev,
      [activeFormTemplateId]: {
        ...prev[activeFormTemplateId],
        status: 'in_progress',
        data,
        versionId: resolvedVersionId,
        assignedVersionId: resolvedVersionId,
      },
    }));
    if (applicationId) {
      setSaving(true);
      try {
        const existingApp = await supabase.from('applications').select('data').eq('id', applicationId).single();
        if (existingApp.error) throw existingApp.error;

        const existingVersionIds = (existingApp.data?.data as any)?.form_version_ids || {};
        const { error: updateError } = await supabase.from('applications').update({
          data: {
            sector_id: selectedSector,
            sub_sector_id: selectedSubSector,
            category_id: selectedCategory,
            sector_name: sectorObj?.name,
            sub_sector_name: subSectorObj?.name,
            category_name: categoryObj?.name,
            form_template_ids: matchedTemplates.map(t => t.id),
            form_version_ids: { ...existingVersionIds, ...(resolvedVersionId ? { [activeFormTemplateId]: resolvedVersionId } : {}) },
            forms_data: { ...Object.fromEntries(Object.entries(formProgressMap).map(([k, v]) => [k, v.data])), [activeFormTemplateId]: data },
          },
        } as any).eq('id', applicationId);
        if (updateError) throw updateError;

        const updatedStatus = await markApplicationInProgressIfDraft(applicationId);
        if (updatedStatus) setAppStatus(updatedStatus);

        await hydrateFormProgress(applicationId, matchedTemplates, {
          ...assignedVersionByTemplate,
          ...(resolvedVersionId ? { [activeFormTemplateId]: resolvedVersionId } : {}),
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['pre-licensee-applications'] }),
          queryClient.invalidateQueries({ queryKey: ['applications'] }),
        ]);
        toast.success('Draft saved');
      } catch (error: any) {
        console.error('[NewApplication] handleFormSaveDraft failed:', error);
        toast.error(error?.message || 'Failed to save draft');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleFormSubmit = async (data: Record<string, any>) => {
    if (!activeFormTemplateId) return;
    setFormProgressMap(prev => ({
      ...prev,
      [activeFormTemplateId]: {
        ...prev[activeFormTemplateId],
        status: 'completed',
        data,
        versionId: resolvedVersionId,
        assignedVersionId: resolvedVersionId,
      },
    }));

    if (applicationId && activeTemplate && resolvedVersionId && user) {
      setSaving(true);
      try {
        // Explicit select → update/insert to avoid PG ON CONFLICT inference
        // failing against the partial unique index on form_responses
        // (entity_id, entity_type, template_id) WHERE entity_id IS NOT NULL.
        const { data: existingResponse, error: existingResponseErr } = await supabase
          .from('form_responses')
          .select('id')
          .eq('entity_id', applicationId)
          .eq('entity_type', 'application')
          .eq('template_id', activeTemplate.id)
          .maybeSingle();
        if (existingResponseErr) throw existingResponseErr;

        if (existingResponse?.id) {
          const { error: updateRespErr } = await supabase
            .from('form_responses')
            .update({
              version_id: resolvedVersionId,
              user_id: user.id,
              response_data: data,
              status: 'draft',
            } as any)
            .eq('id', existingResponse.id);
          if (updateRespErr) throw updateRespErr;
        } else {
          const { error: insertRespErr } = await supabase.from('form_responses').insert({
            template_id: activeTemplate.id,
            version_id: resolvedVersionId,
            user_id: user.id,
            response_data: data,
            status: 'draft',
            entity_type: 'application',
            entity_id: applicationId,
          } as any);
          if (insertRespErr) throw insertRespErr;
        }

        const existingApp2 = await supabase.from('applications').select('data').eq('id', applicationId).single();
        if (existingApp2.error) throw existingApp2.error;

        const existingVersionIds2 = (existingApp2.data?.data as any)?.form_version_ids || {};
        const { error: updateError } = await supabase.from('applications').update({
          data: {
            sector_id: selectedSector,
            sub_sector_id: selectedSubSector,
            category_id: selectedCategory,
            sector_name: sectorObj?.name,
            sub_sector_name: subSectorObj?.name,
            category_name: categoryObj?.name,
            form_template_ids: matchedTemplates.map(t => t.id),
            form_version_ids: { ...existingVersionIds2, [activeFormTemplateId]: resolvedVersionId },
            forms_data: { ...Object.fromEntries(Object.entries(formProgressMap).map(([k, v]) => [k, v.data])), [activeFormTemplateId]: data },
          },
        } as any).eq('id', applicationId);
        if (updateError) throw updateError;

        const updatedStatus = await markApplicationInProgressIfDraft(applicationId);
        if (updatedStatus) setAppStatus(updatedStatus);

        await hydrateFormProgress(applicationId, matchedTemplates, {
          ...assignedVersionByTemplate,
          [activeFormTemplateId]: resolvedVersionId,
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['pre-licensee-applications'] }),
          queryClient.invalidateQueries({ queryKey: ['applications'] }),
        ]);
      } catch (error: any) {
        console.error('[NewApplication] handleFormSubmit failed:', error);
        toast.error(error?.message || 'Failed to save form');
        setSaving(false);
        return;
      }

      setSaving(false);
    }

    toast.success('Form completed!');
    setActiveFormTemplateId(null);
    await goToStep('forms', { last_active_form_template_id: null });
  };

  // Load applicable fees dynamically from Fee Management (single source of truth)
  const loadFees = async () => {
    if (!selectedSector) return;

    // Build precise filter: match sector + optional sub-sector/category, plus global (null sector) fees
    let query = supabase
      .from('fee_configurations')
      .select('*')
      .eq('is_active', true)
      .order('fee_type')
      .order('name');

    // Fetch fees that match the selected hierarchy or are global
    const filters: string[] = [`sector_id.eq.${selectedSector}`, 'sector_id.is.null'];
    query = query.or(filters.join(','));

    const { data: fees } = await query;

    if (fees && fees.length > 0) {
      // Prefer most specific match: category > sub_sector > sector > global
      const ranked = fees
        .map(f => ({
          ...f,
          specificity:
            (f.category_id === selectedCategory ? 4 : 0) +
            (f.sub_sector_id === selectedSubSector ? 2 : 0) +
            (f.sector_id === selectedSector ? 1 : 0),
        }))
        .filter(f =>
          // Exclude fees scoped to a different sub-sector or category
          (!f.sub_sector_id || f.sub_sector_id === selectedSubSector) &&
          (!f.category_id || f.category_id === selectedCategory)
        )
        .sort((a, b) => b.specificity - a.specificity);

      // De-duplicate by fee_type (case-insensitive) – keep the most specific
      const seen = new Set<string>();
      const deduped = ranked.filter(f => {
        const key = (f.fee_type || '').trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Display the fee TYPE (e.g. "Application Fee", "Processing Fee") as the line label,
      // not the configuration's internal name (e.g. "Insurance Pre MLRO").
      const formatFeeType = (t: string) => {
        if (!t) return 'Fee';
        const cleaned = t.replace(/[_-]+/g, ' ').trim();
        const titled = cleaned.replace(/\b\w/g, c => c.toUpperCase());
        return /fee$/i.test(titled) ? titled : `${titled} Fee`;
      };
      const breakdown = deduped.map(f => ({
        name: formatFeeType(f.fee_type),
        amount: Number(f.amount),
        currency: f.currency,
      }));
      setFeeBreakdown(breakdown);
      setFeeAmount(breakdown.reduce((sum, f) => sum + f.amount, 0));
    } else {
      // No fees configured – allow free submission
      setFeeBreakdown([]);
      setFeeAmount(0);
    }
  };

  const handleProceedToPayment = async () => {
    await loadFees();
    if (applicationId) {
      const existing = await hydratePaymentState(applicationId);
        if (existing.successful) {
        toast.info('Payment already completed for this application.');
          await goToStep('review', {
            wizard_step: 'review',
            completed_steps: ['selection', 'forms', 'documents', 'payment'],
          });
        return;
      } else if (existing.pending) {
        toast.info('Payment is already pending for this application.');
      }
    }
    await goToStep('payment', { wizard_step: 'payment' });
  };

  const handleProcessPayment = async () => {
    if (!applicationId || !user) return;
    if (processingPayment) return;

    if (paymentStatus === 'success' || hasSuccessfulPaymentRecord) {
      toast.info('Payment already completed for this application.');
      return;
    }

    setProcessingPayment(true);

    try {
      const existing = await hydratePaymentState(applicationId);
      if (existing.successful) {
        setPaymentStatus('success');
        toast.info('Payment already completed for this application.');
        return;
      }

      const { data: paymentResult, error: paymentResultError } = await (supabase as any).rpc(
        'create_or_get_application_payment',
        { _application_id: applicationId, _amount: feeAmount },
      );
      if (paymentResultError) throw paymentResultError;

      const payment = paymentResult || {};
      const paymentAction = payment.action as string | undefined;
      const paymentRowId = payment.payment_id as string | undefined;
      const paidAmount = Number(payment.amount ?? feeAmount ?? 0);

      if (!paymentRowId) {
        throw new Error('Could not initialize payment for this application.');
      }

      if (paymentAction === 'block') {
        throw new Error((payment.message as string | undefined) || 'Payment could not be processed for this application.');
      }

      if (paymentAction === 'paid' || paymentAction === 'completed') {
        setPaymentId(paymentRowId);
        setPaymentReceiptNumber(payment.receipt_number || payment.transaction_ref || null);
        setPaymentStatus('success');
        setHasSuccessfulPaymentRecord(true);
      } else if (paymentAction === 'pending' || paymentAction === 'created') {
        setPaymentId(paymentRowId);
        setPaymentReceiptNumber(payment.receipt_number || payment.transaction_ref || null);
        setPaymentStatus('pending');

        const { data: completedPaymentResult, error: completedPaymentError } = await (supabase as any).rpc(
          'complete_or_get_application_payment',
          { _application_id: applicationId, _amount: feeAmount },
        );

        if (completedPaymentError) throw completedPaymentError;

        const completedPayment = completedPaymentResult || {};
        const completedAction = completedPayment.action as string | undefined;
        const completedPaymentRowId = completedPayment.payment_id as string | undefined;

        if (!completedPaymentRowId || !['paid', 'completed'].includes(completedAction || '')) {
          throw new Error('Payment could not be completed for this application.');
        }

        setPaymentId(completedPaymentRowId);
        setPaymentReceiptNumber(completedPayment.receipt_number || completedPayment.transaction_ref || null);
        setPaymentStatus('success');
        setHasSuccessfulPaymentRecord(true);
      } else {
        throw new Error('Payment could not be completed for this application.');
      }

      const { data: existingReceipt } = await supabase
        .from('payment_receipts')
        .select('id, receipt_number')
        .eq('payment_id', paymentRowId)
        .maybeSingle();

      if (!existingReceipt) {
        const { data: insertedReceipt } = await supabase
          .from('payment_receipts')
          .insert({
            payment_id: paymentRowId,
            amount: paidAmount,
            issued_to_name: user.fullName || user.email || 'Applicant',
            issued_to_email: user.email,
            fee_breakdown: feeBreakdown,
          } as any)
          .select('receipt_number')
          .maybeSingle();
        setPaymentReceiptNumber((insertedReceipt as any)?.receipt_number || null);
      } else {
        setPaymentReceiptNumber((existingReceipt as any).receipt_number || null);
      }

      // Server-side triggers on `payments` and `payment_receipts` write the
      // canonical `payment.completed` and `payment.receipt_generated` audit
      // rows. No frontend log needed here.

      await hydratePaymentState(applicationId);
      toast.success(paymentAction === 'paid' ? 'Payment already completed for this application.' : 'Payment successful!');
    } catch (err: any) {
      setPaymentStatus('failed');
      await logAudit({
        action: 'payment.failed',
        entityType: 'payment',
        entityId: applicationId || 'unknown',
        newValue: { error: err?.message || 'Unknown error' },
        metadata: { source: 'frontend', application_id: applicationId, error: err?.message || 'Unknown error' },
      }).catch(() => {});
      toast.error('Payment failed: ' + (err.message || 'Unknown error'));
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!applicationId) return;
    const existing = await hydratePaymentState(applicationId);
    if (existing.successful) {
      toast.info('Payment already completed for this application.');
      return;
    }
    if (existing.pending) {
      toast.info('Payment is already pending for this application.');
      return;
    }
    setHasSuccessfulPaymentRecord(false);
    setPaymentStatus('pending');
    setPaymentId(null);
    setPaymentReceiptNumber(null);
  };

  const handleFinalSubmit = async (ackText?: string) => {
    if (!applicationId || !user) return;
    if (!allFormsCompleted) {
      toast.error('Please complete all required forms before submitting.');
      return;
    }
    if (!paymentComplete) {
      toast.error('Please complete payment to submit application.');
      return;
    }

    setSubmitting(true);

    try {
      // Use server-side edge function for secure submission
      const { data, error } = await supabase.functions.invoke('verify-and-submit', {
        body: { application_id: applicationId, ack_text: ackText },
      });

      if (error) {
        toast.error('Submission failed: ' + (error.message || 'Server error'));
        setSubmitting(false);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setSubmitting(false);
        return;
      }

      const submittedStatus = normalizeApplicationStatus(data?.status || 'submitted');
      setAppStatus(submittedStatus);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pre-licensee-applications'] }),
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
      ]);

      toast.success(data?.message || 'Application submitted successfully!');
      navigate(`/applications/${applicationId}`);
    } catch (err: any) {
      toast.error('Submission failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleProceedFromForms = async () => {
    if (!applicationId) return;
    try {
      await hydrateFormProgress(applicationId, matchedTemplates, assignedVersionByTemplate);
    } catch (err) {
      console.warn('[NewApplication] form completion recheck failed:', err);
    }

    const formsReady = matchedTemplates.every((template) => isFormComplete(template.id));
    if (!formsReady) {
      toast.error('Please complete all required forms before continuing.');
      return;
    }

    await goToStep('documents', { wizard_step: 'documents' });
  };

  const getFormStatusBadge = (status: FormStatus) => {
    switch (status) {
      case 'completed':
        return <Badge variant="approved" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      case 'needs_update':
        return <Badge variant="returned" className="gap-1"><RefreshCw className="h-3 w-3" /> Needs Update</Badge>;
      case 'in_progress':
        return <Badge variant="pending" className="gap-1"><Clock className="h-3 w-3" /> In Progress</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Not Started</Badge>;
    }
  };

  const getPaymentStatusBadge = () => {
    switch (paymentStatus) {
      case 'success':
        return <Badge variant="approved" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Paid</Badge>;
      case 'failed':
        return <Badge variant="rejected" className="gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>;
      default:
        return <Badge variant="pending" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
    }
  };

  const handleBack = () => {
    if (currentStep === 'filling') {
      setActiveFormTemplateId(null);
      void goToStep('forms', { last_active_form_template_id: null });
    } else if (currentStep === 'selection') {
      navigate(-1);
    } else {
      const prevIdx = stepIndex - 1;
      if (prevIdx >= 0) void goToStep(WIZARD_STEPS[prevIdx].key);
    }
  };

  return (
    <DashboardLayout>
      {reappBlocked ? (
        <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">Application Already Exists</h2>
          <p className="text-muted-foreground">
            {sectorBlockMessage || 'You already have an application for this sector, sub-sector, and category/service. Re-application is currently not allowed.'}
          </p>
          <div className="flex gap-3 justify-center pt-4 flex-wrap">
            <Button onClick={() => navigate('/applications')}>
              Go to My Applications
            </Button>
            <Button variant="outline" onClick={() => {
              setReappBlocked(false);
              setSectorBlockMessage('');
              setBlockedCode(null);
              setBlockedExistingAppId(null);
            }}>
              Back
            </Button>
          </div>
        </div>
      ) : (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">
               {isContinuingDraft ? 'Continue Application' : 'New License Application'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {currentStep === 'filling'
                ? `Filling: ${activeTemplate?.name || 'Form'}`
                  : isContinuingDraft
                  ? 'Resume where you left off — your saved progress has been loaded.'
                  : `Step ${stepIndex + 1} of ${WIZARD_STEPS.length}: ${WIZARD_STEPS[stepIndex].label}`}
            </p>
          </div>
          {applicationId && (
            <Badge variant="outline" className="font-mono text-xs">
              {getApplicationStatusLabel(appStatus)} · {applicationId.substring(0, 8).toUpperCase()}
            </Badge>
          )}
        </div>

        {hydratingDraft && (
          <Card>
            <CardContent className="py-10">
              <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Restoring your draft...
              </div>
            </CardContent>
          </Card>
        )}

        {/* Persistent banner: shown for the entire continue-draft session,
            not just on the selection step, and survives page reloads since
            it is keyed off the URL ?draft=… param. */}
        {(isContinuingDraft || (!!applicationId && continueModeParam)) && applicationId && !hydratingDraft && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>
              You are continuing an existing draft application. Your saved progress has been loaded.
            </span>
          </div>
        )}

        {/* Step Progress */}
        <div className="space-y-3">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between">
            {WIZARD_STEPS.map((step, i) => {
              const reachable = (() => {
                if (i === 0) return true;
                const target = WIZARD_STEPS[i].key;
                if (target === 'forms') return !!applicationId;
                if (target === 'documents') return allFormsCompleted;
                if (target === 'payment') return allFormsCompleted;
                if (target === 'review') return allFormsCompleted && paymentComplete;
                return false;
              })();
              const isCurrent = i === stepIndex;
              const clickable = reachable && !isCurrent && currentStep !== 'filling';
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => {
                    if (!clickable) return;
                    setActiveFormTemplateId(null);
                    void goToStep(WIZARD_STEPS[i].key);
                  }}
                  disabled={!clickable}
                  className={`flex items-center gap-1.5 text-xs font-medium transition-colors rounded-md px-1 py-0.5 ${
                    i <= stepIndex ? 'text-primary' : 'text-muted-foreground'
                  } ${clickable ? 'cursor-pointer hover:bg-primary/5' : 'cursor-default'}`}
                  aria-label={`Go to step ${i + 1}: ${step.label}`}
                >
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors ${
                    i < stepIndex ? 'bg-primary border-primary text-primary-foreground'
                    : i === stepIndex ? 'border-primary text-primary'
                    : 'border-muted-foreground/30'
                  }`}>
                    {i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.icon}
                  </div>
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 1: Category Selection */}
        {!hydratingDraft && currentStep === 'selection' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Select Licensing Category
              </CardTitle>
              <CardDescription>
                Choose the sector, sub-sector, and category for your license application.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="sector">Sector *</Label>
                <Select value={selectedSector} onValueChange={handleSectorChange}>
                  <SelectTrigger id="sector">
                    <SelectValue placeholder="Select Sector" />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4} className="z-[9999] max-h-[300px] overflow-y-auto bg-popover">
                    {sectors.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subsector">Sub-Sector *</Label>
                <Select value={selectedSubSector} onValueChange={handleSubSectorChange} disabled={!selectedSector}>
                  <SelectTrigger id="subsector">
                    <SelectValue placeholder={selectedSector ? 'Select Sub-Sector' : 'Select a sector first'} />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4} className="z-[9999] max-h-[300px] overflow-y-auto bg-popover">
                    {filteredSubSectors.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={selectedCategory} onValueChange={handleCategoryChange} disabled={!selectedSubSector}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder={selectedSubSector ? 'Select Category' : 'Select a sub-sector first'} />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4} className="z-[9999] max-h-[300px] overflow-y-auto bg-popover">
                    {filteredCategories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Show number of forms available */}
              {selectedCategory && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">
                      {matchedTemplates.length > 0
                        ? `${matchedTemplates.length} mandatory form(s) to complete`
                        : 'No published forms found for this category'}
                    </span>
                  </div>
                  {matchedTemplates.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                      All forms must be completed before submission.
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleProceedToForms} disabled={!selectedCategory || matchedTemplates.length === 0 || saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Proceed to Forms
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Forms List (mandatory all) */}
        {!hydratingDraft && currentStep === 'forms' && (
          <div className="space-y-4">
            {/* Progress Summary */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-foreground">Form Completion Progress</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {completedCount} / {matchedTemplates.length} Completed
                  </span>
                </div>
                <Progress value={matchedTemplates.length > 0 ? (completedCount / matchedTemplates.length) * 100 : 0} className="h-2" />
                {!allFormsCompleted && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Complete all forms below to proceed with your application.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Form Cards */}
            {matchedTemplates.map((tmpl, idx) => {
              const fp = formProgressMap[tmpl.id];
              const status: FormStatus = fp?.status || 'not_started';
              const cardComplete = isFormComplete(tmpl.id);
              return (
                <Card key={tmpl.id} className={`transition-shadow hover:shadow-md ${cardComplete ? 'border-emerald-200 bg-emerald-50/30' : status === 'needs_update' ? 'border-yellow-200 bg-yellow-50/30' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold">
                          {idx + 1}
                        </span>
                        <CardTitle className="text-base">{tmpl.name}</CardTitle>
                      </div>
                      {getFormStatusBadge(status)}
                    </div>
                    {tmpl.description && (
                      <CardDescription className="ml-9">{tmpl.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between ml-9">
                      <div className="flex flex-wrap gap-1.5">
                        {tmpl.sector && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tmpl.sector}</Badge>}
                        {tmpl.category && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tmpl.category}</Badge>}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tmpl.form_type}</Badge>
                      </div>
                      <Button
                        size="sm"
                        variant={cardComplete ? 'outline' : 'default'}
                        onClick={() => handleStartForm(tmpl.id)}
                      >
                        {cardComplete ? (
                          <><CheckCircle2 className="h-4 w-4 mr-1" /> Continue</>
                        ) : status === 'needs_update' ? (
                          <><RefreshCw className="h-4 w-4 mr-1" /> Update</>
                        ) : status === 'in_progress' ? (
                          <><PlayCircle className="h-4 w-4 mr-1" /> Continue</>
                        ) : (
                          <><FileText className="h-4 w-4 mr-1" /> Start</>
                        )}
                      </Button>
                    </div>
                    {assignedVersionByTemplate[tmpl.id] && (
                      <div className="ml-9 mt-2 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                        <Layers className="h-3.5 w-3.5" />
                        <span>Form version assigned for this draft.</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Inline Review (before mandatory final review step) */}
            {reviewSettings?.application_review_enabled && completedCount > 0 && !showInlineReview && (
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setShowInlineReview(true)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Review Entered Data
                </Button>
              </div>
            )}

            {showInlineReview && (
              <div className="space-y-3">
                <ApplicationReviewBuilder
                  templates={reviewTemplates}
                  formProgressMap={buildReviewProgressMap()}
                  versionIdByTemplate={assignedVersionByTemplate}
                  mode={reviewSettings?.review_mode || 'editable'}
                  onAcknowledge={() => setShowInlineReview(false)}
                  onEdit={(idx) => {
                    const tmpl = reviewTemplates[idx];
                    if (tmpl) {
                      setShowInlineReview(false);
                      setActiveFormTemplateId(tmpl.id);
                      void goToStep('filling', { last_active_form_template_id: tmpl.id });
                    }
                  }}
                  title="Review Entered Data"
                  description="Review the data you have entered so far. You can continue editing forms before proceeding."
                />
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setShowInlineReview(false)}>Close Review</Button>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => void goToStep('selection')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button
                onClick={handleProceedFromForms}
                disabled={!allFormsCompleted}
              >
                {allFormsCompleted ? 'Continue' : `Complete all forms (${completedCount}/${matchedTemplates.length})`}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Filling a specific form */}
        {!hydratingDraft && currentStep === 'filling' && activeTemplate && (
          <div className="space-y-3">
            {/* Version badge hidden from applicants */}
            {!resolverMessage && sections.length > 0 ? (
              <FormRenderer
                formName={activeTemplate.name}
                sections={sections}
                initialData={formProgressMap[activeTemplate.id]?.data || {}}
                onSaveDraft={handleFormSaveDraft}
                onSubmit={handleFormSubmit}
                saving={saving}
                applicationId={applicationId || undefined}
              />
            ) : resolverMessage ? (
              <Card>
                <CardHeader>
                  <CardTitle>{activeTemplate.name}</CardTitle>
                  <CardDescription>{resolverMessage}</CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{activeTemplate.name}</CardTitle>
                  <CardDescription>
                    No fields configured for this form. Contact admin to set up the form.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-end">
                    <Button onClick={() => {
                      setFormProgressMap(prev => ({
                        ...prev,
                        [activeTemplate.id]: { ...prev[activeTemplate.id], status: 'completed' },
                      }));
                      setActiveFormTemplateId(null);
                      void goToStep('forms', { last_active_form_template_id: null });
                    }}>
                      Mark Complete & Return
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Step 3: Documents */}
        {!hydratingDraft && currentStep === 'documents' && applicationId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Upload Supporting Documents
              </CardTitle>
              <CardDescription>
                Attach all required documents for your application.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <DocumentUpload
                entityType="application"
                entityId={applicationId}
                onUploaded={() => setDocRefresh(p => p + 1)}
              />
              <div key={docRefresh}>
                <AttachmentList entityType="application" entityId={applicationId} />
              </div>

              <div className="flex justify-between pt-4 border-t">
                <Button variant="outline" onClick={() => void goToStep('forms')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />Back to Forms
                </Button>
                <Button onClick={handleProceedToPayment}>
                  {paymentComplete ? 'View Payment / Continue to Review' : 'Proceed to Payment'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Payment */}
        {!hydratingDraft && currentStep === 'payment' && applicationId && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-primary" />
                      Application Payment
                    </CardTitle>
                    <CardDescription>
                      {paymentComplete
                        ? 'Payment has already been resolved for this application. Review the receipt details and continue to submission.'
                        : 'Complete payment to proceed with submission.'}
                    </CardDescription>
                  </div>
                  {getPaymentStatusBadge()}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Application Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <span className="text-xs font-medium text-muted-foreground">Application ID</span>
                    <p className="text-sm font-mono font-medium mt-1">{applicationId.substring(0, 8).toUpperCase()}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <span className="text-xs font-medium text-muted-foreground">Applicant</span>
                    <p className="text-sm font-medium mt-1">{user?.email || '—'}</p>
                  </div>
                </div>

                {/* Fee Breakdown */}
                <div className="rounded-lg border">
                  <div className="p-4 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm">Fee Breakdown</span>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    {feeBreakdown.length > 0 ? (
                      <>
                        {feeBreakdown.map((fee, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{fee.name}</span>
                            <span className="font-medium">${fee.amount.toFixed(2)}</span>
                          </div>
                        ))}
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Total Amount</span>
                          <span className="text-lg font-bold text-primary">${feeAmount.toFixed(2)}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        No fees configured for this category. You may proceed without payment.
                      </p>
                    )}
                  </div>
                </div>

                {/* Payment Action */}
                {hasReusablePendingPayment && feeAmount > 0 && (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <AlertCircle className="h-8 w-8 text-amber-600 mx-auto" />
                    <h3 className="font-semibold text-amber-800">Payment Pending</h3>
                    <p className="text-sm text-amber-800">Payment is already pending for this application.</p>
                    {paymentId && (
                      <p className="text-xs text-amber-700 font-mono">Reference: {paymentId.substring(0, 8).toUpperCase()}</p>
                    )}
                    {paymentReceiptNumber && (
                      <p className="text-xs text-amber-700 font-mono">Receipt: {paymentReceiptNumber}</p>
                    )}
                    <Button
                      size="lg"
                      onClick={handleProcessPayment}
                      disabled={processingPayment || hasSuccessfulPaymentRecord}
                      className="min-w-[200px]"
                    >
                      {processingPayment ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                      ) : (
                        <><CreditCard className="h-4 w-4 mr-2" /> Complete Payment</>
                      )}
                    </Button>
                  </div>
                )}

                {paymentStatus === 'pending' && feeAmount > 0 && !hasReusablePendingPayment && !hasSuccessfulPaymentRecord && (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <Button
                      size="lg"
                      onClick={handleProcessPayment}
                      disabled={processingPayment || hasSuccessfulPaymentRecord}
                      className="min-w-[200px]"
                    >
                      {processingPayment ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                      ) : (
                        <><CreditCard className="h-4 w-4 mr-2" /> Pay Now</>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Payment is mandatory before final submission.
                    </p>
                  </div>
                )}

                {/* No fees – skip payment */}
                {paymentStatus === 'pending' && feeAmount === 0 && feeBreakdown.length === 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
                    <p className="text-sm text-muted-foreground">No payment required. You can proceed to submit.</p>
                  </div>
                )}

                {paymentStatus === 'success' && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                    <h3 className="font-semibold text-emerald-800">Payment Completed</h3>
                    <p className="text-sm font-medium text-emerald-800">Payment already completed for this application.</p>
                    <p className="text-sm text-emerald-700">
                      Your payment of <strong>${feeAmount.toFixed(2)}</strong> has already been received for this application.
                    </p>
                    {paymentId && (
                      <p className="text-xs text-emerald-600 font-mono">Reference: {paymentId.substring(0, 8).toUpperCase()}</p>
                    )}
                    {paymentReceiptNumber && (
                      <p className="text-xs text-emerald-600 font-mono">Receipt: {paymentReceiptNumber}</p>
                    )}
                  </div>
                )}

                {paymentStatus === 'failed' && (
                  <div className="rounded-lg border border-red-200 bg-red-50/50 p-6 text-center space-y-3">
                    <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
                    <h3 className="font-semibold text-red-800">Payment Failed</h3>
                    <p className="text-sm text-red-700">
                      Something went wrong. Please try again.
                    </p>
                    <Button variant="destructive" onClick={handleRetryPayment}>
                      <RefreshCw className="h-4 w-4 mr-2" /> Retry Payment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => void goToStep('documents')}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
              <Button
                onClick={() => void goToStep('review', { wizard_step: 'review', completed_steps: ['selection', 'forms', 'documents', 'payment'] })}
                disabled={!paymentComplete}
              >
                {paymentComplete ? 'Proceed to Submit' : 'Complete payment first'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Review & Submit */}
        {!hydratingDraft && currentStep === 'review' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Review Your Application</CardTitle>
                <CardDescription>
                  Please review all information before submitting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {applicationId && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Paperclip className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Documents</span>
                    </div>
                    <div className="mt-2">
                      <AttachmentList entityType="application" entityId={applicationId} />
                    </div>
                  </div>
                )}

                {!paymentComplete && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">
                      Please complete payment to submit application.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <ApplicationReviewBuilder
              templates={reviewTemplates}
              formProgressMap={buildReviewProgressMap()}
              versionIdByTemplate={assignedVersionByTemplate}
              mode={reviewSettings?.review_mode || 'readonly'}
              loading={submitting}
              onAcknowledge={() =>
                handleFinalSubmit(
                  'I have reviewed all the information and confirm the details provided are accurate and complete.'
                )
              }
                onEdit={(idx) => {
                  const tmpl = reviewTemplates[idx];
                if (tmpl) {
                  setActiveFormTemplateId(tmpl.id);
                    void goToStep('forms', { last_active_form_template_id: tmpl.id });
                }
              }}
              title="Review Your Application"
              description="Please review all entered information before final submission."
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Sector</span><span className="font-medium">{sectorObj?.name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Sub-Sector</span><span className="font-medium">{subSectorObj?.name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="font-medium">{categoryObj?.name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Forms Completed</span><span className="font-medium">{completedCount}/{matchedTemplates.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span className="font-medium">{paymentStatus === 'success' ? 'Paid' : 'Pending'} (${feeAmount.toFixed(2)})</span></div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-start">
              <Button variant="outline" onClick={() => void goToStep('payment')}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
            </div>
          </div>
        )}
      </div>
      )}
    </DashboardLayout>
  );
}