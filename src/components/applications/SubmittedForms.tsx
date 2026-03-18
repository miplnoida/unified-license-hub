import { useMemo } from 'react';
import { useFormTemplate, useLatestPublishedVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { Loader2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface SingleFormViewerProps {
  templateId: string;
  formData: Record<string, any>;
}

function SingleFormViewer({ templateId, formData }: SingleFormViewerProps) {
  const { data: template, isLoading: tLoading } = useFormTemplate(templateId);
  const { data: publishedVersion, isLoading: vLoading } = useLatestPublishedVersion(templateId);
  const { data: sections = [], isLoading: sLoading } = useVersionSections(publishedVersion?.id || null);

  const isLoading = tLoading || vLoading || sLoading;

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

  return (
    <FormRenderer
      formName={template.name}
      sections={sections}
      initialData={formData}
      onSaveDraft={() => {}}
      onSubmit={() => {}}
      readOnly
    />
  );
}

interface SubmittedFormsProps {
  formTemplateIds: string[];
  formsData: Record<string, Record<string, any>>;
}

export function SubmittedForms({ formTemplateIds, formsData }: SubmittedFormsProps) {
  if (!formTemplateIds || formTemplateIds.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No forms were submitted with this application.</p>;
  }

  if (formTemplateIds.length === 1) {
    return (
      <SingleFormViewer
        templateId={formTemplateIds[0]}
        formData={formsData[formTemplateIds[0]] || {}}
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
            <SingleFormViewer templateId={tid} formData={formsData[tid] || {}} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
