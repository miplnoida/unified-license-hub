import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import type { FormSection } from '@/types/formBuilder';
import type { Json } from '@/integrations/supabase/types';

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

  useEffect(() => {
    if (authLoading) return;
    if (!session) { navigate('/'); return; }
    loadFormAndData();
  }, [session, authLoading, formId, submissionId]);

  async function loadFormAndData() {
    setLoading(true);
    try {
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

  async function handleComplete(data: Record<string, any>) {
    if (!submissionId) return;
    setSaving(true);
    const { error } = await supabase
      .from('registration_form_submissions')
      .update({ form_data: data as unknown as Json, status: 'completed', updated_at: new Date().toISOString() })
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

      <div className="max-w-4xl mx-auto px-4 py-8">
        <FormRenderer
          formName={formDef.name}
          sections={formDef.sections}
          initialData={initialData}
          onSaveDraft={handleSave}
          onSubmit={handleComplete}
          saving={saving}
        />
      </div>
    </div>
  );
}
