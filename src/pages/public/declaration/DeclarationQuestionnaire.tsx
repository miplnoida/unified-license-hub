import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { migrateSectionsToRows } from '@/lib/formRows';
import type { FormSection } from '@/types/formBuilder';

// The declaration questionnaire is designed and maintained via the /admin/forms
// builder (form_templates/form_versions, form_type = 'fit_and_proper') rather
// than hand-coded here — this component is purely a thin anonymous-access
// renderer for whatever schema is currently on that form. See
// get_fp_declaration_form_public() for the narrow, token-free RPC that exposes
// just this one form's schema to anonymous declarants.

interface DeclarationFormVersion {
  template_id: string;
  version_id: string;
  schema_snapshot: unknown;
}

export default function DeclarationQuestionnaire({
  individualName,
  submitting,
  onSubmit,
}: {
  individualName?: string;
  submitting: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const { data: formVersion, isLoading, isError } = useQuery({
    queryKey: ['fp_declaration_form_public'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_fp_declaration_form_public' as any);
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as DeclarationFormVersion | null;
    },
  });

  const sections = useMemo<FormSection[]>(() => {
    if (!formVersion?.schema_snapshot) return [];
    return migrateSectionsToRows(formVersion.schema_snapshot as FormSection[]);
  }, [formVersion?.schema_snapshot]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading declaration form…</span>
      </div>
    );
  }

  if (isError || !formVersion || sections.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <XCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground max-w-sm">
          The declaration form could not be loaded. Please contact your regulator for assistance.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Identity verified for: <strong>{individualName}</strong></span>
      </div>

      <FormRenderer
        formName="Fit and Proper Declaration"
        sections={sections}
        initialData={{}}
        readOnly={false}
        saving={submitting}
        showFullTabTitles
        onSaveDraft={() => {
          // The public declaration link is a single-sitting submission — there is
          // no server-side draft to resume from, so this just reassures the
          // declarant that navigating between tabs doesn't lose their answers.
        }}
        onSubmit={(data) => onSubmit(data)}
      />
    </div>
  );
}
