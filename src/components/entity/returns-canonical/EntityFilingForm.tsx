/**
 * Renders one pinned Wave B form against the EXACT `form_version_id` recorded
 * on a `return_filing_form_requirements` row. Never re-resolves a version,
 * never invents a Returns-specific schema.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { migrateSectionsToRows } from '@/lib/formRows';
import type { FormSection } from '@/types/formBuilder';
import { useEntityReturnsMutations } from '@/hooks/useEntityReturns';
import { toast } from 'sonner';

export interface FilingFormRequirement {
  id: string;
  form_template_id: string;
  form_version_id: string;
  template_name: string | null;
  form_version: number | null;
  is_required: boolean;
  sequence: number;
  tab_name: string | null;
  form_response_id: string | null;
  completion_status: string;
}

export function EntityFilingForm({
  requirement, editable,
}: {
  requirement: FilingFormRequirement;
  editable: boolean;
}) {
  const { saveFormResponse } = useEntityReturnsMutations();
  const [saving, setSaving] = useState(false);

  const { data: version, isLoading: loadingVersion } = useQuery({
    queryKey: ['entity-returns', 'form-version', requirement.form_version_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_versions')
        .select('id, template_id, version, schema_snapshot')
        .eq('id', requirement.form_version_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: response, isLoading: loadingResponse } = useQuery({
    queryKey: ['entity-returns', 'form-response', requirement.form_response_id],
    enabled: !!requirement.form_response_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_responses')
        .select('id, response_data')
        .eq('id', requirement.form_response_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sections = useMemo<FormSection[]>(() => {
    if (!version?.schema_snapshot) return [];
    return migrateSectionsToRows(version.schema_snapshot as unknown as FormSection[]);
  }, [version?.schema_snapshot]);

  const initial = (response?.response_data as Record<string, any> | undefined) || {};
  const readOnly = !editable;

  const persist = async (data: Record<string, unknown>, completion: 'IN_PROGRESS' | 'COMPLETED') => {
    setSaving(true);
    try {
      await saveFormResponse.mutateAsync({
        requirementId: requirement.id,
        templateId: requirement.form_template_id,
        formVersionId: requirement.form_version_id,
        existingResponseId: requirement.form_response_id,
        data,
        completion,
      });
      toast.success(completion === 'COMPLETED' ? 'Form saved' : 'Draft saved');
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loadingVersion || loadingResponse) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading form…</CardContent></Card>;
  }
  if (!version || sections.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Pinned form version not available.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{requirement.template_name ?? 'Form'}{requirement.tab_name ? ` — ${requirement.tab_name}` : ''}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Pinned version v{requirement.form_version ?? version.version} — {requirement.is_required ? 'required' : 'optional'}
          </p>
        </div>
        <Badge variant="outline">{requirement.completion_status}</Badge>
      </CardHeader>
      <CardContent>
        <FormRenderer
          formName=""
          sections={sections}
          initialData={initial}
          readOnly={readOnly}
          saving={saving}
          formId={requirement.form_template_id}
          formVersionId={requirement.form_version_id}
          submissionId={requirement.form_response_id}
          entityType="return_filing_requirement"
          entityId={requirement.id}
          onSaveDraft={async (data) => persist(data, 'IN_PROGRESS')}
          onSubmit={async (data) => persist(data, 'COMPLETED')}
        />
      </CardContent>
    </Card>
  );
}
