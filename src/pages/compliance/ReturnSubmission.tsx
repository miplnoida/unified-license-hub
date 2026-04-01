import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import type { FormSection, FormField } from '@/types/formBuilder';

interface ReturnConfig {
  id: string;
  name: string;
  frequency: string;
  due_day: number;
  form_id: string | null;
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
  const [formSections, setFormSections] = useState<FormSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
        const config = (configData || []).find((c: any) => c.id === (retData as any).return_config_id);
        if (config && (config as any).form_id) {
          await loadFormFields((config as any).form_id);
        }
      }
    }
    setLoading(false);
  };

  const loadFormFields = async (formId: string) => {
    setFormLoading(true);
    const { data: versions } = await supabase.from('form_versions' as any)
      .select('*').eq('template_id', formId).eq('status', 'published').order('version', { ascending: false }).limit(1);

    if (versions && versions.length > 0) {
      const versionId = (versions[0] as any).id;
      const { data: fields } = await supabase.from('form_fields' as any).select('*').eq('version_id', versionId).order('section_order').order('sort_order');
      if (fields && fields.length > 0) {
        const sections = groupFieldsIntoSections(fields as any[]);
        setFormSections(sections);
        setFormLoading(false);
        return;
      }
      // Fallback: try schema_snapshot from the version
      const snapshot = (versions[0] as any).schema_snapshot;
      if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) {
        const sections = convertSnapshotToSections(snapshot);
        if (sections.length > 0) {
          setFormSections(sections);
          setFormLoading(false);
          return;
        }
      }
    }

    // Fallback: try forms table
    const { data: formData } = await supabase.from('forms' as any).select('*').eq('id', formId).single();
    if (formData && (formData as any).rows) {
      const sections = convertRowsToSections((formData as any).rows as any[]);
      setFormSections(sections);
    }
    setFormLoading(false);
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
    const config = configs.find(c => c.id === configId);
    if (config?.form_id) {
      await loadFormFields(config.form_id);
    } else {
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
  };

  const handleSaveDraft = async (data: Record<string, any>) => {
    if (!user) return;
    if (existingReturn) {
      const { error } = await supabase.from('compliance_returns' as any)
        .update({ form_data: data, status: 'draft' } as any).eq('id', existingReturn.id);
      if (error) { toast.error(error.message); return; }
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
        form_data: data,
        status: 'draft',
      } as any).select().single();
      if (error) { toast.error(error.message); return; }
      setExistingReturn(newReturn as any);
      toast.success('Draft saved');
    }
  };

  const handleSubmitReturn = async (data: Record<string, any>) => {
    if (!user) return;
    if (existingReturn) {
      const { error } = await supabase.from('compliance_returns' as any)
        .update({ form_data: data, status: 'submitted', submitted_at: new Date().toISOString() } as any)
        .eq('id', existingReturn.id);
      if (error) { toast.error(error.message); return; }
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
        form_data: data,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      } as any);
      if (error) { toast.error(error.message); return; }
    }
    setSubmitted(true);
    toast.success('Return submitted successfully');
  };

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
        ) : formSections.length > 0 ? (
          <FormRenderer
            formName={existingReturn ? 'Edit Return' : 'Return Submission'}
            sections={formSections}
            initialData={existingReturn?.form_data || {}}
            onSaveDraft={handleSaveDraft}
            onSubmit={handleSubmitReturn}
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
