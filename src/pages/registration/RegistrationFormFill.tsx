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

export default function RegistrationFormFill() {
  const navigate = useNavigate();
  const { formId } = useParams<{ formId: string }>();
  const [searchParams] = useSearchParams();
  const submissionId = searchParams.get('submission');
  const { session, loading: authLoading } = useAuth();

  const [formDef, setFormDef] = useState<{ name: string; sections: FormSection[] } | null>(null);
  const [initialData, setInitialData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingData, setPendingData] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!session) { navigate('/'); return; }
    loadFormAndData();
  }, [session, authLoading, formId, submissionId]);

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

      // Load saved data
      if (submissionId) {
        const { data: sub } = await supabase
          .from('registration_form_submissions')
          .select('form_data')
          .eq('id', submissionId)
          .single();

        if (sub?.form_data && typeof sub.form_data === 'object') {
          setInitialData(sub.form_data as Record<string, any>);
        }
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(data: Record<string, any>) {
    if (!submissionId) return;
    setSaving(true);
    const { error } = await supabase
      .from('registration_form_submissions')
      .update({ form_data: data as unknown as Json, updated_at: new Date().toISOString() })
      .eq('id', submissionId);
    setSaving(false);
    if (error) toast.error('Failed to save.');
    else toast.success('Progress saved!');
  }

  // Step 1: collect data from form, then show review/ack
  function handleSubmitClick(data: Record<string, any>) {
    setPendingData(data);
  }

  // Step 2: persist after acknowledgement
  async function handleConfirm() {
    if (!submissionId || !pendingData) return;
    setSaving(true);
    const { error } = await supabase
      .from('registration_form_submissions')
      .update({
        form_data: pendingData as unknown as Json,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId);
    setSaving(false);
    if (error) toast.error('Failed to submit.');
    else { toast.success('Form completed!'); navigate('/registration/portal'); }
  }

  if (authLoading || loading) {
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
