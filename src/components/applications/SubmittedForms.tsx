import { useMemo } from 'react';
import { useFormTemplate, useLatestPublishedVersion, useVersionSections, useFormVersion } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { Loader2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';

interface SingleFormViewerProps {
  templateId: string;
  formData: Record<string, any>;
  versionId?: string | null;
  editable?: boolean;
  onSave?: (templateId: string, data: Record<string, any>) => Promise<void>;
  saving?: boolean;
  applicationStatus?: string;
}

function SingleFormViewer({ templateId, formData, versionId, editable, onSave, saving, applicationStatus }: SingleFormViewerProps) {
  const { data: template, isLoading: tLoading } = useFormTemplate(templateId);
  // If a specific versionId was stored, use it; otherwise fall back to latest published
  const { data: latestVersion, isLoading: lvLoading } = useLatestPublishedVersion(templateId);
  const resolvedVersionId = versionId || latestVersion?.id || null;
  const { data: sections = [], isLoading: sLoading } = useVersionSections(resolvedVersionId);
  const { data: versionInfo } = useFormVersion(resolvedVersionId);

  const isLoading = tLoading || lvLoading || sLoading;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading form...
      </div>
    );
  }

  if (!template || sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Form template not found or has no fields.
      </p>
    );
  }

  const semanticVersion = versionInfo?.semantic_version || `v${versionInfo?.version || 1}`;
  const isResubmission = applicationStatus === 'resubmission_requested' || applicationStatus === 'query_raised';
  const badgeLabel = isResubmission ? `To Be Resubmitted — v${semanticVersion}` : `Submitted on v${semanticVersion}`;
  const badgeVariant = isResubmission ? 'returned' : 'outline';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant={badgeVariant as any} className="text-[10px]">
          {badgeLabel}
        </Badge>
        {latestVersion && versionId && latestVersion.id !== versionId && (
          <Badge variant="pending" className="text-[10px]">
            Latest: v{latestVersion.semantic_version || latestVersion.version}
          </Badge>
        )}
      </div>
      <FormRenderer
        formName={template.name}
        sections={sections}
        initialData={formData}
        onSaveDraft={editable && onSave ? async (data) => { await onSave(templateId, data); } : () => {}}
        onSubmit={editable && onSave ? async (data) => { await onSave(templateId, data); } : () => {}}
        readOnly={!editable}
        saving={saving}
      />
    </div>
  );
}

interface SubmittedFormsProps {
  formTemplateIds: string[];
  formsData: Record<string, Record<string, any>>;
  formVersionIds?: Record<string, string>;
  editable?: boolean;
  onSave?: (templateId: string, data: Record<string, any>) => Promise<void>;
  saving?: boolean;
  applicationStatus?: string;
}

export function SubmittedForms({ formTemplateIds, formsData, formVersionIds = {}, editable, onSave, saving, applicationStatus }: SubmittedFormsProps) {
  if (!formTemplateIds || formTemplateIds.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No forms were submitted with this application.</p>;
  }

  if (formTemplateIds.length === 1) {
    return (
      <SingleFormViewer
        templateId={formTemplateIds[0]}
        formData={formsData[formTemplateIds[0]] || {}}
        versionId={formVersionIds[formTemplateIds[0]] || null}
        editable={editable}
        onSave={onSave}
        saving={saving}
      />
    );
  }

  return (
    <Accordion type="multiple" defaultValue={formTemplateIds} className="space-y-2">
      {formTemplateIds.map((tid, idx) => (
        <AccordionItem key={tid} value={tid} className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium">
            Form {idx + 1}
          </AccordionTrigger>
          <AccordionContent>
            <SingleFormViewer
              templateId={tid}
              formData={formsData[tid] || {}}
              versionId={formVersionIds[tid] || null}
              editable={editable}
              onSave={onSave}
              saving={saving}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
