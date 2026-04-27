import { useEffect, useState } from 'react';
import { FullRegistrationPreview } from '@/components/registration-builder/FullRegistrationPreview';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';

const STORAGE_KEY = 'registration-form-preview';

interface PreviewPayload {
  name?: string;
  schema: any;
  documentTypes: any;
  declarations: any;
  requireOtp: boolean;
  requireCaptcha: boolean;
  requireDocuments: boolean;
}

export default function RegistrationFormPreviewPage() {
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    document.title = 'Registration Form Preview';
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
      if (!raw) { setMissing(true); return; }
      setData(JSON.parse(raw));
    } catch {
      setMissing(true);
    }
  }, []);

  if (missing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold">No preview data</h1>
          <p className="text-sm text-muted-foreground">
            Open the preview from the Registration Form Builder to see the public applicant view.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-base font-semibold leading-tight">Public Registration Preview</h1>
              <p className="text-xs text-muted-foreground">
                Read-only view — this is what applicants will see.
              </p>
            </div>
          </div>
          {data.name && <Badge variant="secondary">{data.name}</Badge>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <fieldset disabled className="space-y-6">
          <FullRegistrationPreview
            schema={data.schema}
            documentTypes={data.documentTypes}
            declarations={data.declarations}
            requireOtp={data.requireOtp}
            requireCaptcha={data.requireCaptcha}
            requireDocuments={data.requireDocuments}
          />
        </fieldset>
      </main>
    </div>
  );
}
