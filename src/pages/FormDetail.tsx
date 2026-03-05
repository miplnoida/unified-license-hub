import { useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useForm as useFormDetail } from '@/hooks/useForms';
import type { FormField } from '@/types/formBuilder';

export default function FormDetail() {
  const { applicationId, formId } = useParams<{ applicationId: string; formId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mode = searchParams.get('mode') === 'edit' ? 'edit' : 'view';
  const { data: dbForm, isLoading } = useFormDetail(formId || null);

  // Flatten all fields from form rows
  const fields = useMemo(() => {
    if (!dbForm?.rows) return [];
    const result: FormField[] = [];
    dbForm.rows.forEach(row => {
      row.fields.forEach(f => {
        if (f) result.push(f);
      });
    });
    return result;
  }, [dbForm]);

  const [formData, setFormData] = useState<Record<string, string>>({});

  const isReadOnly = mode === 'view';

  const handleSave = () => {
    toast({ title: 'Form Saved', description: `${dbForm?.name || 'Form'} has been saved successfully.` });
    navigate(`/pre-licensee/applications/${applicationId}/forms`);
  };

  const renderField = (field: FormField) => {
    const val = formData[field.id] ?? '';
    const onChange = (v: string) => setFormData(prev => ({ ...prev, [field.id]: v }));

    switch (field.type) {
      case 'textarea':
        return <Textarea value={val} onChange={e => onChange(e.target.value)} disabled={isReadOnly} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} rows={3} />;
      case 'select':
        return (
          <Select value={val} onValueChange={onChange} disabled={isReadOnly}>
            <SelectTrigger><SelectValue placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`} /></SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case 'date':
        return <Input type="date" value={val} onChange={e => onChange(e.target.value)} disabled={isReadOnly} />;
      case 'number':
        return <Input type="number" value={val} onChange={e => onChange(e.target.value)} disabled={isReadOnly} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} />;
      case 'email':
        return <Input type="email" value={val} onChange={e => onChange(e.target.value)} disabled={isReadOnly} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} />;
      case 'checkbox':
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              id={field.id}
              checked={val === 'true'}
              onCheckedChange={(checked) => onChange(String(checked))}
              disabled={isReadOnly}
            />
            <label htmlFor={field.id} className="text-sm">{field.placeholder || field.label}</label>
          </div>
        );
      case 'radio':
        return (
          <div className="space-y-2">
            {(field.options ?? []).map(o => (
              <label key={o} className="flex items-center gap-2 text-sm">
                <input type="radio" name={field.id} value={o} checked={val === o} onChange={() => onChange(o)} disabled={isReadOnly} />
                {o}
              </label>
            ))}
          </div>
        );
      case 'file':
        return <Input type="file" disabled={isReadOnly} />;
      case 'paragraph':
        return <p className="text-sm text-muted-foreground">{field.placeholder || field.label}</p>;
      default:
        return <Input value={val} onChange={e => onChange(e.target.value)} disabled={isReadOnly} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} />;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!dbForm) {
    return (
      <DashboardLayout>
        <div className="space-y-6 max-w-3xl">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/pre-licensee/applications/${applicationId}/forms`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Form Not Found</h1>
              <p className="text-muted-foreground">This form does not exist or has been removed.</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/pre-licensee/applications/${applicationId}/forms`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{dbForm.name}</h1>
            <p className="text-muted-foreground">
              {dbForm.sector} · {dbForm.sub_sector} · {dbForm.category}
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${mode === 'view' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-warning/10 text-warning border border-warning/20'}`}>
            {mode === 'view' ? 'Read Only' : 'Editing'}
          </span>
        </div>

        <div className="card-elevated p-6 space-y-6">
          {fields.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">This form has no fields configured.</p>
          ) : (
            <>
              {dbForm.rows.map((row, rowIdx) => (
                <div key={rowIdx} className={`grid gap-4 grid-cols-${row.columns}`}>
                  {row.fields.map((field, colIdx) => (
                    <div key={colIdx} className="space-y-2">
                      {field ? (
                        <>
                          {field.type !== 'paragraph' && field.type !== 'checkbox' && (
                            <Label htmlFor={field.id}>
                              {field.label}
                              {field.required && <span className="text-destructive ml-1">*</span>}
                            </Label>
                          )}
                          {renderField(field)}
                        </>
                      ) : (
                        <div className="h-10" /> // empty slot
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          {!isReadOnly && fields.length > 0 && (
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                Save Form
              </Button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
