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
import { useLatestPublishedVersion, useVersionSections, useActiveVersions } from '@/hooks/useFormTemplates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitBranch } from 'lucide-react';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { ReviewAcknowledgement } from '@/components/applications/ReviewAcknowledgement';
import { ReturnReviewPanel } from '@/components/returns/ReturnReviewPanel';
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
  onDataChange: (formId: string, data: Record<string, any>, versionId: string | null) => void;
  saving?: boolean;
  pinnedVersionId?: string | null;
}

function SingleReturnForm({ formTemplateId, initialData, readOnly, onDataChange, saving, pinnedVersionId }: SingleReturnFormProps) {
  const { data: latestVersion, isLoading: lvLoading } = useLatestPublishedVersion(formTemplateId);
  const { data: activeVersions = [], isLoading: avLoading } = useActiveVersions(formTemplateId);

  // Pin to a previously-saved version when present (so a draft started against
  // v2 keeps showing v2 even if v3 becomes available). Otherwise default to
  // the latest active version and let the user switch.
  const defaultVersionId = pinnedVersionId
    || activeVersions[0]?.id
    || latestVersion?.id
    || null;
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(defaultVersionId);

  // Re-sync when defaults arrive
  useEffect(() => {
    if (!selectedVersionId && defaultVersionId) setSelectedVersionId(defaultVersionId);
  }, [defaultVersionId, selectedVersionId]);

  const { data: sections = [], isLoading: sLoading } = useVersionSections(selectedVersionId);

  if (lvLoading || avLoading || sLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading form...
      </div>
    );
  }

  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No fields defined for this form.</p>;
  }

  const showSwitcher = !readOnly && activeVersions.length > 1 && !pinnedVersionId;

  return (
    <div className="space-y-3">
      {(showSwitcher || pinnedVersionId) && (
        <div className="flex items-center gap-2 flex-wrap rounded-md border bg-muted/30 px-3 py-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Form version:</span>
          {showSwitcher ? (
            <Select value={selectedVersionId || ''} onValueChange={(v) => setSelectedVersionId(v)}>
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
          {pinnedVersionId && (
            <span className="text-[11px] text-muted-foreground">Locked to the version this draft was started on.</span>
          )}
        </div>
      )}

      <FormRenderer
        formName=""
        sections={sections}
        initialData={initialData}
        onSaveDraft={(data) => onDataChange(formTemplateId, data, selectedVersionId)}
        onSubmit={(data) => onDataChange(formTemplateId, data, selectedVersionId)}
        onChange={(data) => onDataChange(formTemplateId, data, selectedVersionId)}
        readOnly={readOnly}
        saving={saving}
        showFullTabTitles
      />
    </div>
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
      returnData?.return_configs?.return_type_id,
    ],
    enabled: !!returnData?.return_configuration_id && configForms.length === 0,
    queryFn: async () => {
      const config = returnData?.return_configs;
      if (!config) return [];

      // Primary match: by return_type_id (the explicit tagging on form_templates).
      // Sector / sub-sector on a form template act as scope filters: NULL means
      // "applies to all sectors / sub-sectors".
      let query = supabase
        .from('form_templates')
        .select('id, name, description, status, form_type, tab_name, form_order, return_template_id, sector_id, sub_sector_id, return_type_id, created_at')
        .eq('status', 'published')
        .eq('form_type', 'returns');

      if (config.return_type_id) {
        query = query.eq('return_type_id', config.return_type_id);
      }

      const { data, error } = await query
        .order('form_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;

      const all = data || [];
      if (all.length === 0) return [];

      // Filter: keep templates whose sector / sub-sector is either NULL ("all")
      // or matches the configuration's sector / sub-sector.
      const matches = all.filter(t => {
        const sectorOk = !t.sector_id || (config.sector_id && t.sector_id === config.sector_id);
        const subOk = !t.sub_sector_id || (config.subsector_id && t.sub_sector_id === config.subsector_id);
        return sectorOk && subOk;
      });

      if (matches.length === 0) return [];

      // Effective-window enforcement: hide templates whose latest published
      // version is not currently effective (per admin-set effective dates).
      const ids = matches.map(t => t.id);
      const { data: versions } = await supabase
        .from('form_versions')
        .select('template_id, version, status, effective_from, effective_until')
        .in('template_id', ids)
        .eq('status', 'published')
        .order('version', { ascending: false });

      const nowIso = new Date().toISOString();
      const isEffective = (v: any): boolean => {
        const fromOk = !v.effective_from || v.effective_from <= nowIso;
        let untilOk = true;
        if (v.effective_until) {
          const until = new Date(v.effective_until);
          until.setUTCHours(23, 59, 59, 999);
          untilOk = until.toISOString() >= nowIso;
        }
        return fromOk && untilOk;
      };

      // Keep templates that have at least one published version, and where
      // the highest effective version (or latest published, if none have dates)
      // is effective right now. Templates with NO published version rows are
      // also kept (back-compat: legacy rows skip versioning).
      const versionsByTpl = new Map<string, any[]>();
      for (const v of (versions || []) as any[]) {
        if (!versionsByTpl.has(v.template_id)) versionsByTpl.set(v.template_id, []);
        versionsByTpl.get(v.template_id)!.push(v);
      }
      const effectiveMatches = matches.filter(t => {
        const vs = versionsByTpl.get(t.id);
        if (!vs || vs.length === 0) return true; // legacy: no versions tracked
        const eff = vs.filter(isEffective);
        return eff.length > 0;
      });

      if (effectiveMatches.length === 0) return [];

      return effectiveMatches
        .sort((a, b) => (a.form_order ?? 0) - (b.form_order ?? 0))
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
  // Track which form_version_id each form is pinned to (from saved data or selection)
  const [versionByForm, setVersionByForm] = useState<Record<string, string | null>>({});
  const [activeTab, setActiveTab] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveRef = useRef<NodeJS.Timeout>();
  const initializedRef = useRef(false);

  // Build initial data + pinned versions from saved return_form_data rows
  useEffect(() => {
    if (savedFormData.length > 0 && !initializedRef.current) {
      const init: Record<string, Record<string, any>> = {};
      const versions: Record<string, string | null> = {};
      for (const row of savedFormData) {
        if (!init[row.form_id]) init[row.form_id] = {};
        init[row.form_id][row.field_name] = row.field_value || '';
        if ((row as any).form_version_id) versions[row.form_id] = (row as any).form_version_id;
      }
      setAllData(init);
      setVersionByForm(versions);
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

  const handleDataChange = useCallback((formId: string, data: Record<string, any>, versionId: string | null) => {
    setAllData(prev => ({ ...prev, [formId]: data }));
    if (versionId) setVersionByForm(prev => (prev[formId] === versionId ? prev : { ...prev, [formId]: versionId }));
  }, []);

  const handleSave = useCallback(async (auto = false) => {
    if (!id || saving) return;
    setSaving(true);
    try {
      for (const [formId, dataMap] of Object.entries(allData)) {
        const fields = Object.entries(dataMap)
          .filter(([key]) => key !== '__repeatable' && !key.startsWith('_repeatable_'))
          .map(([fieldName, val]) => ({
            field_id: fieldName,
            field_name: fieldName,
            field_value: typeof val === 'object' ? JSON.stringify(val) : String(val ?? ''),
          }));
        if (fields.length > 0) {
          await saveFormData.mutateAsync({ returnId: id, formId, fields, formVersionId: versionByForm[formId] || null });
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

        {/* Tabbed forms using FormRenderer + final Review tab */}
        {(tabs.length > 0 || loadingFallbackForms) && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto">
              {tabs.map(tab => (
                <TabsTrigger key={tab} value={tab} className="gap-1">
                  {tab}
                </TabsTrigger>
              ))}
              {isEditable && (
                <TabsTrigger value="__review__" className="gap-1">
                  <Eye className="h-3 w-3" /> Review &amp; Submit
                </TabsTrigger>
              )}
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
                          pinnedVersionId={versionByForm[cf.form_id] || null}
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

            {isEditable && (
              <TabsContent value="__review__" className="space-y-4">
                <ReturnReviewPanel
                  loading={saving || updateReturn.isPending}
                  onAcknowledge={() =>
                    handleSubmit(
                      'I confirm that the data submitted in this return is accurate and complete to the best of my knowledge.'
                    )
}

                  returnSummary={[
                    { label: 'Reference', value: returnData?.unique_id || null },
                    { label: 'Return Type', value: returnData?.return_configs?.name || null },
                    { label: 'Period', value: `${returnData?.return_period || ''} ${returnData?.return_year || ''}`.trim() || null },
                    { label: 'Due Date', value: returnData?.due_date ? format(new Date(returnData.due_date), 'PP') : null },
                  ]}
                  forms={effectiveConfigForms.map((cf: any) => ({
                    formId: cf.form_id,
                    name: cf.form_templates?.name || 'Form',
                    tabName: cf.tab_name || 'General',
                  }))}
                  allData={allData}
                />
              </TabsContent>
            )}
          </Tabs>
        )}

        {!loadingFallbackForms && tabs.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No active return forms are available for this return configuration. Either no forms are linked, or all matching forms are outside their effective date window. Please contact your administrator.
            </CardContent>
          </Card>
        )}

        {/* Navigation + Actions */}
        {isEditable && activeTab !== '__review__' && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-card border rounded-lg p-4">
            <div className="flex gap-2">
              {tabIndex > 0 && (
                <Button variant="outline" onClick={async () => { await handleSave(true); setActiveTab(tabs[tabIndex - 1]); }} disabled={saving}>
                  <ArrowLeft className="h-4 w-4 mr-2" />Previous
                </Button>
              )}
              {tabIndex < tabs.length - 1 && (
                <Button variant="outline" onClick={async () => { await handleSave(true); setActiveTab(tabs[tabIndex + 1]); }} disabled={saving}>
                  Next<ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {tabIndex === tabs.length - 1 && (
                <Button variant="outline" onClick={async () => { await handleSave(true); setActiveTab('__review__'); }} disabled={saving}>
                  Review &amp; Submit<ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Draft'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
