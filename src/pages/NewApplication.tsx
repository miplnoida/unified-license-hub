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
import { Separator } from '@/components/ui/separator';
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
  Building2, Layers, Tag, ClipboardList, Paperclip, Send, Clock, PlayCircle,
  CreditCard, AlertCircle, RefreshCw, Receipt,
} from 'lucide-react';

type WizardStep = 'selection' | 'forms' | 'filling' | 'documents' | 'payment' | 'review';
type FormStatus = 'not_started' | 'in_progress' | 'completed';
type PaymentStatus = 'pending' | 'success' | 'failed';

interface FormProgress {
  templateId: string;
  status: FormStatus;
  data: Record<string, any>;
}

const WIZARD_STEPS: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
  { key: 'selection', label: 'Select Category', icon: <Layers className="h-4 w-4" /> },
  { key: 'forms', label: 'Required Forms', icon: <ClipboardList className="h-4 w-4" /> },
  { key: 'documents', label: 'Upload Documents', icon: <Paperclip className="h-4 w-4" /> },
  { key: 'payment', label: 'Payment', icon: <CreditCard className="h-4 w-4" /> },
  { key: 'review', label: 'Submit', icon: <Send className="h-4 w-4" /> },
];

export default function NewApplication() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeRegulator } = useRegulator();
  const [currentStep, setCurrentStep] = useState<WizardStep>('selection');
  const [activeFormTemplateId, setActiveFormTemplateId] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedSubSector, setSelectedSubSector] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [formProgressMap, setFormProgressMap] = useState<Record<string, FormProgress>>({});
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [docRefresh, setDocRefresh] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [feeAmount, setFeeAmount] = useState<number>(0);
  const [feeBreakdown, setFeeBreakdown] = useState<{ name: string; amount: number }[]>([]);

  const { data: sectors = [] } = useSectors();
  const { data: allSubSectors = [] } = useSubSectors();
  const { data: allCategories = [] } = useCategories();
  const { data: formTemplates = [] } = useFormTemplates(undefined, activeRegulator?.id);

  const filteredSubSectors = allSubSectors.filter(s => s.sector_id === selectedSector);
  const filteredCategories = allCategories.filter(c => c.sub_sector_id === selectedSubSector);

  // Find ALL matching form templates
  const matchedTemplates = useMemo(() => {
    if (!selectedCategory) return [];
    const catObj = allCategories.find(c => c.id === selectedCategory);
    const subObj = allSubSectors.find(s => s.id === selectedSubSector);
    const secObj = sectors.find(s => s.id === selectedSector);
    if (!catObj || !subObj || !secObj) return [];

    const matched = formTemplates.filter(t =>
      t.status === 'published' &&
      (t.form_type === 'pre_license' || t.form_type === 'application') &&
      (
        (t.category && t.category === catObj.name) ||
        (t.sub_sector && t.sub_sector === subObj.name && !t.category) ||
        (t.sector && t.sector === secObj.name && !t.category && !t.sub_sector)
      )
    );

    if (matched.length === 0) {
      return formTemplates.filter(t =>
        t.status === 'published' &&
        (t.form_type === 'pre_license' || t.form_type === 'application')
      );
    }

    return matched;
  }, [selectedCategory, formTemplates, allCategories, allSubSectors, sectors, selectedSubSector, selectedSector]);

  // Active form template being filled
  const activeTemplate = useMemo(() => {
    return matchedTemplates.find(t => t.id === activeFormTemplateId) || null;
  }, [activeFormTemplateId, matchedTemplates]);

  const { data: publishedVersion } = useLatestPublishedVersion(activeTemplate?.id || null);
  const { data: sections = [] } = useVersionSections(publishedVersion?.id || null);

  // Progress calculations
  const completedCount = matchedTemplates.filter(t => formProgressMap[t.id]?.status === 'completed').length;
  const allFormsCompleted = matchedTemplates.length > 0 && completedCount === matchedTemplates.length;

  // Wizard step index (skip 'filling' from display)
  const displayStep = currentStep === 'filling' ? 'forms' : currentStep;
  const stepIndex = WIZARD_STEPS.findIndex(s => s.key === displayStep);
  const progress = ((stepIndex + 1) / WIZARD_STEPS.length) * 100;
  const paymentComplete = paymentStatus === 'success';

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

  // Create draft application
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
          form_template_ids: matchedTemplates.map(t => t.id),
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

  const handleProceedToForms = async () => {
    if (!selectedCategory) {
      toast.error('Please select all fields');
      return;
    }
    if (matchedTemplates.length === 0) {
      toast.error('No forms available for this category');
      return;
    }

    setSaving(true);
    const appId = await createDraftApplication();
    if (appId) {
      setApplicationId(appId);
      // Initialize progress for all forms
      const initial: Record<string, FormProgress> = {};
      matchedTemplates.forEach(t => {
        initial[t.id] = { templateId: t.id, status: 'not_started', data: {} };
      });
      setFormProgressMap(initial);
      setCurrentStep('forms');
    }
    setSaving(false);
  };

  const handleStartForm = (templateId: string) => {
    setActiveFormTemplateId(templateId);
    // Mark as in_progress if not_started
    setFormProgressMap(prev => ({
      ...prev,
      [templateId]: {
        ...prev[templateId],
        status: prev[templateId]?.status === 'completed' ? 'completed' : 'in_progress',
      },
    }));
    setCurrentStep('filling');
  };

  const handleFormSaveDraft = async (data: Record<string, any>) => {
    if (!activeFormTemplateId) return;
    setFormProgressMap(prev => ({
      ...prev,
      [activeFormTemplateId]: {
        ...prev[activeFormTemplateId],
        status: 'in_progress',
        data,
      },
    }));
    if (applicationId) {
      setSaving(true);
      const existingApp = await supabase.from('applications').select('data').eq('id', applicationId).single();
      const existingVersionIds = (existingApp.data?.data as any)?.form_version_ids || {};
      await supabase.from('applications').update({
        data: {
          sector_id: selectedSector,
          sub_sector_id: selectedSubSector,
          category_id: selectedCategory,
          sector_name: sectorObj?.name,
          sub_sector_name: subSectorObj?.name,
          category_name: categoryObj?.name,
          form_template_ids: matchedTemplates.map(t => t.id),
          form_version_ids: { ...existingVersionIds, ...(publishedVersion ? { [activeFormTemplateId]: publishedVersion.id } : {}) },
          forms_data: { ...Object.fromEntries(Object.entries(formProgressMap).map(([k, v]) => [k, v.data])), [activeFormTemplateId]: data },
        },
      } as any).eq('id', applicationId);
      toast.success('Draft saved');
      setSaving(false);
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
      },
    }));

    if (applicationId && activeTemplate && publishedVersion && user) {
      setSaving(true);
      await supabase.from('form_responses').upsert({
        template_id: activeTemplate.id,
        version_id: publishedVersion.id,
        user_id: user.id,
        response_data: data,
        status: 'draft',
        entity_type: 'application',
        entity_id: applicationId,
      } as any, { onConflict: 'entity_id,entity_type,template_id' }).select();

      const existingApp2 = await supabase.from('applications').select('data').eq('id', applicationId).single();
      const existingVersionIds2 = (existingApp2.data?.data as any)?.form_version_ids || {};
      await supabase.from('applications').update({
        data: {
          sector_id: selectedSector,
          sub_sector_id: selectedSubSector,
          category_id: selectedCategory,
          sector_name: sectorObj?.name,
          sub_sector_name: subSectorObj?.name,
          category_name: categoryObj?.name,
          form_template_ids: matchedTemplates.map(t => t.id),
          form_version_ids: { ...existingVersionIds2, [activeFormTemplateId]: publishedVersion.id },
          forms_data: { ...Object.fromEntries(Object.entries(formProgressMap).map(([k, v]) => [k, v.data])), [activeFormTemplateId]: data },
        },
      } as any).eq('id', applicationId);
      setSaving(false);
    }

    toast.success('Form completed!');
    setActiveFormTemplateId(null);
    setCurrentStep('forms');
  };

  // Load applicable fees when moving to payment step
  const loadFees = async () => {
    if (!selectedSector) return;
    const { data: fees } = await supabase
      .from('fee_configurations')
      .select('*')
      .eq('is_active', true)
      .or(`sector_id.eq.${selectedSector},sector_id.is.null`)
      .order('name');

    if (fees && fees.length > 0) {
      const breakdown = fees.map(f => ({ name: f.name, amount: Number(f.amount) }));
      setFeeBreakdown(breakdown);
      setFeeAmount(breakdown.reduce((sum, f) => sum + f.amount, 0));
    } else {
      // Default fee if none configured
      setFeeBreakdown([{ name: 'Application Processing Fee', amount: 500 }]);
      setFeeAmount(500);
    }
  };

  const handleProceedToPayment = async () => {
    await loadFees();
    setCurrentStep('payment');
  };

  const handleProcessPayment = async () => {
    if (!applicationId || !user) return;
    setProcessingPayment(true);

    try {
      // Create payment record with 'pending' status first
      const txnRef = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const { data: payment, error: payErr } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          application_id: applicationId,
          amount: feeAmount,
          status: 'pending',
          payment_method: 'online',
          transaction_ref: txnRef,
        } as any)
        .select()
        .single();

      if (payErr) throw payErr;

      // Simulate payment processing (in production, this would call a payment gateway)
      // For now we update to completed after a brief delay to simulate real flow
      const { error: updateErr } = await supabase
        .from('payments')
        .update({
          status: 'completed',
          paid_at: new Date().toISOString(),
        } as any)
        .eq('id', (payment as any).id);

      if (updateErr) throw updateErr;

      setPaymentId((payment as any).id);
      setPaymentStatus('success');

      // Generate receipt
      await supabase.from('payment_receipts').insert({
        payment_id: (payment as any).id,
        amount: feeAmount,
        issued_to_name: user.fullName || user.email || 'Applicant',
        issued_to_email: user.email,
        fee_breakdown: feeBreakdown,
      } as any);

      await logAudit({
        action: 'payment_completed',
        entityType: 'payment',
        entityId: (payment as any).id,
        newValue: { amount: feeAmount, application_id: applicationId },
      });

      toast.success('Payment successful!');
    } catch (err: any) {
      // Mark payment as failed if it was created
      setPaymentStatus('failed');
      toast.error('Payment failed: ' + (err.message || 'Unknown error'));
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleRetryPayment = () => {
    setPaymentStatus('pending');
    setPaymentId(null);
  };

  const handleFinalSubmit = async () => {
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
        body: { application_id: applicationId },
      });

      if (error) {
        // Edge function invocation error
        toast.error('Submission failed: ' + (error.message || 'Server error'));
        setSubmitting(false);
        return;
      }

      if (data?.error) {
        // Business logic error from edge function
        toast.error(data.error);
        setSubmitting(false);
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
      setCurrentStep('forms');
    } else if (currentStep === 'selection') {
      navigate(-1);
    } else {
      const prevIdx = stepIndex - 1;
      if (prevIdx >= 0) setCurrentStep(WIZARD_STEPS[prevIdx].key);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">New License Application</h1>
            <p className="text-muted-foreground text-sm">
              {currentStep === 'filling'
                ? `Filling: ${activeTemplate?.name || 'Form'}`
                : `Step ${stepIndex + 1} of ${WIZARD_STEPS.length}: ${WIZARD_STEPS[stepIndex].label}`}
            </p>
          </div>
          {applicationId && (
            <Badge variant="outline" className="font-mono text-xs">Draft</Badge>
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

        {/* Step 1: Category Selection */}
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
        {currentStep === 'forms' && (
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
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tmpl.form_type}</Badge>
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

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setCurrentStep('selection')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button
                onClick={() => setCurrentStep('documents')}
                disabled={!allFormsCompleted}
              >
                {allFormsCompleted ? 'Proceed to Documents' : `Complete all forms (${completedCount}/${matchedTemplates.length})`}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Filling a specific form */}
        {currentStep === 'filling' && activeTemplate && (
          <div>
            {sections.length > 0 ? (
              <FormRenderer
                formName={activeTemplate.name}
                sections={sections}
                initialData={formProgressMap[activeTemplate.id]?.data || {}}
                onSaveDraft={handleFormSaveDraft}
                onSubmit={handleFormSubmit}
                saving={saving}
                applicationId={applicationId || undefined}
              />
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
                      setCurrentStep('forms');
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
        {currentStep === 'documents' && applicationId && (
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
                <DocumentList entityType="application" entityId={applicationId} />
              </div>

              <div className="flex justify-between pt-4 border-t">
                <Button variant="outline" onClick={() => setCurrentStep('forms')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />Back to Forms
                </Button>
                <Button onClick={handleProceedToPayment}>
                  Proceed to Payment
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Payment */}
        {currentStep === 'payment' && applicationId && (
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
                      Complete payment to proceed with submission.
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
                  </div>
                </div>

                {/* Payment Action */}
                {paymentStatus === 'pending' && (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <Button
                      size="lg"
                      onClick={handleProcessPayment}
                      disabled={processingPayment}
                      className="min-w-[200px]"
                    >
                      {processingPayment ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                      ) : (
                        <><CreditCard className="h-4 w-4 mr-2" /> Proceed to Pay</>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Payment is mandatory before final submission.
                    </p>
                  </div>
                )}

                {paymentStatus === 'success' && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                    <h3 className="font-semibold text-emerald-800">Payment Successful</h3>
                    <p className="text-sm text-emerald-700">
                      Your payment of <strong>${feeAmount.toFixed(2)}</strong> has been processed successfully.
                    </p>
                    {paymentId && (
                      <p className="text-xs text-emerald-600 font-mono">Payment ID: {paymentId.substring(0, 8).toUpperCase()}</p>
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
              <Button variant="outline" onClick={() => setCurrentStep('documents')}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
              <Button
                onClick={() => setCurrentStep('review')}
                disabled={!paymentComplete}
              >
                {paymentComplete ? 'Proceed to Submit' : 'Complete payment first'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Review & Submit */}
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

                {/* Forms summary */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Forms ({completedCount}/{matchedTemplates.length} completed)
                    </span>
                  </div>
                  <div className="space-y-2">
                    {matchedTemplates.map(tmpl => (
                      <div key={tmpl.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{tmpl.name}</span>
                        {getFormStatusBadge(formProgressMap[tmpl.id]?.status || 'not_started')}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment summary */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Payment</span>
                    </div>
                    {getPaymentStatusBadge()}
                  </div>
                  <p className="text-sm font-medium mt-2">Amount: ${feeAmount.toFixed(2)}</p>
                </div>

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

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep('payment')}>
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
              <Button onClick={handleFinalSubmit} disabled={submitting || !allFormsCompleted || !paymentComplete} size="lg">
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