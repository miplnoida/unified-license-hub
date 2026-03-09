import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ArrowLeft, Save, CheckCircle2 } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

interface FormRow {
  id: string;
  columns: number;
  fields: Array<{
    id: string;
    type: string;
    label: string;
    required: boolean;
    placeholder?: string;
    options?: string[];
    helpText?: string;
    minSize?: number;
    maxSize?: number;
    allowedExtensions?: string[];
  } | null>;
}

export default function RegistrationFormFill() {
  const navigate = useNavigate();
  const { formId } = useParams<{ formId: string }>();
  const [searchParams] = useSearchParams();
  const submissionId = searchParams.get('submission');
  const { session, loading: authLoading } = useAuth();

  const [formDef, setFormDef] = useState<{ name: string; rows: FormRow[] } | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      navigate('/');
      return;
    }
    loadFormAndData();
  }, [session, authLoading, formId, submissionId]);

  async function loadFormAndData() {
    setLoading(true);
    try {
      // Load form definition
      const { data: form } = await supabase
        .from('forms')
        .select('name, rows')
        .eq('id', formId!)
        .single();

      if (form) {
        setFormDef({
          name: form.name,
          rows: (form.rows as unknown as FormRow[]) || [],
        });
      }

      // Load existing submission data
      if (submissionId) {
        const { data: sub } = await supabase
          .from('registration_form_submissions')
          .select('form_data')
          .eq('id', submissionId)
          .single();

        if (sub?.form_data && typeof sub.form_data === 'object') {
          setFormData(sub.form_data as Record<string, any>);
        }
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  function updateField(fieldId: string, value: any) {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  }

  async function handleSave() {
    if (!submissionId) return;
    setSaving(true);
    const { error } = await supabase
      .from('registration_form_submissions')
      .update({
        form_data: formData as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId);

    setSaving(false);
    if (error) {
      toast.error('Failed to save. Please try again.');
    } else {
      toast.success('Progress saved successfully!');
    }
  }

  async function handleComplete() {
    if (!submissionId) return;
    setSaving(true);
    const { error } = await supabase
      .from('registration_form_submissions')
      .update({
        form_data: formData as unknown as Json,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId);

    setSaving(false);
    if (error) {
      toast.error('Failed to submit. Please try again.');
    } else {
      toast.success('Form completed!');
      navigate('/registration/portal');
    }
  }

  function renderField(field: FormRow['fields'][0]) {
    if (!field) return null;
    const value = formData[field.id] ?? '';

    switch (field.type) {
      case 'text':
      case 'number':
      case 'email':
      case 'date':
        return (
          <div key={field.id} className="space-y-2">
            <Label>{field.label}{field.required && ' *'}</Label>
            <Input
              type={field.type}
              placeholder={field.placeholder}
              value={value}
              onChange={e => updateField(field.id, e.target.value)}
            />
            {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          </div>
        );
      case 'textarea':
      case 'paragraph':
        return (
          <div key={field.id} className="space-y-2">
            <Label>{field.label}{field.required && ' *'}</Label>
            <Textarea
              placeholder={field.placeholder}
              value={value}
              onChange={e => updateField(field.id, e.target.value)}
            />
          </div>
        );
      case 'dropdown':
        return (
          <div key={field.id} className="space-y-2">
            <Label>{field.label}{field.required && ' *'}</Label>
            <Select value={value} onValueChange={v => updateField(field.id, v)}>
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder || 'Select...'} />
              </SelectTrigger>
              <SelectContent>
                {(field.options || []).map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 'checkbox':
        return (
          <div key={field.id} className="flex items-center gap-2 pt-2">
            <Checkbox
              checked={!!value}
              onCheckedChange={v => updateField(field.id, v)}
            />
            <Label>{field.label}</Label>
          </div>
        );
      case 'radio':
        return (
          <div key={field.id} className="space-y-2">
            <Label>{field.label}{field.required && ' *'}</Label>
            <div className="space-y-1">
              {(field.options || []).map(opt => (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={field.id}
                    value={opt}
                    checked={value === opt}
                    onChange={() => updateField(field.id, opt)}
                    className="accent-primary"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        );
      case 'file':
        return (
          <div key={field.id} className="space-y-2">
            <Label>{field.label}{field.required && ' *'}</Label>
            <Input type="file" />
            {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
          </div>
        );
      default:
        return (
          <div key={field.id} className="space-y-2">
            <Label>{field.label}</Label>
            <Input
              placeholder={field.placeholder}
              value={value}
              onChange={e => updateField(field.id, e.target.value)}
            />
          </div>
        );
    }
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
      {/* Header */}
      <div className="hero-gradient text-primary-foreground py-6 px-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/registration/portal')}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{formDef.name}</h1>
            <p className="text-sm text-primary-foreground/70">Fill and save your progress anytime</p>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {formDef.rows.map(row => (
          <Card key={row.id}>
            <CardContent className="p-6">
              <div
                className="grid gap-6"
                style={{ gridTemplateColumns: `repeat(${row.columns}, 1fr)` }}
              >
                {row.fields.map((field, idx) => (
                  <div key={field?.id || idx}>
                    {renderField(field)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            onClick={() => navigate('/registration/portal')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Portal
          </Button>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saving}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button
              onClick={handleComplete}
              disabled={saving}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark Complete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
