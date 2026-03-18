import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSectors, useSubSectors, useCategories } from '@/hooks/useMasterConfig';
import { useFormTemplates, useLatestPublishedVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { useAuth } from '@/contexts/AuthContext';
import { useRegulator } from '@/contexts/RegulatorContext';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DocumentList } from '@/components/documents/DocumentList';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, CheckCircle2, FileText, Upload, Loader2,
  Building2, Layers, Tag, ClipboardList, Paperclip, Send,
} from 'lucide-react';

type WizardStep = 'selection' | 'form' | 'documents' | 'review';

const WIZARD_STEPS: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
  { key: 'selection', label: 'Select Category', icon: <Layers className="h-4 w-4" /> },
  { key: 'form', label: 'Fill Application', icon: <ClipboardList className="h-4 w-4" /> },
  { key: 'documents', label: 'Upload Documents', icon: <Paperclip className="h-4 w-4" /> },
  { key: 'review', label: 'Review & Submit', icon: <Send className="h-4 w-4" /> },
];

export default function NewApplication() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeRegulator } = useRegulator();
  const [currentStep, setCurrentStep] = useState<WizardStep>('selection');
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedSubSector, setSelectedSubSector] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [docRefresh, setDocRefresh] = useState(0);

  const { data: sectors = [] } = useSectors();
  const { data: allSubSectors = [] } = useSubSectors();
  const { data: allCategories = [] } = useCategories();
  const { data: formTemplates = [] } = useFormTemplates(undefined, activeRegulator?.id);

  const filteredSubSectors = allSubSectors.filter(s => s.sector_id === selectedSector);
  const filteredCategories = allCategories.filter(c => c.sub_sector_id === selectedSubSector);

  // Find matching form template for the selected category
  const matchedTemplate = useMemo(() => {
    if (!selectedCategory) return null;
    const catObj = allCategories.find(c => c.id === selectedCategory);
    const subObj = allSubSectors.find(s => s.id === selectedSubSector);
    const secObj = sectors.find(s => s.id === selectedSector);
    if (!catObj || !subObj || !secObj) return null;

    return formTemplates.find(t =>
      t.status === 'published' &&
      (t.form_type === 'pre_license' || t.form_type === 'application') &&
      (t.category === catObj.name || t.sector === secObj.name)
    ) || formTemplates.find(t =>
      t.status === 'published' &&
      (t.form_type === 'pre_license' || t.form_type === 'application')
    ) || null;
  }, [selectedCategory, formTemplates, allCategories, allSubSectors, sectors, selectedSubSector, selectedSector]);

  const { data: publishedVersion } = useLatestPublishedVersion(matchedTemplate?.id || null);
  const { data: sections = [] } = useVersionSections(publishedVersion?.id || null);

  const stepIndex = WIZARD_STEPS.findIndex(s => s.key === currentStep);
  const progress = ((stepIndex + 1) / WIZARD_STEPS.length) * 100;

  const sectorObj = sectors.find(s => s.id === selectedSector);
  const subSectorObj = allSubSectors.find(s => s.id === selectedSubSector);
  const categoryObj = allCategories.find(c => c.id === selectedCategory);

  const handleSectorChange = (val: string) => {
    setSelectedSector(val);
    setSelectedSubSector('');
    setSelectedCategory('');
  };

  const handleSubSectorChange = (val: string) => {
    setSelectedSubSector(val);
    setSelectedCategory('');
  };

  // Create draft application when moving to form step
  const createDraftApplication = async () => {
    if (!user || !selectedCategory) return null;
    const licenseType = [sectorObj?.name, subSectorObj?.name, categoryObj?.name].filter(Boolean).join(' - ');

    const { data, error } = await supabase
      .from('applications')
      .insert({
        applicant_id: user.id,
        license_type: licenseType,
        status: 'draft',
        data: {
          sector_id: selectedSector,
          sub_sector_id: selectedSubSector,
          category_id: selectedCategory,
          sector_name: sectorObj?.name,
          sub_sector_name: subSectorObj?.name,
          category_name: categoryObj?.name,
          form_template_id: matchedTemplate?.id || null,
          form_version_id: publishedVersion?.id || null,
        },
        regulator_id: activeRegulator?.id || null,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error('Failed to create application: ' + error.message);
      return null;
    }

    await logAudit({
      action: 'application_created',
      entityType: 'application',
      entityId: (data as any).id,
      newValue: { license_type: licenseType, sector: sectorObj?.name, category: categoryObj?.name },
    });

    return (data as any).id as string;
  };

  const handleProceedToForm = async () => {
    if (!selectedCategory) {
      toast.error('Please select all fields');
      return;
    }

    setSaving(true);
    const appId = await createDraftApplication();
    if (appId) {
      setApplicationId(appId);
      setCurrentStep('form');
    }
    setSaving(false);
  };

  const handleFormSaveDraft = async (data: Record<string, any>) => {
    setFormData(data);
    if (!applicationId) return;
    setSaving(true);
    await supabase.from('applications').update({
      data: {
        sector_id: selectedSector,
        sub_sector_id: selectedSubSector,
        category_id: selectedCategory,
        sector_name: sectorObj?.name,
        sub_sector_name: subSectorObj?.name,
        category_name: categoryObj?.name,
        form_template_id: matchedTemplate?.id || null,
        form_version_id: publishedVersion?.id || null,
        form_data: data,
      },
    } as any).eq('id', applicationId);
    toast.success('Draft saved');
    setSaving(false);
  };

  const handleFormSubmit = async (data: Record<string, any>) => {
    setFormData(data);
    if (!applicationId) return;
    setSaving(true);
    await supabase.from('applications').update({
      data: {
        sector_id: selectedSector,
        sub_sector_id: selectedSubSector,
        category_id: selectedCategory,
        sector_name: sectorObj?.name,
        sub_sector_name: subSectorObj?.name,
        category_name: categoryObj?.name,
        form_template_id: matchedTemplate?.id || null,
        form_version_id: publishedVersion?.id || null,
        form_data: data,
      },
    } as any).eq('id', applicationId);

    // Also save as form_response if template exists
    if (matchedTemplate && publishedVersion && user) {
      await supabase.from('form_responses').upsert({
        template_id: matchedTemplate.id,
        version_id: publishedVersion.id,
        user_id: user.id,
        response_data: data,
        status: 'draft',
        entity_type: 'application',
        entity_id: applicationId,
      } as any, { onConflict: 'entity_id,entity_type' }).select();
    }

    setSaving(false);
    setCurrentStep('documents');
  };

  const handleFinalSubmit = async () => {
    if (!applicationId || !user) return;
    setSubmitting(true);

    const { error } = await supabase.from('applications').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    } as any).eq('id', applicationId);

    if (error) {
      toast.error('Submission failed: ' + error.message);
      setSubmitting(false);
      return;
    }

    // Update form response status
    if (matchedTemplate && publishedVersion) {
      await supabase.from('form_responses').update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      } as any).eq('entity_id', applicationId).eq('entity_type', 'application');
    }

    // Try to start workflow
    const { data: workflows } = await supabase
      .from('approval_workflows')
      .select('id')
      .eq('entity_type', 'application')
      .eq('is_active', true)
      .limit(1);

    if (workflows && workflows.length > 0) {
      const { data: steps } = await supabase
        .from('approval_steps')
        .select('id')
        .eq('workflow_id', workflows[0].id)
        .order('step_order', { ascending: true })
        .limit(1);

      await supabase.from('workflow_instances').insert({
        workflow_id: workflows[0].id,
        entity_type: 'application',
        entity_id: applicationId,
        current_step_id: steps?.[0]?.id || null,
        status: 'active',
      } as any);

      await supabase.from('applications').update({
        workflow_id: workflows[0].id,
        current_step_id: steps?.[0]?.id || null,
      } as any).eq('id', applicationId);
    }

    await logAudit({
      action: 'application_submitted',
      entityType: 'application',
      entityId: applicationId,
    });

    toast.success('Application submitted successfully!');
    setSubmitting(false);
    navigate(`/applications/${applicationId}`);
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => {
            if (currentStep === 'selection') navigate(-1);
            else {
              const prevIdx = stepIndex - 1;
              if (prevIdx >= 0) setCurrentStep(WIZARD_STEPS[prevIdx].key);
            }
          }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">New License Application</h1>
            <p className="text-muted-foreground text-sm">
              Step {stepIndex + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[stepIndex].label}
            </p>
          </div>
          {applicationId && (
            <Badge variant="outline" className="font-mono text-xs">
              Draft
            </Badge>
          )}
        </div>

        {/* Step Progress */}
        <div className="space-y-3">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between">
            {WIZARD_STEPS.map((step, i) => (
              <div
                key={step.key}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  i <= stepIndex ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors ${
                  i < stepIndex ? 'bg-primary border-primary text-primary-foreground'
                  : i === stepIndex ? 'border-primary text-primary'
                  : 'border-muted-foreground/30'
                }`}>
                  {i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.icon}
                </div>
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Selection */}
        {currentStep === 'selection' && (
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
                  <SelectContent>
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
                  <SelectContent>
                    {filteredSubSectors.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={!selectedSubSector}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder={selectedSubSector ? 'Select Category' : 'Select a sub-sector first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Show matched form info */}
              {selectedCategory && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      {matchedTemplate ? `Form: ${matchedTemplate.name}` : 'No published form found for this category'}
                    </span>
                  </div>
                  {matchedTemplate && publishedVersion && (
                    <p className="text-xs text-muted-foreground">
                      Version {publishedVersion.version} · {sections.length} section(s)
                    </p>
                  )}
                  {!matchedTemplate && (
                    <p className="text-xs text-muted-foreground">
                      A default application form will be used. Contact admin to configure a specific form.
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleProceedToForm} disabled={!selectedCategory || saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Create Draft & Proceed
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Dynamic Form */}
        {currentStep === 'form' && (
          <div>
            {sections.length > 0 ? (
              <FormRenderer
                formName={matchedTemplate?.name || 'Application Form'}
                sections={sections}
                initialData={formData}
                onSaveDraft={handleFormSaveDraft}
                onSubmit={handleFormSubmit}
                saving={saving}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Application Information</CardTitle>
                  <CardDescription>
                    No dynamic form is configured for this category. Please upload your documents in the next step.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-end">
                    <Button onClick={() => setCurrentStep('documents')}>
                      Continue to Documents
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Step 3: Documents */}
        {currentStep === 'documents' && applicationId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Upload Supporting Documents
              </CardTitle>
              <CardDescription>
                Attach all required documents for your application. You can upload multiple files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <DocumentUpload
                entityType="application"
                entityId={applicationId}
                onUploaded={() => setDocRefresh(p => p + 1)}
              />
              <div key={docRefresh}>
                <DocumentList entityType="application" entityId={applicationId} />
              </div>

              <div className="flex justify-between pt-4 border-t">
                <Button variant="outline" onClick={() => setCurrentStep('form')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />Back to Form
                </Button>
                <Button onClick={() => setCurrentStep('review')}>
                  Review Application
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Review & Submit */}
        {currentStep === 'review' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Review Your Application</CardTitle>
                <CardDescription>
                  Please review all information before submitting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Sector</span>
                    </div>
                    <p className="text-sm font-medium">{sectorObj?.name || '—'}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Sub-Sector</span>
                    </div>
                    <p className="text-sm font-medium">{subSectorObj?.name || '—'}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Category</span>
                    </div>
                    <p className="text-sm font-medium">{categoryObj?.name || '—'}</p>
                  </div>
                </div>

                {matchedTemplate && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Form</span>
                    </div>
                    <p className="text-sm font-medium">{matchedTemplate.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Object.keys(formData).length} field(s) filled
                    </p>
                  </div>
                )}

                {applicationId && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Paperclip className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Documents</span>
                    </div>
                    <div className="mt-2">
                      <DocumentList entityType="application" entityId={applicationId} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep('documents')}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
              <Button onClick={handleFinalSubmit} disabled={submitting} size="lg">
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                {submitting ? 'Submitting...' : 'Submit Application'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
