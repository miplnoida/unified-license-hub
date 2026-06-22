import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Pencil, ExternalLink, Loader2 } from 'lucide-react';
import {
  useFormTemplate,
  useLatestPublishedVersion,
  useLatestVersion,
  useVersionSections,
} from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { usePermissions } from '@/hooks/usePermissions';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  published: 'default',
  draft: 'secondary',
  archived: 'outline',
};

const listRouteByType: Record<string, string> = {
  pre_license: '/admin/forms?tab=pre_license',
  post_license: '/admin/forms?tab=post_license',
  returns: '/admin/forms?tab=returns',
};

export default function FormTemplateView() {
  const { templateId = '' } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('form_management', 'edit');

  const { data: template, isLoading: tplLoading } = useFormTemplate(templateId || null);
  const { data: publishedVersion } = useLatestPublishedVersion(templateId || null);
  const { data: latestVersion } = useLatestVersion(templateId || null);

  const activeVersion = publishedVersion || latestVersion || null;
  const { data: sections = [], isLoading: secLoading } = useVersionSections(activeVersion?.id || null);

  const listRoute = useMemo(
    () => listRouteByType[template?.form_type || ''] || '/admin/forms',
    [template?.form_type],
  );

  if (tplLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!template) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <PageHeader title="Form not found" description="The requested form template does not exist or was deleted." />
          <Button variant="outline" onClick={() => navigate(listRoute)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to forms
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={template.name}
          description={template.description || 'Read-only preview of how this form appears to applicants.'}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate(listRoute)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              {activeVersion?.id && (
                <Button
                  variant="outline"
                  onClick={() => window.open(`/preview/${activeVersion.id}`, '_blank', 'noopener')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" /> Open in new tab
                </Button>
              )}
              {canEdit && (
                <Button
                  onClick={() =>
                    navigate(`/admin/forms/create?type=${template.form_type}&id=${template.id}`)
                  }
                >
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
              )}
            </div>
          }
        />

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {template.sector_name && <Badge variant="outline">Sector: {template.sector_name}</Badge>}
              {template.sub_sector_name && (
                <Badge variant="outline">Sub-Sector: {template.sub_sector_name}</Badge>
              )}
              {template.category_name && (
                <Badge variant="outline">Category: {template.category_name}</Badge>
              )}
              {template.service_name && (
                <Badge variant="outline">Service: {template.service_name}</Badge>
              )}
              {activeVersion && (
                <Badge variant="outline">
                  Version v{activeVersion.semantic_version || activeVersion.version}
                </Badge>
              )}
              <Badge variant={statusVariant[template.status] || 'secondary'} className="capitalize">
                {template.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {secLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !activeVersion ? (
              <p className="text-center text-muted-foreground py-16">
                This form has no versions yet.
              </p>
            ) : sections.length === 0 ? (
              <p className="text-center text-muted-foreground py-16">
                This version has no sections or fields yet.
              </p>
            ) : (
              <FormRenderer
                formName={template.name}
                sections={sections}
                onSaveDraft={() => {}}
                onSubmit={() => {}}
                readOnly
                formId={template.id}
                formVersionId={activeVersion.id}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
