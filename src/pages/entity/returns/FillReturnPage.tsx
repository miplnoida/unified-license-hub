import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useParams, useNavigate } from 'react-router-dom';
import { useReturnById, useReturnConfigForms, useReturnFormData, useSaveReturnFormData, useMutateReturn, useInsertReturnAudit, useReturnRequests, useReturnComments } from '@/hooks/useReturnsManagement';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from './EntityReturnsDashboard';
import { Save, Send, ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { format, differenceInDays } from 'date-fns';

export default function FillReturnPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: returnData, isLoading: loadingReturn } = useReturnById(id);
  const { data: configForms = [] } = useReturnConfigForms(returnData?.return_configuration_id);
  const { data: formData = [] } = useReturnFormData(id);
  const saveFormData = useSaveReturnFormData();
  const { update: updateReturn } = useMutateReturn();
  const insertAudit = useInsertReturnAudit();
  const { data: requests = [] } = useReturnRequests(id);
  const { data: comments = [] } = useReturnComments(id);

  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [activeTab, setActiveTab] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveRef = useRef<NodeJS.Timeout>();

  // Load form fields for each assigned form
  const formIds = configForms.map(f => f.form_id);
  const { data: allFields = [] } = useQuery({
    queryKey: ['return_form_fields', formIds],
    enabled: formIds.length > 0,
    queryFn: async () => {
      const results: any[] = [];
      for (const fid of formIds) {
        const { data: versions } = await supabase.from('form_versions').select('id').eq('template_id', fid).eq('status', 'published').order('version', { ascending: false }).limit(1);
        if (versions?.[0]) {
          const { data: fields } = await supabase.from('form_fields').select('*').eq('version_id', versions[0].id).order('section_order').order('sort_order');
          if (fields) results.push(...fields.map(f => ({ ...f, _form_id: fid })));
        }
      }
      return results;
    },
  });

  // Initialize values from saved data
  useEffect(() => {
    if (formData.length > 0 && Object.keys(values).length === 0) {
      const init: Record<string, Record<string, string>> = {};
      formData.forEach(d => {
        if (!init[d.form_id]) init[d.form_id] = {};
        init[d.form_id][d.field_id] = d.field_value || '';
      });
      setValues(init);
    }
  }, [formData]);

  // Set initial tab
  useEffect(() => {
    if (configForms.length > 0 && !activeTab) {
      const tabs = [...new Set(configForms.map(f => f.tab_name))];
      if (tabs.length > 0) setActiveTab(tabs[0]);
    }
  }, [configForms]);

  // Auto-save every 60 seconds
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (id && Object.keys(values).length > 0) handleSave(true);
    }, 60000);
    return () => clearInterval(autoSaveRef.current);
  }, [values, id]);

  const handleSave = useCallback(async (auto = false) => {
    if (!id || saving) return;
    setSaving(true);
    try {
      for (const [formId, fieldMap] of Object.entries(values)) {
        const fields = Object.entries(fieldMap).map(([fid, val]) => ({
          field_id: fid, field_name: fid, field_value: val,
        }));
        if (fields.length > 0) await saveFormData.mutateAsync({ returnId: id, formId, fields });
      }
      // Transition TEMP → WIP on first save
      if (returnData?.workflow_status === 'TEMP') {
        updateReturn.mutate({ id, workflow_status: 'WIP', updated_by: user?.id });
        insertAudit.mutate({ return_id: id, action: 'draft_saved', previous_status: 'TEMP', new_status: 'WIP', performed_by: user?.id });
      }
      setLastSaved(new Date());
      if (!auto) toast.success('Draft saved');
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  }, [id, values, returnData, saving]);

  const handleSubmit = async () => {
    // Validate required fields
    const requiredFields = allFields.filter(f => f.required);
    const missing: string[] = [];
    for (const f of requiredFields) {
      const val = values[f._form_id]?.[f.id];
      if (!val || val.trim() === '') missing.push(f.label);
    }
    if (missing.length > 0) {
      toast.error(`Please fill required fields: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}`);
      return;
    }

    const result = await Swal.fire({
      title: 'Submit Return?',
      html: `<p>You are about to submit <strong>${returnData?.unique_id}</strong> for review.</p><p>This action cannot be undone.</p>`,
      icon: 'question', showCancelButton: true, confirmButtonText: 'Submit',
    });
    if (!result.isConfirmed) return;

    // Save first
    await handleSave(true);

    const now = new Date();
    const dueDate = returnData?.due_date ? new Date(returnData.due_date) : null;
    const ontime = dueDate ? (now <= dueDate ? 'ON_TIME' : 'LATE') : null;

    updateReturn.mutate({
      id, workflow_status: 'SUB', submit_date: now.toISOString(), ontime_status: ontime, updated_by: user?.id,
    }, {
      onSuccess: () => {
        insertAudit.mutate({ return_id: id, action: 'submitted', previous_status: returnData?.workflow_status, new_status: 'SUB', performed_by: user?.id });
        toast.success('Return submitted successfully!');
        navigate(`/entity/returns/${id}/view`);
      },
    });
  };

  const updateValue = (formId: string, fieldId: string, value: string) => {
    setValues(prev => ({ ...prev, [formId]: { ...prev[formId], [fieldId]: value } }));
  };

  if (loadingReturn) return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></DashboardLayout>;
  if (!returnData) return <DashboardLayout><p className="text-center py-20">Return not found</p></DashboardLayout>;

  const tabs = [...new Set(configForms.map(f => f.tab_name))];
  const tabIndex = tabs.indexOf(activeTab);
  const daysLeft = returnData.due_date ? differenceInDays(new Date(returnData.due_date), new Date()) : null;

  // Active TBR request
  const activeRequest = requests.find(r => r.status === 'active');

  return (
    <DashboardLayout>
      <div className="space-y-4">
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
                <Clock className="h-3 w-3 mr-1" />{daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
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
              {comments.map(c => <p key={c.id} className="text-sm mt-1">• {c.comment_text}</p>)}
            </AlertDescription>
          </Alert>
        )}

        {/* Tabbed forms */}
        {tabs.length > 0 && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto">
              {tabs.map(tab => {
                const tabForms = configForms.filter(f => f.tab_name === tab);
                const tabFields = allFields.filter(f => tabForms.some(tf => tf.form_id === f._form_id));
                const filledRequired = tabFields.filter(f => f.required).every(f => values[f._form_id]?.[f.id]);
                return (
                  <TabsTrigger key={tab} value={tab} className="gap-1">
                    {tab} {filledRequired && tabFields.filter(f => f.required).length > 0 && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {tabs.map(tab => (
              <TabsContent key={tab} value={tab} className="space-y-4">
                {configForms.filter(f => f.tab_name === tab).sort((a, b) => a.display_order - b.display_order).map(cf => {
                  const formFields = allFields.filter(f => f._form_id === cf.form_id);
                  return (
                    <Card key={cf.id}>
                      <CardHeader className="pb-3"><CardTitle className="text-base">{cf.form_templates?.name || 'Form'}</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        {formFields.map(field => (
                          <div key={field.id} className="space-y-1.5">
                            <Label className="text-sm">{field.label} {field.required && <span className="text-destructive">*</span>}</Label>
                            {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
                            <FieldInput field={field} value={values[cf.form_id]?.[field.id] || ''} onChange={v => updateValue(cf.form_id, field.id, v)} />
                          </div>
                        ))}
                        {formFields.length === 0 && <p className="text-sm text-muted-foreground">No fields defined for this form</p>}
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Navigation + Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-card border rounded-lg p-4 sticky bottom-0 z-10">
          <div className="flex gap-2">
            {tabIndex > 0 && <Button variant="outline" onClick={() => setActiveTab(tabs[tabIndex - 1])}><ArrowLeft className="h-4 w-4 mr-2" />Previous</Button>}
            {tabIndex < tabs.length - 1 && <Button variant="outline" onClick={() => setActiveTab(tabs[tabIndex + 1])}>Next <ArrowRight className="h-4 w-4 ml-2" /></Button>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Draft'}</Button>
            {tabIndex === tabs.length - 1 && (
              <Button onClick={handleSubmit} disabled={saving}><Send className="h-4 w-4 mr-2" />Submit Return</Button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function FieldInput({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
  const type = field.field_type;
  if (type === 'textarea') return <Textarea value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />;
  if (type === 'select' || type === 'dropdown') {
    const opts = Array.isArray(field.options) ? field.options : [];
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={field.placeholder || 'Select...'} /></SelectTrigger>
        <SelectContent>{opts.map((o: any) => <SelectItem key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>{typeof o === 'string' ? o : o.label}</SelectItem>)}</SelectContent>
      </Select>
    );
  }
  if (type === 'checkbox') return <Checkbox checked={value === 'true'} onCheckedChange={v => onChange(String(v))} />;
  if (type === 'number') return <Input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />;
  if (type === 'date') return <Input type="date" value={value} onChange={e => onChange(e.target.value)} />;
  return <Input value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />;
}
