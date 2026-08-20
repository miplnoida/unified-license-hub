import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, FileText } from 'lucide-react';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { migrateSectionsToRows } from '@/lib/formRows';
import type { FormSection } from '@/types/formBuilder';
import { fpAssessmentSavePq } from '@/lib/fpGovernedOps';

// Renders a Fit & Proper declaration against the EXACT form schema it was
// captured against (form_versions.schema_snapshot for form_version_id), not
// whatever the current live form looks like. Historic and pinned assessments
// use field-key conventions (e.g. pq01_...) that don't match the current
// schema's field names, so rendering them against "the current form" leaves
// most answers blank — this component is what keeps them readable.
export function PinnedPqForm({
  assessmentId, templateId, versionId, individualId, existingResponseId, initialData, currentStatus, userId, onSubmitted,
}: {
  assessmentId: string;
  templateId: string;
  versionId: string;
  individualId: string;
  existingResponseId: string | null;
  initialData: Record<string, any>;
  currentStatus: string;
  userId: string | null;
  onSubmitted: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const { data: version, isLoading: loadingVersion } = useQuery({
    queryKey: ['fp_pq_version', versionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_versions')
        .select('id, template_id, version, semantic_version, schema_snapshot, status')
        .eq('id', versionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: existingResponse } = useQuery({
    queryKey: ['fp_pq_response', assessmentId, templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_responses')
        .select('id, response_data, status, submitted_at')
        .eq('entity_type', 'fp_assessment')
        .eq('entity_id', assessmentId)
        .eq('template_id', templateId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sections = useMemo<FormSection[]>(() => {
    if (!version?.schema_snapshot) return [];
    return migrateSectionsToRows(version.schema_snapshot as unknown as FormSection[]);
  }, [version?.schema_snapshot]);

  const initial = (existingResponse?.response_data as Record<string, any> | undefined) || initialData || {};
  const readOnly = currentStatus !== 'draft';

  async function upsertResponse(data: Record<string, any>, status: 'draft' | 'submitted') {
    if (!userId) throw new Error('Not authenticated');
    setSaving(true);
    try {
      let responseId = existingResponse?.id || existingResponseId || null;
      if (responseId) {
        const { error } = await supabase.from('form_responses').update({
          version_id: versionId,
          user_id: userId,
          response_data: data,
          status,
          submitted_at: status === 'submitted' ? new Date().toISOString() : null,
        } as any).eq('id', responseId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from('form_responses').insert({
          template_id: templateId,
          version_id: versionId,
          user_id: userId,
          response_data: data,
          status,
          entity_type: 'fp_assessment',
          entity_id: assessmentId,
          submitted_at: status === 'submitted' ? new Date().toISOString() : null,
        } as any).select('id').single();
        if (error) throw error;
        responseId = inserted!.id;
      }
      // Canonical assessment state (declaration + submission) is governed:
      // the operation validates the draft/submit transition and audits it.
      await fpAssessmentSavePq(
        assessmentId,
        data,
        status === 'submitted',
        responseId && !existingResponseId ? responseId : null,
      );
      if (status === 'submitted') {
        try {
          await supabase.functions.invoke('dispatch-notification-event', {
            body: { event_key: 'fp_assessment_submitted', entity_type: 'fp_assessment', entity_id: assessmentId, payload: { individual_id: individualId } },
          });
        } catch (e) { console.warn('dispatch-notification-event failed', e); }
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadingVersion) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading personal questionnaire…</CardContent></Card>;
  }
  if (!version || sections.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Pinned PQ form not available.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Personal Questionnaire</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Form version pinned at start of assessment · v{version.version} ({version.semantic_version || '1.0'}) — historical submissions always render the exact schema used.</p>
        </div>
      </CardHeader>
      <CardContent>
        <FormRenderer
          formName=""
          sections={sections}
          initialData={initial}
          readOnly={readOnly}
          saving={saving}
          formId={templateId}
          formVersionId={versionId}
          submissionId={existingResponse?.id || existingResponseId || null}
          entityType="fp_assessment"
          entityId={assessmentId}
          onSaveDraft={async (data) => {
            try {
              await upsertResponse(data, 'draft');
              toast.success('Draft saved');
              onSubmitted();
            } catch (e: any) { toast.error(e?.message || 'Save failed'); }
          }}
          onSubmit={async (data) => {
            try {
              await upsertResponse(data, 'submitted');
              toast.success('Personal Questionnaire submitted');
              onSubmitted();
            } catch (e: any) { toast.error(e?.message || 'Submit failed'); }
          }}
        />
      </CardContent>
    </Card>
  );
}
