import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useFormTemplates, useLatestPublishedVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ApplicationReviewBuilder } from '@/components/applications/ApplicationReviewBuilder';
import { useReviewSettings } from '@/hooks/useReviewSettings';
import {
  ArrowLeft, CheckCircle2, FileText, Loader2,
  ClipboardList, Clock, PlayCircle, Send,
} from 'lucide-react';

type FormStatus = 'not_started' | 'in_progress' | 'completed';

interface FormProgress {
  templateId: string;
  status: FormStatus;
  data: Record<string, any>;
}

function ActiveFormFiller({
  templateId,
  initialData,
  saving,
  onSaveDraft,
  onSubmit,
  applicationId,
}: {
  templateId: string;
  initialData: Record<string, any>;
  saving: boolean;
  onSaveDraft: (data: Record<string, any>) => Promise<void>;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  applicationId?: string;
}) {
  const { data: publishedVersion } = useLatestPublishedVersion(templateId);
  const { data: sections = [] } = useVersionSections(publishedVersion?.id || null);

  if (!publishedVersion || sections.length === 0) {
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
    <FormRenderer
      formName=""
      sections={sections}
      initialData={initialData}
      onSaveDraft={onSaveDraft}
      onSubmit={onSubmit}
      saving={saving}
      applicationId={applicationId}
      showFullTabTitles
    />
  );
}

export default function PostLicenseApplicationForms() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: allTemplates = [], isLoading: templatesLoading } = useFormTemplates();

  const [appData, setAppData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [formProgressMap, setFormProgressMap] = useState<Record<string, FormProgress>>({});
  const [activeFormTemplateId, setActiveFormTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const { data: reviewSettings } = useReviewSettings();

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
        const initial: Record<string, FormProgress> = {};
        templateIds.forEach(tid => {
          const hasData = formsData[tid] && Object.keys(formsData[tid]).length > 0;
          initial[tid] = {
            templateId: tid,
            status: hasData ? 'completed' : 'not_started',
            data: formsData[tid] || {},
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

  const persistFormsData = async (templateId: string, data: Record<string, any>) => {
    if (!applicationId || !appData) return;
    const appJson = (appData as any).data || {};
    const existingFormsData = appJson.forms_data || {};
    const updatedFormsData = { ...existingFormsData, [templateId]: data };
    await supabase.from('applications').update({
      data: { ...appJson, forms_data: updatedFormsData },
    } as any).eq('id', applicationId);
    setAppData((prev: any) => ({
      ...prev,
      data: { ...appJson, forms_data: updatedFormsData },
    }));
  };

  const handleFormSaveDraft = async (data: Record<string, any>) => {
    if (!activeFormTemplateId) return;
    setSaving(true);
    setFormProgressMap(prev => ({
      ...prev,
      [activeFormTemplateId]: { ...prev[activeFormTemplateId], status: 'in_progress', data },
    }));
    await persistFormsData(activeFormTemplateId, data);
    toast.success('Draft saved');
    setSaving(false);
  };

  const handleFormSubmit = async (data: Record<string, any>) => {
    if (!activeFormTemplateId) return;
    setSaving(true);
    setFormProgressMap(prev => ({
      ...prev,
      [activeFormTemplateId]: { ...prev[activeFormTemplateId], status: 'completed', data },
    }));
    await persistFormsData(activeFormTemplateId, data);
    toast.success('Form completed!');
    setActiveFormTemplateId(null);
    setSaving(false);
  };

  const handleSubmitApplication = async () => {
    if (!applicationId || !allFormsCompleted) return;
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

            {allFormsCompleted && !showReview && (
              <div className="flex justify-end pt-4 border-t">
                <Button
                  size="lg"
                  onClick={() => {
                    if (reviewSettings?.application_review_enabled) {
                      setShowReview(true);
                    } else {
                      handleSubmitApplication();
                    }
                  }}
                  disabled={submitting}
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                  ) : reviewSettings?.application_review_enabled ? (
                    <><CheckCircle2 className="h-4 w-4 mr-2" /> Review & Submit</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> Submit Application</>
                  )}
                </Button>
              </div>
            )}

            {allFormsCompleted && showReview && (
              <div className="space-y-4 pt-4 border-t">
                <ApplicationReviewBuilder
                  templates={matchedTemplates.map(t => ({ id: t.id, name: t.name }))}
                  formProgressMap={formProgressMap}
                  mode={reviewSettings?.review_mode || 'readonly'}
                  loading={submitting}
                  onAcknowledge={handleSubmitApplication}
                  onEdit={(idx) => {
                    const tmpl = matchedTemplates[idx];
                    if (tmpl) {
                      setShowReview(false);
                      setActiveFormTemplateId(tmpl.id);
                    }
                  }}
                  title="Review Your Application"
                  description="Please review all entered information before final submission."
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
