import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useFormTemplates, useVersionSections, useResolveAppFormVersion } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';

import { GitBranch } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ApplicationReviewBuilder } from '@/components/applications/ApplicationReviewBuilder';
import { markApplicationInProgressIfDraft } from '@/lib/applicationStatus';
import { useReviewSettings } from '@/hooks/useReviewSettings';
import { AttachmentList } from '@/components/shared/AttachmentList';
import { LicenseePaymentPanel } from '@/components/applications/LicenseePaymentPanel';
import { resolveApplicationFeeBreakdown } from '@/lib/applicationFeeBreakdown';
import {
  ArrowLeft, CheckCircle2, FileText, Loader2,
  ClipboardList, Clock, PlayCircle, Send,
} from 'lucide-react';

const buildPostLicenseViewStateKey = (applicationId: string | undefined) =>
  `postLicenseRegistrationCurrentStep:${applicationId || 'unknown'}`;

type FormStatus = 'not_started' | 'in_progress' | 'completed';

interface FormProgress {
  templateId: string;
  status: FormStatus;
  data: Record<string, any>;
  versionId?: string | null;
}

function ActiveFormFiller({
  templateId,
  initialData,
  saving,
  onSaveDraft,
  onSubmit,
  onChange,
  applicationId,
  versionLocked = false,
}: {
  templateId: string;
  initialData: Record<string, any>;
  saving: boolean;
  onSaveDraft: (data: Record<string, any>, versionId: string | null) => Promise<void>;
  onSubmit: (data: Record<string, any>, versionId: string | null) => Promise<void>;
  onChange?: (data: Record<string, any>, versionId: string | null) => void;
  applicationId?: string;
  versionLocked?: boolean;
}) {
  const { data: resolved, isLoading: rLoading, error: rError } = useResolveAppFormVersion(
    applicationId || null,
    templateId,
  );

  const resolvedAny: any = resolved;
  const resolverError: string | null = rError
    ? 'The assigned form version could not be loaded. Please try again or contact support.'
    : (resolvedAny && resolvedAny.error ? resolvedAny.error : null);
  const resolvedVersionId: string | null = (resolvedAny && resolvedAny.version_id) || null;
  const versionLabel: string = (resolvedAny && (resolvedAny.semantic_version || resolvedAny.version_number)) || '';

  const { data: sections = [], isLoading: sLoading } = useVersionSections(resolvedVersionId);

  if (resolverError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          {resolverError}
        </CardContent>
      </Card>
    );
  }

  if (rLoading || sLoading || !resolvedVersionId || sections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading form fields...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <FormRenderer
        formName=""
        sections={sections}
        initialData={initialData}
        onSaveDraft={(d) => onSaveDraft(d, resolvedVersionId)}
        onSubmit={(d) => onSubmit(d, resolvedVersionId)}
        onChange={onChange ? (d) => onChange(d, resolvedVersionId) : undefined}
        saving={saving}
        applicationId={applicationId}
        showFullTabTitles
      />
    </div>
  );
}

export default function PostLicenseApplicationForms() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: allTemplates = [], isLoading: templatesLoading } = useFormTemplates();
  const postLicenseStepStorageKey = buildPostLicenseViewStateKey(applicationId);

  const [appData, setAppData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [formProgressMap, setFormProgressMap] = useState<Record<string, FormProgress>>({});
  const [activeFormTemplateId, setActiveFormTemplateId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(postLicenseStepStorageKey) || null;
    } catch {
      return null;
    }
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const liveFormDataRef = useRef<{ data: Record<string, any>; versionId: string | null } | null>(null);

  const handleLiveChange = (data: Record<string, any>, versionId: string | null) => {
    liveFormDataRef.current = { data, versionId };
  };

  const handleExitActiveForm = async () => {
    const live = liveFormDataRef.current;
    const tid = activeFormTemplateId;
    liveFormDataRef.current = null;
    setActiveFormTemplateId(null);
    if (tid && live && Object.keys(live.data || {}).length > 0) {
      try {
        setFormProgressMap(prev => ({
          ...prev,
          [tid]: {
            ...prev[tid],
            status: prev[tid]?.status === 'completed' ? 'completed' : 'in_progress',
            data: live.data,
            versionId: live.versionId,
          },
        }));
        await persistFormsData(tid, live.data, live.versionId);
        toast.success('Draft saved');
      } catch (err) {
        console.error('[PostLicenseApplicationForms] auto-save on back failed', err);
      }
    }
  };
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [showReview, setShowReview] = useState(() => {
    try {
      return sessionStorage.getItem(`${postLicenseStepStorageKey}:review`) === 'true';
    } catch {
      return false;
    }
  });
  const { data: reviewSettings } = useReviewSettings();

  useEffect(() => {
    try {
      if (activeFormTemplateId) {
        sessionStorage.setItem(postLicenseStepStorageKey, activeFormTemplateId);
      } else {
        sessionStorage.removeItem(postLicenseStepStorageKey);
      }
      sessionStorage.setItem(`${postLicenseStepStorageKey}:review`, String(showReview));
    } catch {
      // noop
    }
  }, [postLicenseStepStorageKey, activeFormTemplateId, showReview]);

  const serviceName = searchParams.get('service') || '';

  // Load application data
  useEffect(() => {
    if (!applicationId) return;
    (async () => {
      const { data } = await supabase
        .from('applications')
        .select('*')
        .eq('id', applicationId)
        .single();
      if (data) {
        setAppData(data);
        const appJson = (data as any).data || {};
        const templateIds: string[] = appJson.form_template_ids || [];
        const formsData: Record<string, any> = appJson.forms_data || {};
        const formVersionIds: Record<string, string> = appJson.form_version_ids || {};
        const initial: Record<string, FormProgress> = {};
        templateIds.forEach(tid => {
          const hasData = formsData[tid] && Object.keys(formsData[tid]).length > 0;
          const formStatus: FormStatus = hasData
            ? ((data as any).status === 'draft' ? 'in_progress' : 'completed')
            : 'not_started';
          initial[tid] = {
            templateId: tid,
            status: formStatus,
            data: formsData[tid] || {},
            versionId: formVersionIds[tid] || null,
          };
        });
        setFormProgressMap(initial);
      }
      setLoading(false);
    })();
  }, [applicationId]);

  const matchedTemplates = useMemo(() => {
    if (!appData) return [];
    const appJson = (appData as any).data || {};
    const storedIds: string[] = appJson.form_template_ids || [];

    if (storedIds.length > 0) {
      return allTemplates.filter(t => storedIds.includes(t.id));
    }

    // Fallback: match by service
    const published = allTemplates.filter(t => t.status === 'published' && t.form_type === 'post_license');
    if (serviceName) {
      const serviceId = appJson.service_id;
      if (serviceId) {
        const byService = published.filter(t => t.service_id === serviceId);
        if (byService.length > 0) return byService;
      }
      return published.filter(t => t.service === serviceName);
    }
    const subId = appJson.sub_sector_id;
    const secId = appJson.sector_id;
    if (subId) {
      const bySub = published.filter(t => t.sub_sector_id === subId);
      if (bySub.length > 0) return bySub;
    }
    if (secId) {
      return published.filter(t => t.sector_id === secId);
    }
    return [];
  }, [appData, allTemplates, serviceName]);

  const completedCount = matchedTemplates.filter(t => formProgressMap[t.id]?.status === 'completed').length;
  const allFormsCompleted = matchedTemplates.length > 0 && completedCount === matchedTemplates.length;
  const activeTemplate = matchedTemplates.find(t => t.id === activeFormTemplateId) || null;

  useEffect(() => {
    if (!applicationId || !allFormsCompleted) {
      setPaymentReady(false);
      setPaymentChecking(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setPaymentChecking(true);
      try {
        const [resolvedFees, payRes] = await Promise.all([
          resolveApplicationFeeBreakdown(applicationId),
          supabase
            .from('payments')
            .select('status')
            .eq('application_id', applicationId)
            .order('created_at', { ascending: false }),
        ]);

        if (cancelled) return;

        const totalDue = resolvedFees.reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
        const hasSuccessfulPayment = (payRes.data || []).some((payment: any) =>
          ['success', 'paid', 'completed'].includes(String(payment?.status || '').toLowerCase()),
        );

        setPaymentReady(totalDue <= 0 || hasSuccessfulPayment);
      } finally {
        if (!cancelled) setPaymentChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applicationId, allFormsCompleted]);

  const getFormStatusBadge = (status: FormStatus) => {
    switch (status) {
      case 'completed':
        return <Badge variant="approved" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      case 'in_progress':
        return <Badge variant="pending" className="gap-1"><Clock className="h-3 w-3" /> In Progress</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Not Started</Badge>;
    }
  };

  const handleStartForm = (templateId: string) => {
    setActiveFormTemplateId(templateId);
    setFormProgressMap(prev => ({
      ...prev,
      [templateId]: {
        ...prev[templateId],
        status: prev[templateId]?.status === 'completed' ? 'completed' : 'in_progress',
      },
    }));
  };

  const persistFormsData = async (
    templateId: string,
    data: Record<string, any>,
    versionId: string | null,
  ) => {
    if (!applicationId || !appData) return;
    const appJson = (appData as any).data || {};
    const existingFormsData = appJson.forms_data || {};
    const existingVersionIds = appJson.form_version_ids || {};
    const updatedFormsData = { ...existingFormsData, [templateId]: data };
    const updatedVersionIds = versionId
      ? { ...existingVersionIds, [templateId]: versionId }
      : existingVersionIds;
    await supabase.from('applications').update({
      data: { ...appJson, forms_data: updatedFormsData, form_version_ids: updatedVersionIds },
    } as any).eq('id', applicationId);
    await markApplicationInProgressIfDraft(applicationId);
    setAppData((prev: any) => ({
      ...prev,
      status: prev?.status === 'draft' ? 'in_progress' : prev?.status,
      data: { ...appJson, forms_data: updatedFormsData, form_version_ids: updatedVersionIds },
    }));
  };

  const handleFormSaveDraft = async (data: Record<string, any>, versionId: string | null) => {
    if (!activeFormTemplateId) return;
    setSaving(true);
    setFormProgressMap(prev => ({
      ...prev,
      [activeFormTemplateId]: { ...prev[activeFormTemplateId], status: 'in_progress', data, versionId },
    }));
    await persistFormsData(activeFormTemplateId, data, versionId);
    toast.success('Draft saved');
    setSaving(false);
  };

  const handleFormSubmit = async (data: Record<string, any>, versionId: string | null) => {
    if (!activeFormTemplateId) return;
    setSaving(true);
    setFormProgressMap(prev => ({
      ...prev,
      [activeFormTemplateId]: { ...prev[activeFormTemplateId], status: 'completed', data, versionId },
    }));
    await persistFormsData(activeFormTemplateId, data, versionId);
    toast.success('Form completed!');
    setActiveFormTemplateId(null);
    setSaving(false);
  };

  const handleSubmitApplication = async () => {
    if (!applicationId || !allFormsCompleted) return;
    if (paymentChecking) return;
    if (!paymentReady) {
      toast.error('Complete payment before submitting this application.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-and-submit', {
        body: { application_id: applicationId },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      try {
        sessionStorage.removeItem(postLicenseStepStorageKey);
        sessionStorage.removeItem(`${postLicenseStepStorageKey}:review`);
      } catch {
        // noop
      }
      toast.success(data?.message || 'Application submitted successfully!');
      navigate(`/applications/${applicationId}`);
    } catch (err: any) {
      toast.error('Submission failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || templatesLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (activeFormTemplateId && activeTemplate) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setActiveFormTemplateId(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">{activeTemplate.name}</h1>
              <p className="text-muted-foreground text-sm">Complete this form and submit</p>
            </div>
          </div>
          <ActiveFormFiller
            templateId={activeTemplate.id}
            initialData={formProgressMap[activeTemplate.id]?.data || {}}
            saving={saving}
            onSaveDraft={handleFormSaveDraft}
            onSubmit={handleFormSubmit}
            applicationId={applicationId}
            versionLocked={formProgressMap[activeTemplate.id]?.status === 'completed'}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Application Forms</h1>
            <p className="text-muted-foreground">Application ID: {applicationId?.substring(0, 8).toUpperCase()}</p>
          </div>
        </div>

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
                Complete all forms below to submit your application.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Uploaded Documents (visible to applicant + admin) */}
        {applicationId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Uploaded Documents
              </CardTitle>
              <CardDescription>All documents attached to this application — including those uploaded inside form fields.</CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentList
                entityType="application"
                entityId={applicationId}
                includeFormFields
                emptyText="No documents uploaded yet. Documents you attach inside form fields will appear here."
              />
            </CardContent>
          </Card>
        )}

        {matchedTemplates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No published forms have been configured for this application yet.
          </div>
        ) : (
          <>
            {matchedTemplates.map((tmpl, idx) => {
              const fp = formProgressMap[tmpl.id];
              const status: FormStatus = fp?.status || 'not_started';
              return (
                <Card key={tmpl.id} className={`transition-shadow hover:shadow-md ${status === 'completed' ? 'border-emerald-200 bg-emerald-50/30' : ''}`}>
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
                        {tmpl.service && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tmpl.service}</Badge>}
                      </div>
                      <Button
                        size="sm"
                        variant={status === 'completed' ? 'outline' : 'default'}
                        onClick={() => handleStartForm(tmpl.id)}
                      >
                        {status === 'completed' ? (
                          <><CheckCircle2 className="h-4 w-4 mr-1" /> Review</>
                        ) : status === 'in_progress' ? (
                          <><PlayCircle className="h-4 w-4 mr-1" /> Continue</>
                        ) : (
                          <><FileText className="h-4 w-4 mr-1" /> Start</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {applicationId && allFormsCompleted && (
              <LicenseePaymentPanel
                applicationId={applicationId}
                canPay={['draft', 'in_progress'].includes((appData?.status || '').toLowerCase())}
                onPaid={() => setPaymentReady(true)}
              />
            )}

            {!showReview && completedCount > 0 && !allFormsCompleted && (
              <div className="flex justify-end pt-4 border-t">
                <Button size="lg" variant="outline" onClick={() => setShowReview(true)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Review Entered Data
                </Button>
              </div>
            )}

            {allFormsCompleted && !showReview && (
              <div className="flex justify-end pt-4 border-t gap-2">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setShowReview(true)}
                  disabled={submitting || paymentChecking || !paymentReady}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Review & Submit
                </Button>
                {reviewSettings?.application_review_enabled === false && (
                  <Button size="lg" onClick={handleSubmitApplication} disabled={submitting || paymentChecking || !paymentReady}>
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" /> Submit Application</>
                    )}
                  </Button>
                )}
              </div>
            )}

            {(allFormsCompleted || completedCount > 0) && showReview && (
              <div className="space-y-4 pt-4 border-t">
                <ApplicationReviewBuilder
                  templates={matchedTemplates.map(t => ({ id: t.id, name: t.name }))}
                  formProgressMap={formProgressMap}
                  versionIdByTemplate={{
                    ...((appData?.data?.form_version_ids || {}) as Record<string, string>),
                    ...(Object.fromEntries(
                      Object.entries(formProgressMap).flatMap(([templateId, progress]) => (
                        progress?.versionId ? [[templateId, progress.versionId]] : []
                      ))
                    ) as Record<string, string>),
                  }}
                  mode={reviewSettings?.review_mode || 'readonly'}
                  loading={submitting}
                  onEdit={(idx) => {
                    const tmpl = matchedTemplates[idx];
                    if (tmpl) {
                      setShowReview(false);
                      setActiveFormTemplateId(tmpl.id);
                    }
                  }}
                  title="Review Your Application"
                  description="Please review all entered information before final submission."
                  onAcknowledge={paymentReady ? handleSubmitApplication : () => toast.error('Complete payment before submitting this application.')}
                />
                <div className="flex justify-start">
                  <Button variant="outline" onClick={() => setShowReview(false)}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to Forms
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
