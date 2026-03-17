import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { useFormTemplate, useLatestPublishedVersion, useLatestVersion } from '@/hooks/useFormTemplates';
import { useSaveFormResponse } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { supabase } from '@/integrations/supabase/client';
import type { FormSection } from '@/types/formBuilder';
import { useEffect, useState } from 'react';

export default function FormDetail() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { data: template, isLoading: tLoading } = useFormTemplate(formId || null);
  const { data: publishedVersion } = useLatestPublishedVersion(formId || null);
  const { data: latestVersion } = useLatestVersion(formId || null);
  const saveResponseMutation = useSaveFormResponse();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  // Use published version if available, else latest
  const activeVersion = publishedVersion || latestVersion;

  const sections = useMemo(() => {
    if (!activeVersion?.schema_snapshot) return [];
    return activeVersion.schema_snapshot as unknown as FormSection[];
  }, [activeVersion]);

  const isLoading = tLoading;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!template) {
    return (
      <DashboardLayout>
        <div className="space-y-6 max-w-3xl">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Form Not Found</h1>
              <p className="text-muted-foreground">This form does not exist.</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{template.name}</h1>
            <p className="text-sm text-muted-foreground">{template.sector} · {template.sub_sector}</p>
          </div>
          {activeVersion && (
            <Badge variant="secondary" className="gap-1">
              <GitBranch className="h-3 w-3" /> v{activeVersion.version}
            </Badge>
          )}
        </div>

        <FormRenderer
          formName={template.name}
          sections={sections}
          onSaveDraft={async (data) => {
            if (!userId || !activeVersion) {
              toast.success('Draft saved locally!');
              return;
            }
            try {
              await saveResponseMutation.mutateAsync({
                id: crypto.randomUUID(),
                template_id: template.id,
                version_id: activeVersion.id,
                user_id: userId,
                response_data: data,
                status: 'draft',
                submitted_at: null,
                entity_type: null,
                entity_id: null,
              });
              toast.success('Draft saved!');
            } catch {
              toast.error('Failed to save draft.');
            }
          }}
          onSubmit={async (data) => {
            if (!userId || !activeVersion) {
              toast.success('Form submitted!');
              navigate(-1);
              return;
            }
            try {
              await saveResponseMutation.mutateAsync({
                id: crypto.randomUUID(),
                template_id: template.id,
                version_id: activeVersion.id,
                user_id: userId,
                response_data: data,
                status: 'submitted',
                submitted_at: new Date().toISOString(),
                entity_type: null,
                entity_id: null,
              });
              toast.success('Form submitted successfully!');
              navigate(-1);
            } catch {
              toast.error('Failed to submit form.');
            }
          }}
        />
      </div>
    </DashboardLayout>
  );
}
