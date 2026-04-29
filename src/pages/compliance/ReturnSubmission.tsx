import { useState, useEffect, useMemo, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { Loader2, ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Save, XCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { FormSection, FormField } from '@/types/formBuilder';

interface ReturnConfig {
  id: string;
  name: string;
  frequency: string;
  due_day: number;
  form_id: string | null;
  return_template_id: string | null;
  sector_id: string | null;
  sub_sector_id: string | null;
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

interface LicenseOption {
  id: string;
  license_number: string;
  license_type: string;
  holder_id: string;
  licensee_id?: string | null;
  licensee_name?: string;
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

type Step = 'create' | 'fill';

export default function ReturnSubmission() {
  const { user } = useAuth();
  const { isPpoc, mappedLicensees } = usePpoc();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnId = searchParams.get('returnId');

  const [configs, setConfigs] = useState<ReturnConfig[]>([]);
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [existingReturn, setExistingReturn] = useState<ComplianceReturn | null>(null);

  // Creation form state
  const [step, setStep] = useState<Step>(returnId ? 'fill' : 'create');
  const [selectedLicenseeId, setSelectedLicenseeId] = useState('');
  const [selectedLicenseId, setSelectedLicenseId] = useState('');
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [uploadType] = useState('manual');
  const [returnName, setReturnName] = useState('');
  const [creating, setCreating] = useState(false);

  // Form filling state
  const [formSections, setFormSections] = useState<FormSection[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isPpoc) return;

    const validSelectedLicensee = mappedLicensees.some(l => l.licensee_id === selectedLicenseeId);
    if (!selectedLicenseeId || !validSelectedLicensee) {
      setSelectedLicenseeId(mappedLicensees[0]?.licensee_id || '');
    }
  }, [isPpoc, mappedLicensees, selectedLicenseeId]);

  useEffect(() => {
    if (!isPpoc || step !== 'create') return;

    if (!selectedLicenseId) return;
    const selectedLicense = licenses.find(l => l.id === selectedLicenseId);
    if (!selectedLicense || selectedLicense.licensee_id !== selectedLicenseeId) {
      setSelectedLicenseId('');
    }
  }, [isPpoc, step, selectedLicenseeId, selectedLicenseId, licenses]);

  const loadInitial = async () => {
    setLoading(true);
    const [configRes, licenseRes] = await Promise.all([
      supabase.from('return_configurations' as any).select('*').eq('is_active', true),
      supabase
        .from('licenses')
        .select('id, license_number, license_type, holder_id')
        .eq('status', 'active'),
    ]);
    setConfigs((configRes.data || []) as any);

    // Resolve licensee_id for each license via holder_id -> profile.licensee_id
    const rawLicenses = (licenseRes.data || []) as any[];
    let enrichedLicenses: LicenseOption[] = rawLicenses.map(l => ({ ...l }));
    const holderIds = Array.from(new Set(rawLicenses.map(l => l.holder_id).filter(Boolean)));
    if (holderIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, licensee_id')
        .in('id', holderIds);
      const profMap = Object.fromEntries(((profs || []) as any[]).map(p => [p.id, p.licensee_id]));
      const licenseeIds = Array.from(new Set(Object.values(profMap).filter(Boolean) as string[]));
      const licMap: Record<string, string> = {};
      if (licenseeIds.length > 0) {
        const { data: lics } = await supabase.from('licensees').select('id, name').in('id', licenseeIds);
        for (const l of (lics || []) as any[]) licMap[l.id] = l.name;
      }
      enrichedLicenses = rawLicenses.map(l => {
        const lid = profMap[l.holder_id] || null;
        return {
          id: l.id,
          license_number: l.license_number,
          license_type: l.license_type,
          holder_id: l.holder_id,
          licensee_id: lid,
          licensee_name: lid ? licMap[lid] : undefined,
        };
      });
    }
    setLicenses(enrichedLicenses);

    if (returnId) {
      const { data: retData } = await supabase.from('compliance_returns' as any).select('*').eq('id', returnId).single();
      if (retData) {
        setExistingReturn(retData as any);
        setSelectedConfigId((retData as any).return_config_id || '');
        setSelectedLicenseId((retData as any).license_id || '');
        if ((retData as any).on_behalf_of_licensee_id) {
          setSelectedLicenseeId((retData as any).on_behalf_of_licensee_id);
        }
        const config = (configRes.data || []).find((c: any) => c.id === (retData as any).return_config_id) as any;
        if (config) {
          const existingFormData = (retData as any).form_data || {};
          if (existingFormData.__multiFormData) {
            setFormDataMap(existingFormData.__multiFormData);
          } else {
            setFormDataMap({ '_single': existingFormData });
          }
          await loadFormsForConfig(config, existingFormData);
        }
        setStep('fill');
      }
    }
    setLoading(false);
  };

  // Auto-generate return name based on selections
  useEffect(() => {
    if (!selectedConfigId || !periodEnd) {
      setReturnName('');
      return;
    }
    const config = configs.find(c => c.id === selectedConfigId);
    const license = licenses.find(l => l.id === selectedLicenseId);
    if (config) {
      const dateObj = new Date(periodEnd);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const licensePart = license ? `_${license.license_number}` : '';
      const name = `${config.name}${licensePart}_${year}${month}${day}_0001`;
      setReturnName(name);
    }
  }, [selectedConfigId, periodEnd, selectedLicenseId, configs, licenses]);

  const handleCreate = async () => {
    if (!selectedConfigId) {
      toast.error('Please select a return type');
      return;
    }
    if (!periodEnd) {
      toast.error('Please select the return period end date');
      return;
    }
    if (!user) return;

    // PPOC must select both a mapped licensee and a license under that licensee.
    if (isPpoc) {
      if (!selectedLicenseeId) {
        toast.error('Please select the licensee to file this return for');
        return;
      }
      if (!selectedLicenseId) {
        toast.error('Please select the license to file this return for');
        return;
      }
      const lic = licenses.find(l => l.id === selectedLicenseId);
      if (!lic || lic.licensee_id !== selectedLicenseeId) {
        toast.error('Selected license does not belong to the chosen licensee');
        return;
      }
    }

    setCreating(true);
    const config = configs.find(c => c.id === selectedConfigId);
    const dateObj = new Date(periodEnd);
    // Calculate period start based on frequency
    let periodStart: string;
    const freq = config?.frequency || 'monthly';
    if (freq === 'yearly') {
      periodStart = new Date(dateObj.getFullYear(), 0, 1).toISOString().split('T')[0];
    } else if (freq === 'quarterly') {
      const qMonth = Math.floor(dateObj.getMonth() / 3) * 3;
      periodStart = new Date(dateObj.getFullYear(), qMonth, 1).toISOString().split('T')[0];
    } else {
      periodStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).toISOString().split('T')[0];
    }
    const dueDay = config?.due_day || 15;
    const dueDate = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, dueDay).toISOString().split('T')[0];

    const { data: newReturn, error } = await supabase.from('compliance_returns' as any).insert({
      return_config_id: selectedConfigId,
      license_id: selectedLicenseId || null,
      submitter_id: user.id,
      // Tag the submission to the licensee the PPOC is acting for. Stays null for
      // licensee_primary/secondary users acting for their own entity.
      on_behalf_of_licensee_id: isPpoc ? selectedLicenseeId || null : null,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: dueDate,
      form_data: {},
      status: 'draft',
    } as any).select().single();

    if (error) {
      toast.error(error.message);
      setCreating(false);
      return;
    }

    setExistingReturn(newReturn as any);
    toast.success('Return created successfully');

    // Load form for filling
    if (config) {
      await loadFormsForConfig(config as any);
    }
    setStep('fill');
    setCreating(false);
  };

  // ──────────── Form loading logic ────────────

  const loadFormsForConfig = async (config: ReturnConfig, existingData?: any) => {
    setFormLoading(true);
    setIsMultiForm(false);
    setMultiFormTemplates([]);
    setFormSections([]);
    setActiveFormIdx(0);

    if (config.return_template_id) {
      await loadMultiFormTemplate(config.return_template_id, existingData);
    } else if (config.form_id) {
      await loadSingleForm(config.form_id);
    } else {
      setFormSections([]);
    }
    setFormLoading(false);
  };

  const loadMultiFormTemplate = async (returnTemplateId: string, existingData?: any) => {
    const { data: templates } = await supabase.from('form_templates' as any)
      .select('id, name, sheet_name, status, tab_name, form_order')
      .eq('return_template_id', returnTemplateId)
      .eq('status', 'published')
      .order('form_order');

    if (!templates || templates.length === 0) { setFormLoading(false); return; }

    const tplList = templates as any[];
    const versionPromises = tplList.map(tpl =>
      supabase.from('form_versions' as any)
        .select('id, schema_snapshot')
        .eq('template_id', tpl.id)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1)
    );
    const versionResults = await Promise.all(versionPromises);

    const versionIdMap = new Map<string, { tplIdx: number; versionId: string; snapshot: any }>();
    const allVersionIds: string[] = [];
    for (let i = 0; i < tplList.length; i++) {
      const versions = versionResults[i].data;
      if (versions && versions.length > 0) {
        const v = versions[0] as any;
        versionIdMap.set(tplList[i].id, { tplIdx: i, versionId: v.id, snapshot: v.schema_snapshot });
        allVersionIds.push(v.id);
      }
    }

    let allFields: any[] = [];
    if (allVersionIds.length > 0) {
      const { data: fieldsData } = await supabase.from('form_fields' as any)
        .select('*')
        .in('version_id', allVersionIds)
        .order('section_order')
        .order('sort_order');
      allFields = (fieldsData || []) as any[];
    }

    const fieldsByVersion = new Map<string, any[]>();
    for (const f of allFields) {
      const vid = f.version_id;
      if (!fieldsByVersion.has(vid)) fieldsByVersion.set(vid, []);
      fieldsByVersion.get(vid)!.push(f);
    }

    const formTemplates: MultiFormTemplate[] = [];
    for (let i = 0; i < tplList.length; i++) {
      const tpl = tplList[i];
      const vInfo = versionIdMap.get(tpl.id);
      let sections: FormSection[] = [];

      if (vInfo) {
        const fields = fieldsByVersion.get(vInfo.versionId);
        if (fields && fields.length > 0) {
          sections = groupFieldsIntoSections(fields);
        } else if (vInfo.snapshot && Array.isArray(vInfo.snapshot) && vInfo.snapshot.length > 0) {
          sections = convertSnapshotToSections(vInfo.snapshot);
        }
      }

      formTemplates.push({
        id: tpl.id,
        name: tpl.name || tpl.sheet_name || `Form ${formTemplates.length + 1}`,
        tabName: tpl.tab_name || '',
        formOrder: tpl.form_order || 0,
        sections,
      });
    }

    setMultiFormTemplates(formTemplates);
    setIsMultiForm(true);

    if (!existingData?.__multiFormData) {
      const initial: Record<string, Record<string, any>> = {};
      formTemplates.forEach(t => { initial[t.id] = existingData || {}; });
      setFormDataMap(prev => {
        if (Object.keys(prev).length > 0 && prev['_single']) {
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
        if (sections.length > 0) { setFormSections(sections); return; }
      }
    }

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
    if (!rows || rows.length === 0) return [];
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

  // Multi-form grouping
  const formGroups = useMemo(() => {
    if (!isMultiForm || multiFormTemplates.length === 0) return null;
    const groups = new Map<string, MultiFormTemplate[]>();
    let hasGroups = false;
    for (const tpl of multiFormTemplates) {
      const tab = tpl.tabName?.trim();
      if (tab) {
        hasGroups = true;
        if (!groups.has(tab)) groups.set(tab, []);
        groups.get(tab)!.push(tpl);
      } else {
        const match = tpl.name.match(/^([A-Z])\./i);
        if (match) {
          hasGroups = true;
          const letter = match[1].toUpperCase();
          if (!groups.has(letter)) groups.set(letter, []);
          groups.get(letter)!.push(tpl);
        }
      }
    }
    if (!hasGroups) {
      groups.set('All', multiFormTemplates);
    }
    for (const [, forms] of groups) {
      forms.sort((a, b) => a.formOrder - b.formOrder);
    }
    return groups;
  }, [isMultiForm, multiFormTemplates]);

  const groupKeys = useMemo(() => formGroups ? Array.from(formGroups.keys()).sort() : [], [formGroups]);
  const [activeGroupKey, setActiveGroupKey] = useState('');

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

  const getMergedFormData = useCallback(() => {
    if (isMultiForm) {
      return { __multiFormData: formDataMap };
    }
    return formDataMap['_single'] || {};
  }, [isMultiForm, formDataMap]);

  const handleSaveDraft = async (data: Record<string, any>) => {
    if (!user) return;
    setSaving(true);

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
      const pStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const pEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const dueDay = config?.due_day || 15;
      const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay).toISOString().split('T')[0];

      const { data: newReturn, error } = await supabase.from('compliance_returns' as any).insert({
        return_config_id: selectedConfigId || null,
        license_id: selectedLicenseId || null,
        submitter_id: user.id,
        on_behalf_of_licensee_id: isPpoc ? selectedLicenseeId || null : null,
        period_start: pStart,
        period_end: pEnd,
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
      const pStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const pEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const dueDay = config?.due_day || 15;
      const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay).toISOString().split('T')[0];

      const { error } = await supabase.from('compliance_returns' as any).insert({
        return_config_id: selectedConfigId || null,
        license_id: selectedLicenseId || null,
        submitter_id: user.id,
        on_behalf_of_licensee_id: isPpoc ? selectedLicenseeId || null : null,
        period_start: pStart,
        period_end: pEnd,
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

  // ──────────── STEP: CREATE ────────────
  if (step === 'create') {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <PageHeader
            title="New Return Submission"
            description="Create a new compliance return submission"
            actions={<Button variant="outline" onClick={() => navigate('/compliance/returns')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>}
          />

          {/* PPOC must select a licensee from the header before proceeding */}
          {isPpoc && !activeLicenseeId && (
            <Alert variant="destructive" className="max-w-2xl">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Select a licensee from the switcher at the top of the page before creating a return.
              </AlertDescription>
            </Alert>
          )}

          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base">
                Return Details
                {isPpoc && activeLicensee && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    — for <strong className="text-foreground">{activeLicensee.licensee_name}</strong>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Return For (License) */}
              <div className="space-y-2">
                <Label>
                  Return For {isPpoc && <span className="text-destructive">*</span>}
                </Label>
                <Select value={selectedLicenseId} onValueChange={setSelectedLicenseId}>
                  <SelectTrigger><SelectValue placeholder={isPpoc ? `Select license of ${activeLicensee?.licensee_name || 'licensee'}...` : 'Select license...'} /></SelectTrigger>
                  <SelectContent>
                    {(isPpoc
                      ? licenses.filter(l => l.licensee_id === activeLicenseeId)
                      : licenses
                    ).map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.license_number} — {l.license_type}
                      </SelectItem>
                    ))}
                    {isPpoc && licenses.filter(l => l.licensee_id === activeLicenseeId).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No active licenses found for this licensee.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Return Period End */}
              <div className="space-y-2">
                <Label>Return Period End <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={e => setPeriodEnd(e.target.value)}
                />
              </div>

              {/* Return Type (config) */}
              <div className="space-y-2">
                <Label>Return Type <span className="text-destructive">*</span></Label>
                <Select value={selectedConfigId} onValueChange={setSelectedConfigId}>
                  <SelectTrigger><SelectValue placeholder="Select return type..." /></SelectTrigger>
                  <SelectContent>
                    {configs.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.frequency.charAt(0).toUpperCase() + c.frequency.slice(1)} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Upload Type */}
              <div className="space-y-2">
                <Label>Upload Type <span className="text-destructive">*</span></Label>
                <RadioGroup value={uploadType} className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="manual" id="upload-manual" />
                    <Label htmlFor="upload-manual" className="font-normal cursor-pointer">Manual</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Return Name (auto-generated, read-only) */}
              <div className="space-y-2">
                <Label>Return Name <span className="text-destructive">*</span></Label>
                <Input
                  value={returnName}
                  readOnly
                  className="bg-muted"
                  placeholder="Auto-generated based on selections"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={() => navigate('/compliance/returns')}
                  className="gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating || !selectedConfigId || !periodEnd || (isPpoc && (!activeLicenseeId || !selectedLicenseId))}
                  className="gap-2"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ──────────── STEP: FILL FORM ────────────
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={existingReturn ? 'Edit Return Submission' : 'New Return Submission'}
          description="Fill in the compliance return form and submit for review"
          actions={<Button variant="outline" onClick={() => navigate('/compliance/returns')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>}
        />

        {existingReturn && (
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><p className="text-muted-foreground">Return Type</p><p className="font-medium">{configs.find(c => c.id === existingReturn.return_config_id)?.name || '—'}</p></div>
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
      <Card>
        <CardContent className="pt-6 pb-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Form {globalIdx + 1} of {totalFormCount}</span>
            <span className="font-medium">{completedCount} completed</span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

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

      {activeForm && activeForm.sections.length > 0 ? (
        <FormRenderer
          key={activeForm.id}
          formName={activeForm.name}
          sections={activeForm.sections}
          initialData={formDataMap[activeForm.id] || {}}
          onSaveDraft={onSaveDraft}
          onSubmit={isLast ? onSubmit : async (data) => {
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

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={handlePrev} disabled={isFirst}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <div className="text-sm text-muted-foreground">{activeForm?.name}</div>
        <Button variant="outline" onClick={handleNext} disabled={isLast}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
