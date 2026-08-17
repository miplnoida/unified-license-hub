import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { migrateSectionsToRows } from '@/lib/formRows';
import type { FormSection } from '@/types/formBuilder';

// Renders a submitted Fit & Proper declaration read-only, against the schema
// whose field keys actually produced declaration_data.
//
// Every fp_assessments row gets form_template_id/form_version_id pinned to
// the internal "pq" service form at creation time (trg_fp_pin_pq_form),
// regardless of whether the individual ever fills that form in — the public
// declaration portal (DeclarationQuestionnaire.tsx) captures answers keyed
// to the separate "declaration" service form instead, and never touches
// those pinned columns. So the pin only matches declaration_data when the
// pinned template is ITSELF the "declaration" service form (true for
// historically-imported declarations); anything else must fall back to
// whatever the current live "declaration" form looks like via
// get_fp_declaration_form_public() — the same schema the public portal
// itself renders.
export function SubmittedDeclarationView({
  formTemplateId,
  formVersionId,
  declarationData,
}: {
  formTemplateId: string | null | undefined;
  formVersionId: string | null | undefined;
  declarationData: Record<string, any> | null | undefined;
}) {
  const hasDeclaration = !!declarationData && Object.keys(declarationData).length > 0;

  const { data: pinnedService, isLoading: loadingPin } = useQuery({
    queryKey: ['fp_form_template_service', formTemplateId],
    enabled: hasDeclaration && !!formTemplateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_templates')
        .select('service')
        .eq('id', formTemplateId as string)
        .maybeSingle();
      if (error) throw error;
      return (data?.service as string | null) ?? null;
    },
  });

  const isPinnedToDeclarationForm = hasDeclaration && !!formVersionId && pinnedService === 'declaration';

  const { data: pinnedVersion, isLoading: loadingPinnedVersion } = useQuery({
    queryKey: ['fp_pinned_declaration_version', formVersionId],
    enabled: isPinnedToDeclarationForm,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_versions')
        .select('schema_snapshot')
        .eq('id', formVersionId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const { data: liveFormVersion, isLoading: loadingLiveVersion } = useQuery({
    queryKey: ['fp_declaration_form_public'],
    enabled: hasDeclaration && !loadingPin && !isPinnedToDeclarationForm,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_fp_declaration_form_public' as any);
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as { schema_snapshot: unknown } | null;
    },
  });

  if (!hasDeclaration) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No declaration submitted yet for this assessment.
      </p>
    );
  }

  const loading = loadingPin || (isPinnedToDeclarationForm ? loadingPinnedVersion : loadingLiveVersion);
  if (loading) {
    return (
      <div className="py-4 text-center text-muted-foreground">
        <Loader2 className="h-4 w-4 inline animate-spin mr-2" />
        Loading declaration form…
      </div>
    );
  }

  const schemaSnapshot = isPinnedToDeclarationForm
    ? pinnedVersion?.schema_snapshot
    : liveFormVersion?.schema_snapshot;
  const sections: FormSection[] = schemaSnapshot
    ? migrateSectionsToRows(schemaSnapshot as FormSection[])
    : [];

  if (sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Declaration was submitted, but the form used to render it could not be loaded.
      </p>
    );
  }

  return (
    <FormRenderer
      formName=""
      sections={sections}
      initialData={declarationData}
      readOnly
      saving={false}
      onSaveDraft={() => {}}
      onSubmit={() => {}}
    />
  );
}
