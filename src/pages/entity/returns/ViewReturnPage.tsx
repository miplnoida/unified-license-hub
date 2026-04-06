import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useParams, useNavigate } from 'react-router-dom';
import { useReturnById, useReturnConfigForms, useReturnFormData, useReturnAuditLog, useReturnRequests, useReturnComments } from '@/hooks/useReturnsManagement';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from './EntityReturnsDashboard';
import { Loader2, CheckCircle, AlertTriangle, Clock, Pencil, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';

export default function ViewReturnPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: returnData, isLoading } = useReturnById(id);
  const { data: configForms = [] } = useReturnConfigForms(returnData?.return_configuration_id);
  const { data: formData = [] } = useReturnFormData(id);
  const { data: auditLog = [] } = useReturnAuditLog(id);
  const { data: requests = [] } = useReturnRequests(id);
  const { data: comments = [] } = useReturnComments(id);
  const [activeTab, setActiveTab] = useState('');

  const formIds = configForms.map(f => f.form_id);
  const { data: allFields = [] } = useQuery({
    queryKey: ['return_form_fields_view', formIds],
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

  const valuesMap: Record<string, Record<string, string>> = {};
  formData.forEach(d => {
    if (!valuesMap[d.form_id]) valuesMap[d.form_id] = {};
    valuesMap[d.form_id][d.field_id] = d.field_value || '';
  });

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></DashboardLayout>;
  if (!returnData) return <DashboardLayout><p className="text-center py-20">Return not found</p></DashboardLayout>;

  const tabs = [...new Set(configForms.map(f => f.tab_name))];
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
                {configForms.filter(f => f.tab_name === tab).sort((a, b) => a.display_order - b.display_order).map(cf => {
                  const formFields = allFields.filter(f => f._form_id === cf.form_id);
                  const formComments = comments.filter(c => c.form_id === cf.form_id);
                  return (
                    <Card key={cf.id}>
                      <CardHeader className="pb-3"><CardTitle className="text-base">{cf.form_templates?.name || 'Form'}</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {formFields.map(field => (
                          <div key={field.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                            <Label className="text-sm text-muted-foreground min-w-[200px]">{field.label}</Label>
                            <p className="text-sm font-medium">{valuesMap[cf.form_id]?.[field.id] || '—'}</p>
                          </div>
                        ))}
                        {formComments.length > 0 && (
                          <div className="mt-3 border-t pt-3 space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">Reviewer Comments</p>
                            {formComments.map(c => <p key={c.id} className="text-sm bg-yellow-50 p-2 rounded">• {c.comment_text}</p>)}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Audit Log */}
        <Card>
          <CardHeader><CardTitle className="text-base">Audit History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {auditLog.map(a => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className={`h-2 w-2 mt-2 rounded-full ${a.action === 'validated' ? 'bg-green-500' : a.action === 'rejected' ? 'bg-red-500' : a.action === 'submitted' ? 'bg-blue-500' : 'bg-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium capitalize">{a.action.replace('_', ' ')}</p>
                    {a.comments && <p className="text-xs text-muted-foreground">{a.comments}</p>}
                    <p className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'MMM dd, yyyy HH:mm')}</p>
                  </div>
                </div>
              ))}
              {auditLog.length === 0 && <p className="text-sm text-muted-foreground">No audit history</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
