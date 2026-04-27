import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FullRegistrationPreview } from '@/components/registration-builder/FullRegistrationPreview';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { readStoredRegistrationPreview, type RegistrationPreviewPayload } from '@/lib/registrationPreview';

export default function RegistrationFormPreviewPage() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<RegistrationPreviewPayload | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    document.title = 'Registration Form Preview';
    const configId = searchParams.get('configId');

    const loadPreview = async () => {
      try {
        if (configId) {
          const { data: config, error } = await supabase
            .from('registration_form_configs')
            .select('name, form_schema, document_types, declarations, require_otp, require_captcha, require_documents')
            .eq('id', configId)
            .maybeSingle();

          if (error || !config) {
            setMissing(true);
            return;
          }

          setData({
            name: config.name,
            schema: (config.form_schema as any) || [],
            documentTypes: (config.document_types as any) || [],
            declarations: (config.declarations as any) || [],
            requireOtp: !!config.require_otp,
            requireCaptcha: !!config.require_captcha,
            requireDocuments: !!config.require_documents,
          });
          setMissing(false);
          return;
        }

        const stored = readStoredRegistrationPreview();
        if (!stored) {
          setMissing(true);
          return;
        }

        setData(stored);
        setMissing(false);
      } catch {
        setMissing(true);
      }
    };

    void loadPreview();
  }, [searchParams]);

  if (missing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold">No preview data</h1>
          <p className="text-sm text-muted-foreground">
            Open preview from the registration form list or builder to see the public applicant view.
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
