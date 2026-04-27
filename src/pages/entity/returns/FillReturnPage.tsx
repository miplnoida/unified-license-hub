import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useReturnById, useReturnConfigForms, useReturnFormData,
  useSaveReturnFormData, useMutateReturn, useInsertReturnAudit,
  useReturnRequests, useReturnComments,
} from '@/hooks/useReturnsManagement';
import { useLatestPublishedVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { ReviewAcknowledgement } from '@/components/applications/ReviewAcknowledgement';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from './EntityReturnsDashboard';
import { Save, Send, ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Clock, Eye } from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import { format, differenceInDays } from 'date-fns';

/* ------------------------------------------------------------------ */
/*  Sub-component: renders a single form template using FormRenderer  */
/* ------------------------------------------------------------------ */
interface SingleReturnFormProps {
  formTemplateId: string;
  initialData: Record<string, any>;
  readOnly: boolean;
  onDataChange: (formId: string, data: Record<string, any>) => void;
  saving?: boolean;
}

function SingleReturnForm({ formTemplateId, initialData, readOnly, onDataChange, saving }: SingleReturnFormProps) {
  const { data: latestVersion, isLoading: lvLoading } = useLatestPublishedVersion(formTemplateId);
  const { data: sections = [], isLoading: sLoading } = useVersionSections(latestVersion?.id || null);

  if (lvLoading || sLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading form...
      </div>
    );
  }

  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No fields defined for this form.</p>;
  }

  return (
    <FormRenderer
      formName=""
      sections={sections}
      initialData={initialData}
      onSaveDraft={(data) => onDataChange(formTemplateId, data)}
      onSubmit={(data) => onDataChange(formTemplateId, data)}
      readOnly={readOnly}
      saving={saving}
      showFullTabTitles
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */
export default function FillReturnPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: returnData, isLoading: loadingReturn } = useReturnById(id);
  const { data: configForms = [] } = useReturnConfigForms(returnData?.return_configuration_id);
  const { data: fallbackConfigForms = [], isLoading: loadingFallbackForms } = useQuery({
    queryKey: [
      'fallback_return_forms',
      returnData?.return_configuration_id,
      returnData?.return_configs?.sector_id,
      returnData?.return_configs?.subsector_id,
    ],
    enabled: !!returnData?.return_configuration_id && configForms.length === 0,
    queryFn: async () => {
      const config = returnData?.return_configs;
      if (!config?.sector_id) return [];

      const fetchTemplates = async (matchSubSector: boolean) => {
        let query = supabase
          .from('form_templates')
          .select('id, name, description, status, form_type, tab_name, form_order, return_template_id, sector_id, sub_sector_id, created_at')
          .eq('status', 'published')
          .eq('form_type', 'returns')
          .eq('sector_id', config.sector_id);

        if (matchSubSector && config.subsector_id) {
          query = query.eq('sub_sector_id', config.subsector_id);
        }

        const { data, error } = await query.order('form_order', { ascending: true }).order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      };

      const exactMatches = await fetchTemplates(true);
      const sectorMatches = exactMatches.length > 0 ? exactMatches : await fetchTemplates(false);

      if (sectorMatches.length === 0) return [];

      const grouped = sectorMatches.reduce<Record<string, any[]>>((acc, template) => {
        const key = template.return_template_id || '__ungrouped__';
        if (!acc[key]) acc[key] = [];
        acc[key].push(template);
        return acc;
      }, {});

      const bestGroup = Object.values(grouped)
        .sort((a, b) => {
          if (b.length !== a.length) return b.length - a.length;
          return new Date(b[0]?.created_at || 0).getTime() - new Date(a[0]?.created_at || 0).getTime();
        })[0] || [];

      return bestGroup
        .sort((a, b) => (a.form_order || 0) - (b.form_order || 0))
        .map((template, index) => ({
          id: `fallback-${template.id}`,
          form_id: template.id,
          return_configuration_id: returnData!.return_configuration_id,
          tab_name: (template.tab_name || template.name || 'General').trim() || 'General',
          display_order: template.form_order ?? index,
          status: 'active',
          form_templates: {
            id: template.id,
            name: template.name,
            description: template.description,
            status: template.status,
          },
        }));
    },
  });
  const { data: savedFormData = [] } = useReturnFormData(id);
  const saveFormData = useSaveReturnFormData();
  const { update: updateReturn } = useMutateReturn();
  const insertAudit = useInsertReturnAudit();
  const { data: requests = [] } = useReturnRequests(id);
  const { data: comments = [] } = useReturnComments(id);

  const effectiveConfigForms = configForms.length > 0 ? configForms : fallbackConfigForms;

  // Store all form data keyed by formTemplateId → { [fieldName]: value }
  const [allData, setAllData] = useState<Record<string, Record<string, any>>>({});
  const [activeTab, setActiveTab] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveRef = useRef<NodeJS.Timeout>();
  const initializedRef = useRef(false);

  // Build initial data from saved return_form_data rows
  // return_form_data stores field_name (the fieldName key) and field_value
  useEffect(() => {
    if (savedFormData.length > 0 && !initializedRef.current) {
      const init: Record<string, Record<string, any>> = {};
      for (const row of savedFormData) {
        if (!init[row.form_id]) init[row.form_id] = {};
        // field_name is the fieldName key used by FormRenderer
        init[row.form_id][row.field_name] = row.field_value || '';
      }
      setAllData(init);
      initializedRef.current = true;
    }
  }, [savedFormData]);

  // Set initial tab
  const tabs = useMemo(() => {
    const t = [...new Set(effectiveConfigForms.map((f: any) => f.tab_name || 'General'))];
    return t;
  }, [effectiveConfigForms]);

  useEffect(() => {
    if (tabs.length > 0 && !activeTab) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  // Auto-save every 60 seconds
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (id && Object.keys(allData).length > 0) handleSave(true);
    }, 60000);
    return () => clearInterval(autoSaveRef.current);
  }, [allData, id]);

  const handleDataChange = useCallback((formId: string, data: Record<string, any>) => {
    setAllData(prev => ({ ...prev, [formId]: data }));
  }, []);

  const handleSave = useCallback(async (auto = false) => {
    if (!id || saving) return;
    setSaving(true);
    try {
      for (const [formId, dataMap] of Object.entries(allData)) {
        const fields = Object.entries(dataMap)
          .filter(([key]) => key !== '__repeatable' && !key.startsWith('_repeatable_'))
          .map(([fieldName, val]) => ({
            field_id: fieldName, // using fieldName as field_id for upsert
            field_name: fieldName,
            field_value: typeof val === 'object' ? JSON.stringify(val) : String(val ?? ''),
          }));
        if (fields.length > 0) {
          await saveFormData.mutateAsync({ returnId: id, formId, fields });
        }
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
  }, [id, allData, returnData, saving]);

  const handleSubmit = async (ackText?: string) => {
    const result = await Swal.fire({
      title: 'Submit Return?',
      html: `<p>You are about to submit <strong>${returnData?.unique_id}</strong> for review.</p><p>This action cannot be undone.</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Submit',
    });
    if (!result.isConfirmed) return;

    // Save first
    await handleSave(true);

    const now = new Date();
    const dueDate = returnData?.due_date ? new Date(returnData.due_date) : null;
    const ontime = dueDate ? (now <= dueDate ? 'ON_TIME' : 'LATE') : null;

    // Persist acknowledgement metadata on compliance_returns (best-effort)
    if (id && ackText) {
      await supabase
        .from('compliance_returns' as any)
        .update({
          ack_by: user?.id,
          ack_at: now.toISOString(),
          ack_text: String(ackText).slice(0, 4000),
        })
        .eq('id', id);
    }

    updateReturn.mutate({
      id,
      workflow_status: 'SUB',
      submit_date: now.toISOString(),
      ontime_status: ontime,
      updated_by: user?.id,
    }, {
      onSuccess: () => {
        insertAudit.mutate({
          return_id: id,
          action: 'submitted',
          previous_status: returnData?.workflow_status,
          new_status: 'SUB',
          performed_by: user?.id,
        });
        toast.success('Return submitted successfully!');
        navigate(`/entity/returns/${id}/view`);
      },
    });
  };

  if (loadingReturn) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!returnData) {
    return (
      <DashboardLayout>
        <p className="text-center py-20">Return not found</p>
      </DashboardLayout>
    );
  }

  const tabIndex = tabs.indexOf(activeTab);
  const daysLeft = returnData.due_date ? differenceInDays(new Date(returnData.due_date), new Date()) : null;
  const activeRequest = requests.find((r: any) => r.status === 'active');
  const isEditable = ['TEMP', 'WIP', 'TBR'].includes(returnData.workflow_status);

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
                <Clock className="h-3 w-3 mr-1" />
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
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
              {comments.map((c: any) => <p key={c.id} className="text-sm mt-1">• {c.comment_text}</p>)}
            </AlertDescription>
          </Alert>
        )}

        {/* Tabbed forms using FormRenderer */}
        {(tabs.length > 0 || loadingFallbackForms) && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto">
              {tabs.map(tab => (
                <TabsTrigger key={tab} value={tab} className="gap-1">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>

            {tabs.map(tab => {
              const tabForms = effectiveConfigForms
                .filter((f: any) => (f.tab_name || 'General') === tab)
                .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));

              return (
                <TabsContent key={tab} value={tab} className="space-y-4">
                  {tabForms.map((cf: any) => (
                    <Card key={cf.id}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          {cf.form_templates?.name || 'Form'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <SingleReturnForm
                          formTemplateId={cf.form_id}
                          initialData={allData[cf.form_id] || {}}
                          readOnly={!isEditable}
                          onDataChange={handleDataChange}
                          saving={saving}
                        />
                      </CardContent>
                    </Card>
                  ))}
                  {tabForms.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4">No forms assigned to this tab.</p>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        {!loadingFallbackForms && tabs.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No published return forms are linked to this return configuration yet.
            </CardContent>
          </Card>
        )}

        {/* Navigation + Actions */}
        {isEditable && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-card border rounded-lg p-4 sticky bottom-0 z-10">
            <div className="flex gap-2">
              {tabIndex > 0 && (
                <Button variant="outline" onClick={() => setActiveTab(tabs[tabIndex - 1])}>
                  <ArrowLeft className="h-4 w-4 mr-2" />Previous
                </Button>
              )}
              {tabIndex < tabs.length - 1 && (
                <Button variant="outline" onClick={() => setActiveTab(tabs[tabIndex + 1])}>
                  Next<ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Draft'}
              </Button>
              {tabIndex === tabs.length - 1 && (
                <Button onClick={handleSubmit} disabled={saving}>
                  <Send className="h-4 w-4 mr-2" />Submit Return
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
