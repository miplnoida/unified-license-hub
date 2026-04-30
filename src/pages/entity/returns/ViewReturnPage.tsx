import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useParams, useNavigate } from 'react-router-dom';
import { useReturnById, useReturnConfigForms, useReturnFormData, useReturnRequests, useReturnComments } from '@/hooks/useReturnsManagement';
import { useLatestPublishedVersion, useVersionSections, useFormVersion } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { VersionInfoBadge } from '@/components/form-builder/VersionInfoBadge';
import { MigrationCheckDialog } from '@/components/form-builder/MigrationCheckDialog';
import { StatusBadge } from './EntityReturnsDashboard';
import { Loader2, CheckCircle, AlertTriangle, Clock, Pencil, FileText, GitMerge } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

function ReadOnlyFormBlock({ formId, name, data, pinnedVersionId }: { formId: string; name: string; data: Record<string, any>; pinnedVersionId?: string | null }) {
  const { data: latestVersion, isLoading: vLoading } = useLatestPublishedVersion(formId);
  const { data: pinnedVersion } = useFormVersion(pinnedVersionId || null);
  // Prefer the version this submission was filed on; fall back to latest published.
  const effectiveVersionId = pinnedVersionId || latestVersion?.id || null;
  const { data: sections = [], isLoading: sLoading } = useVersionSections(effectiveVersionId);
  const loading = vLoading || sLoading;
  const [migrationOpen, setMigrationOpen] = useState(false);

  const showOutdatedBanner = !!pinnedVersionId && !!latestVersion && latestVersion.id !== pinnedVersionId;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <FileText className="h-4 w-4 text-primary" />
          <span>{name}</span>
          {pinnedVersionId && <VersionInfoBadge versionId={pinnedVersionId} templateId={formId} showLatestComparison />}
          {pinnedVersionId && (
            <Button size="sm" variant="ghost" className="h-7 ml-auto text-xs" onClick={() => setMigrationOpen(true)}>
              <GitMerge className="h-3 w-3 mr-1" /> Migration check
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {showOutdatedBanner && (
          <Alert className="mb-3 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
              This submission was filed on v{(pinnedVersion as any)?.semantic_version || (pinnedVersion as any)?.version || '?'}.
              A newer version is now available — click <strong>Migration check</strong> to preview field-level differences.
            </AlertDescription>
          </Alert>
        )}
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
      <MigrationCheckDialog
        open={migrationOpen}
        onOpenChange={setMigrationOpen}
        templateId={formId}
        submittedVersionId={pinnedVersionId || null}
        submittedData={data}
        formName={name}
      />
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
          form_templates: { id: template.id, name: template.name, description: template.description, status: template.status },
        }));
    },
  });
  const { data: formData = [] } = useReturnFormData(id);
  const { data: requests = [] } = useReturnRequests(id);
  const { data: comments = [] } = useReturnComments(id);
  const [activeTab, setActiveTab] = useState('');

  const effectiveConfigForms = configForms.length > 0 ? configForms : fallbackConfigForms;

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

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></DashboardLayout>;
  if (!returnData) return <DashboardLayout><p className="text-center py-20">Return not found</p></DashboardLayout>;

  const tabs = [...new Set(effectiveConfigForms.map(f => f.tab_name))];
  if (!activeTab && tabs.length > 0) setActiveTab(tabs[0]);
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
            {returnData.workflow_status === 'TBR' && (
              <Button size="sm" onClick={() => navigate(`/entity/returns/${id}/fill`)}><Pencil className="h-4 w-4 mr-2" />Edit & Resubmit</Button>
            )}
          </div>
        </div>

        {/* Status banners */}
        {returnData.workflow_status === 'VAL' && (
          <Alert className="border-green-500 bg-green-50"><CheckCircle className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-800">This return has been validated and approved.</AlertDescription></Alert>
        )}
        {returnData.workflow_status === 'TBR' && activeRequest && (
          <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription><strong>Resubmission Required:</strong> {activeRequest.reasons}</AlertDescription></Alert>
        )}
        {returnData.workflow_status === 'SUB' && (
          <Alert className="border-amber-500 bg-amber-50"><Clock className="h-4 w-4 text-amber-600" /><AlertDescription className="text-amber-800">This return is under review.</AlertDescription></Alert>
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
