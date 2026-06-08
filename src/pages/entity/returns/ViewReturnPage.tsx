import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useParams, useNavigate } from 'react-router-dom';
import { useReturnById, useReturnConfigForms, useReturnFormData, useReturnRequests, useReturnComments } from '@/hooks/useReturnsManagement';
import { useLatestPublishedVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';

import { StatusBadge } from './EntityReturnsDashboard';
import { Loader2, CheckCircle, AlertTriangle, Clock, Pencil, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

function ReadOnlyFormBlock({ formId, name, data, pinnedVersionId }: { formId: string; name: string; data: Record<string, any>; pinnedVersionId?: string | null }) {
  const { data: latestVersion, isLoading: vLoading } = useLatestPublishedVersion(formId);
  // Prefer the version this submission was filed on; fall back to latest published.
  const effectiveVersionId = pinnedVersionId || latestVersion?.id || null;
  const { data: sections = [], isLoading: sLoading } = useVersionSections(effectiveVersionId);
  const loading = vLoading || sLoading;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <FileText className="h-4 w-4 text-primary" />
          <span>{name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading form...</div>
        ) : sections.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">No fields defined for this form.</p>
        ) : (
          <FormRenderer
            formName=""
            sections={sections}
            initialData={data}
            onSaveDraft={() => {}}
            onSubmit={() => {}}
            readOnly
            showFullTabTitles
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function ViewReturnPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: returnData, isLoading } = useReturnById(id);
  const { data: configForms = [] } = useReturnConfigForms(returnData?.return_configuration_id);
  const { data: fallbackConfigForms = [] } = useQuery({
    queryKey: [
      'fallback_return_forms_view',
      returnData?.return_configuration_id,
      returnData?.return_configs?.sector_id,
      returnData?.return_configs?.subsector_id,
      returnData?.return_configs?.return_type_id,
    ],
    enabled: !!returnData?.return_configuration_id && configForms.length === 0,
    queryFn: async () => {
      const config = returnData?.return_configs;
      if (!config) return [];

      const { data, error } = await supabase
        .from('form_templates')
        .select('id, name, description, status, form_type, tab_name, form_order, return_template_id, sector_id, sub_sector_id, return_type_id, created_at')
        .eq('status', 'published')
        .eq('form_type', 'returns')
        .order('form_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;

      const allTemplates = data || [];
      if (allTemplates.length === 0) return [];

      const scopedTemplates = allTemplates.filter((template) => {
        const sectorOk = !template.sector_id || (config.sector_id && template.sector_id === config.sector_id);
        const subSectorOk = !template.sub_sector_id || (config.subsector_id && template.sub_sector_id === config.subsector_id);
        const returnTypeOk = !template.return_type_id || (config.return_type_id && template.return_type_id === config.return_type_id);
        return sectorOk && subSectorOk && returnTypeOk;
      });

      if (scopedTemplates.length === 0) return [];

      const templateIds = scopedTemplates.map((template) => template.id);
      const { data: versions, error: versionsError } = await supabase
        .from('form_versions')
        .select('template_id, version, status, effective_from, effective_until')
        .in('template_id', templateIds)
        .eq('status', 'published')
        .order('version', { ascending: false });
      if (versionsError) throw versionsError;

      const nowIso = new Date().toISOString();
      const isEffective = (version: any): boolean => {
        const fromOk = !version.effective_from || version.effective_from <= nowIso;
        let untilOk = true;
        if (version.effective_until) {
          const until = new Date(version.effective_until);
          until.setUTCHours(23, 59, 59, 999);
          untilOk = until.toISOString() >= nowIso;
        }
        return fromOk && untilOk;
      };

      const versionsByTemplate = new Map<string, any[]>();
      for (const version of (versions || []) as any[]) {
        if (!versionsByTemplate.has(version.template_id)) versionsByTemplate.set(version.template_id, []);
        versionsByTemplate.get(version.template_id)!.push(version);
      }

      const effectiveTemplates = scopedTemplates.filter((template) => {
        const templateVersions = versionsByTemplate.get(template.id);
        if (!templateVersions || templateVersions.length === 0) return true;
        return templateVersions.some(isEffective);
      });

      return effectiveTemplates
        .sort((a, b) => (a.form_order || 0) - (b.form_order || 0))
        .map((template, index) => ({
          id: `fallback-${template.id}`,
          form_id: template.id,
          return_configuration_id: returnData!.return_configuration_id,
          tab_name: (template.tab_name || template.name || 'General').trim() || 'General',
          display_order: template.form_order ?? index,
          status: 'active',
          form_templates: { id: template.id, name: template.name, description: template.description, status: template.status },
        }));
    },
  });
  const { data: formData = [] } = useReturnFormData(id);
  const { data: requests = [] } = useReturnRequests(id);
  const { data: comments = [] } = useReturnComments(id);
  const [activeTab, setActiveTab] = useState('');

  const submittedFormIds = [...new Set(formData.map((row) => row.form_id).filter(Boolean))];
  const { data: submittedFormTemplates = [] } = useQuery({
    queryKey: ['submitted_return_templates_view', submittedFormIds.slice().sort().join(',')],
    enabled: submittedFormIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_templates')
        .select('id, name, description, tab_name, form_order, created_at')
        .in('id', submittedFormIds)
        .order('form_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const templateById = submittedFormTemplates.reduce<Record<string, any>>((acc, template) => {
    acc[template.id] = template;
    return acc;
  }, {});

  const submittedConfigForms = submittedFormIds.map((formId, index) => {
    const template = templateById[formId];
    return {
      id: `submitted-${formId}`,
      form_id: formId,
      return_configuration_id: returnData?.return_configuration_id,
      tab_name: (template?.tab_name || template?.name || 'Submitted Forms').trim() || 'Submitted Forms',
      display_order: template?.form_order ?? index,
      status: 'active',
      form_templates: {
        id: formId,
        name: template?.name || `Form ${index + 1}`,
        description: template?.description || null,
        status: 'submitted',
      },
    };
  });

  // Merge all known forms so every form is visible, even if not filled.
  const mergedFormsMap = new Map<string, any>();
  [...configForms, ...fallbackConfigForms, ...submittedConfigForms].forEach((f: any) => {
    if (f?.form_id && !mergedFormsMap.has(f.form_id)) mergedFormsMap.set(f.form_id, f);
  });
  const effectiveConfigForms = Array.from(mergedFormsMap.values());

  // Build per-form data map keyed by field_name (matches FormRenderer initialData)
  // Also collect the pinned form_version_id per form (last write wins; all rows share it).
  const valuesByForm: Record<string, Record<string, any>> = {};
  const versionByForm: Record<string, string | null> = {};
  formData.forEach(d => {
    if (!valuesByForm[d.form_id]) valuesByForm[d.form_id] = {};
    const key = d.field_name || d.field_id;
    let val: any = d.field_value ?? '';
    if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
      try { val = JSON.parse(val); } catch { /* keep string */ }
    }
    valuesByForm[d.form_id][key] = val;
    if ((d as any).form_version_id) versionByForm[d.form_id] = (d as any).form_version_id;
  });

  const tabs = [...new Set(effectiveConfigForms.map(f => f.tab_name))];

  useEffect(() => {
    if (tabs.length === 0) {
      if (activeTab) setActiveTab('');
      return;
    }

    if (!activeTab || !tabs.includes(activeTab)) {
      setActiveTab(tabs[0]);
    }
  }, [activeTab, tabs]);

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></DashboardLayout>;
  if (!returnData) return <DashboardLayout><p className="text-center py-20">Return not found</p></DashboardLayout>;

  const normalizedStatus = String(returnData.workflow_status || '').toUpperCase();
  const activeRequest = requests.find(r => r.status === 'active');

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-card border rounded-lg p-4">
          <div>
            <h1 className="text-lg font-bold">{returnData.unique_id}</h1>
            <p className="text-sm text-muted-foreground">{returnData.return_configs?.name} — {returnData.return_period} {returnData.return_year}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={returnData.workflow_status} />
            {['TEMP', 'WIP', 'TBR'].includes(normalizedStatus) && (
              <Button size="sm" onClick={() => navigate(`/entity/returns/${id}/fill`)}><Pencil className="h-4 w-4 mr-2" />Edit & Resubmit</Button>
            )}
          </div>
        </div>

        {/* Status banners */}
        {normalizedStatus === 'VAL' && (
          <Alert className="border-green-500 bg-green-50"><CheckCircle className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-800">This return has been validated and approved.</AlertDescription></Alert>
        )}
        {normalizedStatus === 'TBR' && activeRequest && (
          <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription><strong>Resubmission Required:</strong> {activeRequest.reasons}</AlertDescription></Alert>
        )}

        {/* Read-only forms */}
        {tabs.length > 0 && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto">
              {tabs.map(t => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
            </TabsList>
            {tabs.map(tab => (
              <TabsContent key={tab} value={tab} className="space-y-4">
                {effectiveConfigForms.filter(f => f.tab_name === tab).sort((a, b) => a.display_order - b.display_order).map(cf => {
                  const formComments = comments.filter(c => c.form_id === cf.form_id);
                  return (
                    <div key={cf.id} className="space-y-2">
                      <ReadOnlyFormBlock
                        formId={cf.form_id}
                        name={cf.form_templates?.name || 'Form'}
                        data={valuesByForm[cf.form_id] || {}}
                        pinnedVersionId={versionByForm[cf.form_id] || null}
                      />
                      {formComments.length > 0 && (
                        <div className="border rounded-md p-3 space-y-2 bg-yellow-50/50">
                          <p className="text-xs font-semibold text-muted-foreground">Reviewer Comments</p>
                          {formComments.map(c => <p key={c.id} className="text-sm">• {c.comment_text}</p>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
