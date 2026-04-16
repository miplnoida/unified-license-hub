import { useParams } from 'react-router-dom';
import { useFormVersion, useVersionSections } from '@/hooks/useFormTemplates';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { Badge } from '@/components/ui/badge';
import { Loader2, Eye } from 'lucide-react';

export default function FormPreview() {
  const { versionId } = useParams<{ versionId: string }>();
  const { data: version, isLoading: vLoading } = useFormVersion(versionId || null);
  const { data: sections = [], isLoading: sLoading } = useVersionSections(versionId || null);

  if (vLoading || sLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!version) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Version not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Eye className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Form Preview</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">v{version.semantic_version || version.version}</Badge>
            <Badge variant="secondary" className="capitalize">{version.status}</Badge>
          </div>
        </div>
      </div>

      {sections.length > 0 ? (
        <FormRenderer
          formName="Preview"
          sections={sections}
          onSaveDraft={() => {}}
          onSubmit={() => {}}
          readOnly
        />
      ) : (
        <p className="text-center text-muted-foreground py-12">No fields in this version.</p>
      )}
    </div>
  );
}
