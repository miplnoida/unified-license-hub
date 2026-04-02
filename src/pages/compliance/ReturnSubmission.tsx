import { useState, useEffect, useMemo, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { Loader2, ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import type { FormSection, FormField } from '@/types/formBuilder';

interface ReturnConfig {
  id: string;
  name: string;
  frequency: string;
  due_day: number;
  form_id: string | null;
  return_template_id: string | null;
}

interface ComplianceReturn {
  id: string;
  return_config_id: string | null;
  period_start: string;
  period_end: string;
  due_date: string;
  status: string;
  form_data: any;
}

interface MultiFormTemplate {
  id: string;
  name: string;
  tabName: string;
  formOrder: number;
  sections: FormSection[];
}

function makeField(overrides: Partial<FormField> & { id: string; label: string; fieldName: string; type: FormField['type'] }): FormField {
  return {
    required: false,
    placeholder: '',
    helpText: '',
    options: [],
    validation: {},
    defaultValue: '',
    calculatedExpression: '',
    ...overrides,
  };
}

export default function ReturnSubmission() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnId = searchParams.get('returnId');

  const [configs, setConfigs] = useState<ReturnConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [existingReturn, setExistingReturn] = useState<ComplianceReturn | null>(null);
  // Single-form mode
  const [formSections, setFormSections] = useState<FormSection[]>([]);
  // Multi-form mode
  const [multiFormTemplates, setMultiFormTemplates] = useState<MultiFormTemplate[]>([]);
  const [isMultiForm, setIsMultiForm] = useState(false);
  const [activeFormIdx, setActiveFormIdx] = useState(0);
  const [formDataMap, setFormDataMap] = useState<Record<string, Record<string, any>>>({});

  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadInitial();
  }, []);

  const loadInitial = async () => {
    setLoading(true);
    const { data: configData } = await supabase.from('return_configurations' as any).select('*').eq('is_active', true);
    setConfigs((configData || []) as any);

    if (returnId) {
      const { data: retData } = await supabase.from('compliance_returns' as any).select('*').eq('id', returnId).single();
      if (retData) {
        setExistingReturn(retData as any);
        setSelectedConfigId((retData as any).return_config_id || '');
        const config = (configData || []).find((c: any) => c.id === (retData as any).return_config_id) as any;
        if (config) {
          // Initialize form data from existing return
          const existingFormData = (retData as any).form_data || {};
          if (existingFormData.__multiFormData) {
            setFormDataMap(existingFormData.__multiFormData);
          } else {
            setFormDataMap({ '_single': existingFormData });
          }
          await loadFormsForConfig(config, existingFormData);
        }
      }
    }
    setLoading(false);
  };

  const loadFormsForConfig = async (config: ReturnConfig, existingData?: any) => {
    setFormLoading(true);
    setIsMultiForm(false);
    setMultiFormTemplates([]);
    setFormSections([]);
    setActiveFormIdx(0);

    // Check if config has a return_template_id (multi-form)
    if (config.return_template_id) {
      await loadMultiFormTemplate(config.return_template_id, existingData);
    } else if (config.form_id) {
      await loadSingleForm(config.form_id);
    } else {
      // No form configured - show default
      setFormSections([{
        id: 'default', title: 'Return Data', description: 'Enter the return information below', sortOrder: 0, isRepeatable: false,
        fields: [
          makeField({ id: 'revenue', fieldName: 'revenue', label: 'Total Revenue', type: 'number', required: true, placeholder: '0.00', helpText: 'Report total revenue for this period' }),
          makeField({ id: 'expenses', fieldName: 'expenses', label: 'Total Expenses', type: 'number', required: true, placeholder: '0.00' }),
          makeField({ id: 'net_income', fieldName: 'net_income', label: 'Net Income', type: 'calculated', placeholder: 'Auto-calculated', helpText: 'Revenue minus expenses', calculatedExpression: '{revenue} - {expenses}' }),
          makeField({ id: 'notes', fieldName: 'notes', label: 'Additional Notes', type: 'textarea', placeholder: 'Any additional information...' }),
        ],
      }]);
    }
    setFormLoading(false);
  };

  const loadMultiFormTemplate = async (returnTemplateId: string, existingData?: any) => {
    // Load all form templates belonging to this return template
    const { data: templates } = await supabase.from('form_templates' as any)
      .select('id, name, sheet_name, status, tab_name, form_order')
      .eq('return_template_id', returnTemplateId)
      .eq('status', 'published')
      .order('form_order');

    if (!templates || templates.length === 0) {
      setFormLoading(false);
      return;
    }

    // For each template, load its published version's schema
    const formTemplates: MultiFormTemplate[] = [];
    for (const tpl of templates as any[]) {
      const { data: versions } = await supabase.from('form_versions' as any)
        .select('id, schema_snapshot')
        .eq('template_id', tpl.id)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1);

      let sections: FormSection[] = [];
      if (versions && versions.length > 0) {
        const snapshot = (versions[0] as any).schema_snapshot;
        if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) {
          sections = convertSnapshotToSections(snapshot);
        }
        // If snapshot empty, try form_fields
        if (sections.length === 0) {
          const versionId = (versions[0] as any).id;
          const { data: fields } = await supabase.from('form_fields' as any)
            .select('*').eq('version_id', versionId)
            .order('section_order').order('sort_order');
          if (fields && fields.length > 0) {
            sections = groupFieldsIntoSections(fields as any[]);
          }
        }
      }

      formTemplates.push({
        id: tpl.id,
        name: tpl.name || tpl.sheet_name || `Form ${formTemplates.length + 1}`,
        sections,
      });
    }

    setMultiFormTemplates(formTemplates);
    setIsMultiForm(true);

    // Initialize formDataMap if not already set from existing return
    if (!existingData?.__multiFormData) {
      const initial: Record<string, Record<string, any>> = {};
      formTemplates.forEach(t => { initial[t.id] = existingData || {}; });
      setFormDataMap(prev => {
        if (Object.keys(prev).length > 0 && prev['_single']) {
          // Migrate single form data
          const single = prev['_single'];
          const migrated: Record<string, Record<string, any>> = {};
          formTemplates.forEach(t => { migrated[t.id] = single; });
          return migrated;
        }
        return Object.keys(prev).length > 0 ? prev : initial;
      });
    }
  };

  const loadSingleForm = async (formId: string) => {
    const { data: versions } = await supabase.from('form_versions' as any)
      .select('*').eq('template_id', formId).eq('status', 'published').order('version', { ascending: false }).limit(1);

    if (versions && versions.length > 0) {
      const versionId = (versions[0] as any).id;
      const { data: fields } = await supabase.from('form_fields' as any).select('*').eq('version_id', versionId).order('section_order').order('sort_order');
      if (fields && fields.length > 0) {
        setFormSections(groupFieldsIntoSections(fields as any[]));
        return;
      }
      const snapshot = (versions[0] as any).schema_snapshot;
      if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) {
        const sections = convertSnapshotToSections(snapshot);
        if (sections.length > 0) {
          setFormSections(sections);
          return;
        }
      }
    }

    // Fallback: try forms table
    const { data: formData } = await supabase.from('forms' as any).select('*').eq('id', formId).single();
    if (formData && (formData as any).rows) {
      setFormSections(convertRowsToSections((formData as any).rows as any[]));
    }
  };

  const convertSnapshotToSections = (snapshot: any[]): FormSection[] => {
    return snapshot.map((s: any, i: number) => ({
      id: s.id || `section-${i}`,
      title: s.title || `Section ${i + 1}`,
      description: s.description || '',
      sortOrder: s.sortOrder ?? i,
      isRepeatable: s.isRepeatable || false,
      fields: (s.fields || []).map((f: any, j: number) =>
        makeField({
          id: f.id || `field-${i}-${j}`,
          fieldName: f.fieldName || f.field_name || f.label?.toLowerCase().replace(/\s+/g, '_') || `field_${j}`,
          label: f.label || `Field ${j + 1}`,
          type: f.type || f.field_type || 'text',
          required: f.required || false,
          placeholder: f.placeholder || '',
          helpText: f.helpText || f.help_text || '',
          options: f.options || [],
          validation: f.validation || {},
          defaultValue: f.defaultValue || f.default_value || '',
          calculatedExpression: f.calculatedExpression || f.calculated_expression || '',
        })
      ),
    }));
  };

  const groupFieldsIntoSections = (fields: any[]): FormSection[] => {
    const sectionMap = new Map<string, FormSection>();
    for (const f of fields) {
      if (!sectionMap.has(f.section_id)) {
        sectionMap.set(f.section_id, {
          id: f.section_id,
          title: f.section_title || 'Section',
          description: f.section_description || '',
          sortOrder: f.section_order || 0,
          isRepeatable: f.section_is_repeatable || false,
          fields: [],
        });
      }
      const section = sectionMap.get(f.section_id)!;
      section.fields.push(makeField({
        id: f.id,
        fieldName: f.field_name,
        label: f.label,
        type: f.field_type || 'text',
        required: f.required || false,
        placeholder: f.placeholder || '',
        helpText: f.help_text || '',
        options: f.options || [],
        validation: f.validation || {},
        defaultValue: f.default_value || '',
        calculatedExpression: f.calculated_expression || '',
      }));
    }
    return Array.from(sectionMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const convertRowsToSections = (rows: any[]): FormSection[] => {
    if (!rows || rows.length === 0) return [{
      id: 'default', title: 'Return Data', description: '', sortOrder: 0, isRepeatable: false,
      fields: [makeField({ id: 'notes', fieldName: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Enter return notes...' })],
    }];
    return rows.map((row: any, i: number) => ({
      id: row.id || `section-${i}`,
      title: row.title || `Section ${i + 1}`,
      description: row.description || '',
      sortOrder: i,
      isRepeatable: row.isRepeatable || false,
      fields: (row.fields || []).map((f: any, j: number) =>
        makeField({
          id: f.id || `field-${i}-${j}`,
          fieldName: f.fieldName || f.name || f.label?.toLowerCase().replace(/\s+/g, '_') || `field_${j}`,
          label: f.label || `Field ${j + 1}`,
          type: f.type || 'text',
          required: f.required || false,
          placeholder: f.placeholder || '',
          helpText: f.helpText || '',
          options: f.options || [],
          validation: f.validation || {},
          defaultValue: f.defaultValue || '',
          calculatedExpression: f.calculatedExpression || '',
        })
      ),
    }));
  };

  const handleConfigChange = async (configId: string) => {
    setSelectedConfigId(configId);
    setFormDataMap({});
    const config = configs.find(c => c.id === configId);
    if (config) {
      await loadFormsForConfig(config as any);
    }
  };

  // Multi-form: group templates by letter prefix (e.g., A.01 → "A", B.03 → "B")
  const formGroups = useMemo(() => {
    if (!isMultiForm || multiFormTemplates.length === 0) return null;
    const groups = new Map<string, MultiFormTemplate[]>();
    let hasGroups = false;
    for (const tpl of multiFormTemplates) {
      const match = tpl.name.match(/^([A-Z])\./i);
      if (match) {
        hasGroups = true;
        const letter = match[1].toUpperCase();
        if (!groups.has(letter)) groups.set(letter, []);
        groups.get(letter)!.push(tpl);
      }
    }
    if (!hasGroups) {
      // No letter prefix grouping - use numeric grouping or flat list
      groups.set('All', multiFormTemplates);
    }
    return groups;
  }, [isMultiForm, multiFormTemplates]);

  const groupKeys = useMemo(() => formGroups ? Array.from(formGroups.keys()).sort() : [], [formGroups]);
  const [activeGroupKey, setActiveGroupKey] = useState('');

  // Keep activeGroupKey valid
  useEffect(() => {
    if (groupKeys.length > 0 && !groupKeys.includes(activeGroupKey)) {
      setActiveGroupKey(groupKeys[0]);
      setActiveFormIdx(0);
    }
  }, [groupKeys]);

  const activeGroupForms = formGroups?.get(activeGroupKey) || [];
  const activeForm = activeGroupForms[activeFormIdx] || null;

  const completedForms = useMemo(() => {
    const completed = new Set<string>();
    for (const [templateId, data] of Object.entries(formDataMap)) {
      if (data && Object.keys(data).some(k => !k.startsWith('__') && data[k] !== '' && data[k] !== null && data[k] !== undefined)) {
        completed.add(templateId);
      }
    }
    return completed;
  }, [formDataMap]);

  const totalFormCount = multiFormTemplates.length;
  const completedCount = completedForms.size;

  // Save/submit helpers
  const getMergedFormData = useCallback(() => {
    if (isMultiForm) {
      return { __multiFormData: formDataMap };
    }
    return formDataMap['_single'] || {};
  }, [isMultiForm, formDataMap]);

  const handleSaveDraft = async (data: Record<string, any>) => {
    if (!user) return;
    setSaving(true);

    // In multi-form mode, save per-form data
    let mergedData: any;
    if (isMultiForm && activeForm) {
      const updatedMap = { ...formDataMap, [activeForm.id]: data };
      setFormDataMap(updatedMap);
      mergedData = { __multiFormData: updatedMap };
    } else {
      setFormDataMap({ '_single': data });
      mergedData = data;
    }

    if (existingReturn) {
      const { error } = await supabase.from('compliance_returns' as any)
        .update({ form_data: mergedData, status: 'draft' } as any).eq('id', existingReturn.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Draft saved');
    } else {
      const config = configs.find(c => c.id === selectedConfigId);
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const dueDay = config?.due_day || 15;
      const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay).toISOString().split('T')[0];

      const { data: newReturn, error } = await supabase.from('compliance_returns' as any).insert({
        return_config_id: selectedConfigId || null,
        submitter_id: user.id,
        period_start: periodStart,
        period_end: periodEnd,
        due_date: dueDate,
        form_data: mergedData,
        status: 'draft',
      } as any).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      setExistingReturn(newReturn as any);
      toast.success('Draft saved');
    }
    setSaving(false);
  };

  const handleSubmitReturn = async (data: Record<string, any>) => {
    if (!user) return;
    setSaving(true);

    let mergedData: any;
    if (isMultiForm && activeForm) {
      const updatedMap = { ...formDataMap, [activeForm.id]: data };
      setFormDataMap(updatedMap);
      mergedData = { __multiFormData: updatedMap };
    } else {
      mergedData = data;
    }

    if (existingReturn) {
      const { error } = await supabase.from('compliance_returns' as any)
        .update({ form_data: mergedData, status: 'submitted', submitted_at: new Date().toISOString() } as any)
        .eq('id', existingReturn.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const config = configs.find(c => c.id === selectedConfigId);
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const dueDay = config?.due_day || 15;
      const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay).toISOString().split('T')[0];

      const { error } = await supabase.from('compliance_returns' as any).insert({
        return_config_id: selectedConfigId || null,
        submitter_id: user.id,
        period_start: periodStart,
        period_end: periodEnd,
        due_date: dueDate,
        form_data: mergedData,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      } as any);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    setSaving(false);
    setSubmitted(true);
    toast.success('Return submitted successfully');
  };

  // Multi-form: save current form data when switching forms
  const handleFormDataChange = useCallback((templateId: string, data: Record<string, any>) => {
    setFormDataMap(prev => ({ ...prev, [templateId]: data }));
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  if (submitted) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto py-16 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Return Submitted</h2>
          <p className="text-muted-foreground">Your compliance return has been submitted for review.</p>
          <Button onClick={() => navigate('/compliance/returns')}>Back to Returns</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={existingReturn ? 'Edit Return Submission' : 'New Return Submission'}
          description="Fill in the compliance return form and submit for review"
          actions={<Button variant="outline" onClick={() => navigate('/compliance/returns')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>}
        />

        {!existingReturn && (
          <Card>
            <CardHeader><CardTitle className="text-base">Select Return Type</CardTitle></CardHeader>
            <CardContent>
              <div className="max-w-md space-y-2">
                <Label>Return Configuration</Label>
                <Select value={selectedConfigId} onValueChange={handleConfigChange}>
                  <SelectTrigger><SelectValue placeholder="Select return type..." /></SelectTrigger>
                  <SelectContent>
                    {configs.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} <span className="text-muted-foreground capitalize ml-1">({c.frequency})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {existingReturn && (
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-muted-foreground">Period</p><p className="font-medium">{new Date(existingReturn.period_start).toLocaleDateString()} – {new Date(existingReturn.period_end).toLocaleDateString()}</p></div>
                <div><p className="text-muted-foreground">Due Date</p><p className="font-medium">{new Date(existingReturn.due_date).toLocaleDateString()}</p></div>
                <div><p className="text-muted-foreground">Status</p><Badge variant="outline" className="capitalize">{existingReturn.status}</Badge></div>
              </div>
            </CardContent>
          </Card>
        )}

        {formLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : isMultiForm && multiFormTemplates.length > 0 ? (
          <MultiFormView
            formGroups={formGroups}
            groupKeys={groupKeys}
            activeGroupKey={activeGroupKey}
            setActiveGroupKey={(key) => { setActiveGroupKey(key); setActiveFormIdx(0); }}
            activeFormIdx={activeFormIdx}
            setActiveFormIdx={setActiveFormIdx}
            activeGroupForms={activeGroupForms}
            activeForm={activeForm}
            formDataMap={formDataMap}
            completedForms={completedForms}
            totalFormCount={totalFormCount}
            completedCount={completedCount}
            onSaveDraft={handleSaveDraft}
            onSubmit={handleSubmitReturn}
            onFormDataChange={handleFormDataChange}
            saving={saving}
          />
        ) : formSections.length > 0 ? (
          <FormRenderer
            formName={existingReturn ? 'Edit Return' : 'Return Submission'}
            sections={formSections}
            initialData={formDataMap['_single'] || existingReturn?.form_data || {}}
            onSaveDraft={handleSaveDraft}
            onSubmit={handleSubmitReturn}
            saving={saving}
          />
        ) : selectedConfigId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>No form configured for this return type. Contact admin to link a form template.</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

// ──────────── Multi-Form View Component ────────────

interface MultiFormViewProps {
  formGroups: Map<string, MultiFormTemplate[]> | null;
  groupKeys: string[];
  activeGroupKey: string;
  setActiveGroupKey: (key: string) => void;
  activeFormIdx: number;
  setActiveFormIdx: (idx: number) => void;
  activeGroupForms: MultiFormTemplate[];
  activeForm: MultiFormTemplate | null;
  formDataMap: Record<string, Record<string, any>>;
  completedForms: Set<string>;
  totalFormCount: number;
  completedCount: number;
  onSaveDraft: (data: Record<string, any>) => Promise<void>;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  onFormDataChange: (templateId: string, data: Record<string, any>) => void;
  saving?: boolean;
}

function MultiFormView({
  formGroups, groupKeys, activeGroupKey, setActiveGroupKey,
  activeFormIdx, setActiveFormIdx, activeGroupForms, activeForm,
  formDataMap, completedForms, totalFormCount, completedCount,
  onSaveDraft, onSubmit, onFormDataChange, saving,
}: MultiFormViewProps) {
  const showGroupTabs = groupKeys.length > 1 && groupKeys[0] !== 'All';

  // Calculate global index for progress
  const globalIdx = useMemo(() => {
    if (!formGroups) return 0;
    let idx = 0;
    for (const key of groupKeys) {
      if (key === activeGroupKey) {
        return idx + activeFormIdx;
      }
      idx += (formGroups.get(key)?.length || 0);
    }
    return idx;
  }, [formGroups, groupKeys, activeGroupKey, activeFormIdx]);

  const progress = totalFormCount > 0 ? ((completedCount) / totalFormCount) * 100 : 0;

  const handlePrev = () => {
    if (activeFormIdx > 0) {
      setActiveFormIdx(activeFormIdx - 1);
    } else {
      const prevGroupIdx = groupKeys.indexOf(activeGroupKey) - 1;
      if (prevGroupIdx >= 0) {
        const prevKey = groupKeys[prevGroupIdx];
        setActiveGroupKey(prevKey);
        const prevForms = formGroups?.get(prevKey) || [];
        setActiveFormIdx(prevForms.length - 1);
      }
    }
  };

  const handleNext = () => {
    if (activeFormIdx < activeGroupForms.length - 1) {
      setActiveFormIdx(activeFormIdx + 1);
    } else {
      const nextGroupIdx = groupKeys.indexOf(activeGroupKey) + 1;
      if (nextGroupIdx < groupKeys.length) {
        setActiveGroupKey(groupKeys[nextGroupIdx]);
        setActiveFormIdx(0);
      }
    }
  };

  const isFirst = activeFormIdx === 0 && groupKeys.indexOf(activeGroupKey) === 0;
  const isLast = activeFormIdx === activeGroupForms.length - 1 && groupKeys.indexOf(activeGroupKey) === groupKeys.length - 1;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <Card>
        <CardContent className="pt-6 pb-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Form {globalIdx + 1} of {totalFormCount}
            </span>
            <span className="font-medium">{completedCount} completed</span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Group tabs */}
      {showGroupTabs && (
        <div className="flex flex-wrap gap-2">
          {groupKeys.map(key => {
            const forms = formGroups?.get(key) || [];
            const groupComplete = forms.every(f => completedForms.has(f.id));
            const isActive = key === activeGroupKey;
            return (
              <Button
                key={key}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setActiveGroupKey(key); setActiveFormIdx(0); }}
                className="relative"
              >
                Section {key}
                <Badge variant="secondary" className="ml-2 text-[10px] h-5 px-1.5">
                  {forms.filter(f => completedForms.has(f.id)).length}/{forms.length}
                </Badge>
                {groupComplete && <CheckCircle className="h-3 w-3 ml-1 text-primary" />}
              </Button>
            );
          })}
        </div>
      )}

      {/* Form selector within group */}
      {activeGroupForms.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {activeGroupForms.map((form, idx) => {
            const isActive = idx === activeFormIdx;
            const isCompleted = completedForms.has(form.id);
            return (
              <Button
                key={form.id}
                variant={isActive ? 'default' : isCompleted ? 'secondary' : 'outline'}
                size="sm"
                className="text-xs h-8 px-3"
                onClick={() => setActiveFormIdx(idx)}
              >
                {form.name}
                {isCompleted && !isActive && <CheckCircle className="h-3 w-3 ml-1" />}
              </Button>
            );
          })}
        </div>
      )}

      {/* Active form */}
      {activeForm && activeForm.sections.length > 0 ? (
        <FormRenderer
          key={activeForm.id}
          formName={activeForm.name}
          sections={activeForm.sections}
          initialData={formDataMap[activeForm.id] || {}}
          onSaveDraft={onSaveDraft}
          onSubmit={isLast ? onSubmit : async (data) => {
            // Auto-save and go to next
            onFormDataChange(activeForm.id, data);
            await onSaveDraft(data);
            handleNext();
          }}
          saving={saving}
        />
      ) : activeForm ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>This form has no fields configured yet.</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={handlePrev} disabled={isFirst}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <div className="text-sm text-muted-foreground">
          {activeForm?.name}
        </div>
        <Button variant="outline" onClick={handleNext} disabled={isLast}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
