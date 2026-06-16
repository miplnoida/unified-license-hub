import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { ReviewAcknowledgement } from '@/components/applications/ReviewAcknowledgement';
import type { FormSection } from '@/types/formBuilder';
import type { Json } from '@/integrations/supabase/types';
import { isDisplayOnlyField, resolveDisplayKind, resolveDisplayOnlyFieldText } from '@/lib/registrationDisplayTypes';

const buildStepStorageKey = (formId: string | undefined, submissionId: string | null) => {
  const formKey = formId || 'unknown-form';
  const submissionKey = submissionId || 'draft';
  return `registrationFormCurrentStep:${formKey}:${submissionKey}`;
};

export default function RegistrationFormFill() {
  const navigate = useNavigate();
  const { formId } = useParams<{ formId: string }>();
  const [searchParams] = useSearchParams();
  const submissionIdParam = searchParams.get('submission');
  const { session, loading: authLoading } = useAuth();

  const [formDef, setFormDef] = useState<{ name: string; sections: FormSection[] } | null>(null);
  const [initialData, setInitialData] = useState<Record<string, any> | null>(null);
  const [resolvedSubmissionId, setResolvedSubmissionId] = useState<string | null>(submissionIdParam);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingData, setPendingData] = useState<Record<string, any> | null>(null);
  const stepStorageKey = buildStepStorageKey(formId, resolvedSubmissionId);

  // Status priority used when multiple submissions exist for the same form/user.
  // Lower number = preferred row to continue editing.
  const STATUS_PRIORITY: Record<string, number> = {
    resubmission_requested: 0,
    needs_changes: 0,
    rejected: 1,
    draft: 2,
    submitted: 3,
    under_review: 3,
    completed: 4,
  };

  useEffect(() => {
    if (authLoading) return;
    if (!session) { navigate('/'); return; }
    loadFormAndData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, authLoading, formId, submissionIdParam]);

  async function resolveSubmissionId(): Promise<string | null> {
    const userId = session!.user.id;

    // 1. URL-provided submission id (must belong to current user)
    if (submissionIdParam) {
      const { data } = await supabase
        .from('registration_form_submissions')
        .select('id, user_id')
        .eq('id', submissionIdParam)
        .maybeSingle();
      if (data && data.user_id === userId) return data.id;
    }

    const pickLatest = (rows: Array<{ id: string; status: string; updated_at: string }>) => {
      return [...rows].sort((a, b) => {
        const pa = STATUS_PRIORITY[a.status] ?? 5;
        const pb = STATUS_PRIORITY[b.status] ?? 5;
        if (pa !== pb) return pa - pb;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      })[0]?.id ?? null;
    };

    // 2. Resolve current user's registration record, then look up by registration_id + form_id
    const { data: reg } = await supabase
      .from('registrations')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reg?.id) {
      const { data: rows } = await supabase
        .from('registration_form_submissions')
        .select('id, status, updated_at')
        .eq('registration_id', reg.id)
        .eq('form_id', formId!);
      if (rows && rows.length > 0) {
        const picked = pickLatest(rows);
        if (picked) return picked;
      }
    }

    // 3. Fallback: user_id + form_id
    const { data: rows } = await supabase
      .from('registration_form_submissions')
      .select('id, status, updated_at')
      .eq('user_id', userId)
      .eq('form_id', formId!);
    if (!rows || rows.length === 0) return null;
    return pickLatest(rows);
  }

  async function loadFormAndData() {
    setLoading(true);
    try {
      // First try form_templates (new system)
      const { data: template } = await supabase
        .from('form_templates')
        .select('id, name')
        .eq('id', formId!)
        .single();

      if (template) {
        // Get the latest published version
        const { data: version } = await supabase
          .from('form_versions')
          .select('id, schema_snapshot')
          .eq('template_id', template.id)
          .eq('status', 'published')
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (version) {
          // Try schema_snapshot first
          let sections: FormSection[] = [];
          const snapshot = version.schema_snapshot as any;
          if (Array.isArray(snapshot) && snapshot.length > 0) {
            sections = snapshot as FormSection[];
          } else {
            // Fallback: build from form_fields
            const { data: fields } = await supabase
              .from('form_fields')
              .select('*')
              .eq('version_id', version.id)
              .order('section_order', { ascending: true })
              .order('sort_order', { ascending: true });

            if (fields && fields.length > 0) {
              const sectionMap = new Map<string, FormSection>();
              for (const f of fields) {
                if (!sectionMap.has(f.section_id)) {
                  sectionMap.set(f.section_id, {
                    id: f.section_id,
                    title: f.section_title,
                    description: f.section_description || undefined,
                    isRepeatable: f.section_is_repeatable || false,
                    sortOrder: f.section_order,
                    fields: [],
                  });
                }
                const sec = sectionMap.get(f.section_id)!;
                sec.fields.push({
                  id: f.id,
                  fieldName: f.field_name,
                  label: f.label,
                  type: f.field_type as any,
                  required: f.required,
                  placeholder: f.placeholder || undefined,
                  helpText: f.help_text || undefined,
                  defaultValue: f.default_value || undefined,
                  options: f.options as any,
                  validation: f.validation as any,
                  calculatedExpression: f.calculated_expression || undefined,
                  content: f.content || undefined,
                  tableColumns: f.table_columns as any,
                });
              }
              sections = Array.from(sectionMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
            }
          }

          setFormDef({ name: template.name, sections });
        } else {
          setFormDef({ name: template.name, sections: [] });
        }
      } else {
        // Fallback: try legacy forms table
        const { data: form } = await supabase
          .from('forms')
          .select('name, rows')
          .eq('id', formId!)
          .single();

        if (form) {
          setFormDef({
            name: form.name,
            sections: (form.rows as unknown as FormSection[]) || [],
          });
        }
      }

      // Resolve the submission row (URL param, or latest existing for resubmission)
      const subId = await resolveSubmissionId();
      setResolvedSubmissionId(subId);

      if (subId) {
        const { data: sub } = await supabase
          .from('registration_form_submissions')
          .select('form_data')
          .eq('id', subId)
          .single();

        if (sub?.form_data && typeof sub.form_data === 'object') {
          setInitialData(sub.form_data as Record<string, any>);
        } else {
          setInitialData({});
        }
      } else {
        setInitialData({});
      }
    } catch (err) {
      console.error('Load error:', err);
      setInitialData({});
    } finally {
      setLoading(false);
    }
  }

  // Defensive guard: refuse to overwrite existing non-empty form_data with empty data.
  function isEmptyData(d: Record<string, any> | null | undefined): boolean {
    if (!d) return true;
    return Object.keys(d).length === 0;
  }

  async function handleSave(data: Record<string, any>) {
    if (!resolvedSubmissionId) return;
    if (isEmptyData(data) && !isEmptyData(initialData)) {
      console.warn('[registration] Refusing to overwrite existing form_data with empty data');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('registration_form_submissions')
      .update({ form_data: data as unknown as Json, updated_at: new Date().toISOString() })
      .eq('id', resolvedSubmissionId);
    setSaving(false);
    if (error) toast.error('Failed to save.');
    else {
      setInitialData(data);
      toast.success('Progress saved!');
    }
  }

  // Step 1: collect data from form, then show review/ack
  function handleSubmitClick(data: Record<string, any>) {
    setPendingData(data);
  }

  // Step 2: persist after acknowledgement
  async function handleConfirm() {
    if (!resolvedSubmissionId || !pendingData) return;
    if (isEmptyData(pendingData) && !isEmptyData(initialData)) {
      toast.error('Cannot submit empty data over existing submission.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('registration_form_submissions')
      .update({
        form_data: pendingData as unknown as Json,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolvedSubmissionId);
    setSaving(false);
    if (error) toast.error('Failed to submit.');
    else {
      try { sessionStorage.removeItem(stepStorageKey); } catch {}
      toast.success('Form completed!');
      navigate('/registration/portal');
    }
  }

  if (authLoading || loading || initialData === null) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full mb-4" />)}
      </div>
    );
  }

  if (!formDef) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Form not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="hero-gradient text-primary-foreground py-6 px-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/registration/portal')} className="text-primary-foreground hover:bg-primary-foreground/10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{formDef.name}</h1>
            <p className="text-sm text-primary-foreground/70">Fill and save your progress anytime</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <FormRenderer
          formName={formDef.name}
          sections={formDef.sections}
          initialData={initialData}
          onSaveDraft={handleSave}
          onSubmit={handleSubmitClick}
          saving={saving}
          stepStorageKey={stepStorageKey}
        />

        {pendingData && (
          <ReviewAcknowledgement
            mode="editable"
            loading={saving}
            onAcknowledge={handleConfirm}
            onEdit={() => setPendingData(null)}
            title="Review Your Submission"
            description="Confirm the details below. Click 'Edit Section' to make changes."
            sections={formDef.sections.map(section => ({
              title: section.title,
              fields: section.fields.map(f => {
                if (isDisplayOnlyField(f)) {
                  const kind = resolveDisplayKind(f.type);

                  return {
                    label: f.label,
                    value: resolveDisplayOnlyFieldText(f),
                    type: 'display' as const,
                    displayKind: kind,
                    placeholder: f.placeholder,
                    defaultValue: f.defaultValue,
                    helpText: f.helpText,
                  };
                }

                return {
                  label: f.label,
                  value: pendingData?.[f.fieldName] ?? null,
                };
              }),
            }))}
          />
        )}
      </div>
    </div>
  );
}
