import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useFormTemplates, useLatestPublishedVersion, useVersionSections, useActiveVersions } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitBranch, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ApplicationReviewBuilder } from '@/components/applications/ApplicationReviewBuilder';
import { useReviewSettings } from '@/hooks/useReviewSettings';
import { AttachmentList } from '@/components/shared/AttachmentList';
import {
  ArrowLeft, ArrowRight, CheckCircle2, FileText, Loader2,
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
  pinnedVersionId,
  onVersionChange,
  versionLocked = false,
  allowVersionSwitching = false,
}: {
  templateId: string;
  initialData: Record<string, any>;
  saving: boolean;
  onSaveDraft: (data: Record<string, any>, versionId: string | null) => Promise<void>;
  onSubmit: (data: Record<string, any>, versionId: string | null) => Promise<void>;
  applicationId?: string;
  pinnedVersionId?: string | null;
  onVersionChange?: (versionId: string) => void;
  versionLocked?: boolean;
  allowVersionSwitching?: boolean;
}) {
  const { data: publishedVersion } = useLatestPublishedVersion(templateId);
  const { data: activeVersions = [] } = useActiveVersions(templateId);

  const defaultVersionId = pinnedVersionId
    || activeVersions[0]?.id
    || publishedVersion?.id
    || null;
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(defaultVersionId);

  useEffect(() => {
    if (!selectedVersionId && defaultVersionId) setSelectedVersionId(defaultVersionId);
  }, [defaultVersionId, selectedVersionId]);

  const { data: sections = [] } = useVersionSections(selectedVersionId);

  if (!selectedVersionId || sections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading form fields...
        </CardContent>
      </Card>
    );
  }

  const showSwitcher = activeVersions.length > 1 && !versionLocked && (!pinnedVersionId || allowVersionSwitching);
  const showVersionBar = showSwitcher || pinnedVersionId || versionLocked;

  return (
    <div className="space-y-3">
      {showVersionBar && (
        <div className="flex items-center gap-2 flex-wrap rounded-md border bg-muted/30 px-3 py-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Form version:</span>
          {showSwitcher ? (
            <Select
              value={selectedVersionId || ''}
              onValueChange={(v) => { setSelectedVersionId(v); onVersionChange?.(v); }}
            >
              <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeVersions.map((v: any) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    v{v.semantic_version || v.version}{v.id === activeVersions[0]?.id ? ' (latest)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              v{(activeVersions.find((v: any) => v.id === selectedVersionId) as any)?.semantic_version
                || (activeVersions.find((v: any) => v.id === selectedVersionId) as any)?.version
                || ''}
            </Badge>
          )}
          {versionLocked ? (
            <span className="text-[11px] text-muted-foreground">Form completed — version is locked.</span>
          ) : pinnedVersionId && !allowVersionSwitching ? (
            <span className="text-[11px] text-muted-foreground">Locked to the version this draft was started on.</span>
          ) : showSwitcher ? (
            <span className="text-[11px] text-muted-foreground">Choose which version to file against.</span>
          ) : null}
        </div>
      )}
      <FormRenderer
        formName=""
        sections={sections}
        initialData={initialData}
        onSaveDraft={(d) => onSaveDraft(d, selectedVersionId)}
        onSubmit={(d) => onSubmit(d, selectedVersionId)}
        saving={saving}
        applicationId={applicationId}
        showFullTabTitles
      />
    </div>
  );
}

function FormCardVersionPicker({
  templateId,
  selectedVersionId,
  onChange,
  locked = false,
}: {
  templateId: string;
  selectedVersionId?: string | null;
  onChange: (versionId: string) => void;
  locked?: boolean;
}) {
  const { data: activeVersions = [] } = useActiveVersions(templateId);
  if (activeVersions.length === 0) return null;
  const value = selectedVersionId || activeVersions[0]?.id || '';
  const single = activeVersions.length === 1;
  const disabled = single || locked;
  return (
    <div className="ml-9 mt-2 flex items-center gap-2 flex-wrap">
      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground">Form version:</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {activeVersions.map((v: any) => (
            <SelectItem key={v.id} value={v.id} className="text-xs">
              v{v.semantic_version || v.version}{v.id === activeVersions[0]?.id ? ' (latest)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {locked ? (
        <span className="text-[10px] text-muted-foreground">Form completed — version is locked.</span>
      ) : !single && (
        <span className="text-[10px] text-muted-foreground">Choose which version to file against.</span>
      )}
    </div>
  );
}

export default function ApplicationForms() {
  const { applicationId } = useParams<{ applicationId: string }>();
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
          const formStatus: FormStatus = hasData
            ? ((data as any).status === 'draft' ? 'in_progress' : 'completed')
            : 'not_started';
          initial[tid] = {
            templateId: tid,
            status: formStatus,
            data: formsData[tid] || {},
          };
        });
        setFormProgressMap(initial);
      }
      setLoading(false);
    })();
  }, [applicationId]);

  // Matched templates from application data or dynamic matching
  const matchedTemplates = useMemo(() => {
    if (!appData) return [];
    const appJson = (appData as any).data || {};
    const storedIds: string[] = appJson.form_template_ids || [];

    if (storedIds.length > 0) {
      return allTemplates.filter(t => storedIds.includes(t.id));
    }

    // Fallback: dynamic matching by category/sub-sector/sector
    const catId = appJson.category_id;
    const subId = appJson.sub_sector_id;
    const secId = appJson.sector_id;
    const published = allTemplates.filter(t => t.status === 'published' && (t.form_type === 'pre_license' || t.form_type === 'application'));
    if (catId) {
      const byCategory = published.filter(t => t.category_id === catId);
      if (byCategory.length > 0) return byCategory;
    }
    if (subId) {
      const bySub = published.filter(t => t.sub_sector_id === subId && !t.category_id);
      if (bySub.length > 0) return bySub;
    }
    if (secId) {
      return published.filter(t => t.sector_id === secId && !t.sub_sector_id && !t.category_id);
    }
    return [];
  }, [appData, allTemplates]);

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

  const persistFormsData = async (
    templateId: string,
    data: Record<string, any>,
    markCompleted: boolean,
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
      data: {
        ...appJson,
        forms_data: updatedFormsData,
        form_version_ids: updatedVersionIds,
      },
    } as any).eq('id', applicationId);

    setAppData((prev: any) => ({
      ...prev,
      data: { ...appJson, forms_data: updatedFormsData, form_version_ids: updatedVersionIds },
    }));
  };

  const handleFormSaveDraft = async (data: Record<string, any>, versionId: string | null) => {
    if (!activeFormTemplateId) return;
    setSaving(true);
    setFormProgressMap(prev => ({
      ...prev,
      [activeFormTemplateId]: { ...prev[activeFormTemplateId], status: 'in_progress', data },
    }));
    await persistFormsData(activeFormTemplateId, data, false, versionId);
    toast.success('Draft saved');
    setSaving(false);
  };

  const handleFormSubmit = async (data: Record<string, any>, versionId: string | null) => {
    if (!activeFormTemplateId) return;
    setSaving(true);
    setFormProgressMap(prev => ({
      ...prev,
      [activeFormTemplateId]: { ...prev[activeFormTemplateId], status: 'completed', data },
    }));
    await persistFormsData(activeFormTemplateId, data, true, versionId);
    toast.success('Form completed!');
    setActiveFormTemplateId(null);
    setSaving(false);
  };

  const handleVersionPin = async (templateId: string, versionId: string) => {
    if (!applicationId || !appData) return;
    const appJson = (appData as any).data || {};
    const existingVersionIds = appJson.form_version_ids || {};
    if (existingVersionIds[templateId] === versionId) return;
    const updatedVersionIds = { ...existingVersionIds, [templateId]: versionId };
    await supabase.from('applications').update({
      data: { ...appJson, form_version_ids: updatedVersionIds },
    } as any).eq('id', applicationId);
    setAppData((prev: any) => ({
      ...prev,
      data: { ...appJson, form_version_ids: updatedVersionIds },
    }));
  };

  const handleSubmitApplication = async () => {
    if (!applicationId || !allFormsCompleted) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-and-submit', {
        body: { application_id: applicationId },
      });
      if (error) {
        const errMsg = typeof error === 'object' && error.message ? error.message : String(error);
        toast.error(errMsg || 'Submission failed');
        return;
      }
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

  // Filling a specific form
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
            pinnedVersionId={(appData as any)?.data?.form_version_ids?.[activeTemplate.id] || null}
            onVersionChange={(vid) => handleVersionPin(activeTemplate.id, vid)}
            versionLocked={formProgressMap[activeTemplate.id]?.status === 'completed'}
            allowVersionSwitching={appData?.status === 'draft'}
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
            No forms have been configured for this application type yet.
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
                        {tmpl.category && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tmpl.category}</Badge>}
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
                    {appData?.status === 'draft' && (
                      <FormCardVersionPicker
                        templateId={tmpl.id}
                        selectedVersionId={(appData as any)?.data?.form_version_ids?.[tmpl.id] || null}
                        onChange={(v) => handleVersionPin(tmpl.id, v)}
                        locked={status === 'completed'}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Review button - always available in edit mode whenever any form has data */}
            {!showReview && completedCount > 0 && !allFormsCompleted && (
              <div className="flex justify-end pt-4 border-t">
                <Button size="lg" variant="outline" onClick={() => setShowReview(true)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Review Entered Data
                </Button>
              </div>
            )}

            {/* Submit / Review buttons - visible when all forms are completed */}
            {allFormsCompleted && !showReview && (
              <div className="flex justify-end pt-4 border-t gap-2">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setShowReview(true)}
                  disabled={submitting}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Review & Submit
                </Button>
                {reviewSettings?.application_review_enabled === false && (
                  <Button size="lg" onClick={handleSubmitApplication} disabled={submitting}>
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
