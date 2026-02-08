import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// Mock form field data keyed by form id
const formTemplates: Record<string, { name: string; fields: { id: string; label: string; type: 'text' | 'textarea' | 'select' | 'date'; options?: string[]; value?: string }[] }> = {
  f1: {
    name: 'Schedule 2 - Company Information',
    fields: [
      { id: 'company_name', label: 'Company Name', type: 'text', value: 'ABC Financial Services Ltd.' },
      { id: 'registration_number', label: 'Registration Number', type: 'text', value: 'REG-2024-001' },
      { id: 'date_of_incorporation', label: 'Date of Incorporation', type: 'date', value: '2020-03-15' },
      { id: 'registered_address', label: 'Registered Address', type: 'textarea', value: '123 Finance Street, Capital City' },
      { id: 'nature_of_business', label: 'Nature of Business', type: 'select', options: ['Insurance', 'Banking', 'Securities', 'Other'], value: 'Insurance' },
    ],
  },
  f2: {
    name: 'Schedule 5 - Directors & Officers',
    fields: [
      { id: 'director_name', label: 'Director Full Name', type: 'text', value: 'Jane Doe' },
      { id: 'position', label: 'Position/Title', type: 'text', value: 'Managing Director' },
      { id: 'appointment_date', label: 'Date of Appointment', type: 'date', value: '2021-06-01' },
      { id: 'qualifications', label: 'Qualifications', type: 'textarea', value: 'MBA, CFA, 15 years experience in insurance sector' },
    ],
  },
  f3: {
    name: 'MLRO/MLCO/CO Declaration',
    fields: [
      { id: 'officer_name', label: 'Compliance Officer Name', type: 'text', value: 'Robert Brown' },
      { id: 'role', label: 'Role', type: 'select', options: ['MLRO', 'MLCO', 'Compliance Officer'], value: 'MLRO' },
      { id: 'experience', label: 'Years of Experience', type: 'text', value: '10' },
      { id: 'declaration', label: 'Declaration Statement', type: 'textarea', value: '' },
    ],
  },
  f4: {
    name: 'Financial Statements',
    fields: [
      { id: 'fiscal_year', label: 'Fiscal Year', type: 'text' },
      { id: 'total_assets', label: 'Total Assets', type: 'text' },
      { id: 'total_liabilities', label: 'Total Liabilities', type: 'text' },
      { id: 'net_income', label: 'Net Income', type: 'text' },
      { id: 'auditor_name', label: 'Auditor Name', type: 'text' },
      { id: 'notes', label: 'Additional Notes', type: 'textarea' },
    ],
  },
  f5: {
    name: 'Supporting Documents',
    fields: [
      { id: 'doc_type', label: 'Document Type', type: 'select', options: ['Certificate of Incorporation', 'Board Resolution', 'AML Policy', 'Business Plan', 'Other'] },
      { id: 'description', label: 'Description', type: 'textarea' },
      { id: 'reference_number', label: 'Reference Number', type: 'text' },
    ],
  },
};

export default function FormDetail() {
  const { applicationId, formId } = useParams<{ applicationId: string; formId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mode = searchParams.get('mode') === 'edit' ? 'edit' : 'view';
  const template = formTemplates[formId || ''] ?? { name: 'Unknown Form', fields: [] };

  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    template.fields.forEach(f => { initial[f.id] = f.value ?? ''; });
    return initial;
  });

  const isReadOnly = mode === 'view';

  const handleSave = () => {
    toast({ title: 'Form Saved', description: `${template.name} has been saved successfully.` });
    navigate(`/pre-licensee/applications/${applicationId}/forms`);
  };

  const renderField = (field: typeof template.fields[0]) => {
    const val = formData[field.id] ?? '';
    const onChange = (v: string) => setFormData(prev => ({ ...prev, [field.id]: v }));

    switch (field.type) {
      case 'textarea':
        return <Textarea value={val} onChange={e => onChange(e.target.value)} disabled={isReadOnly} placeholder={`Enter ${field.label.toLowerCase()}`} rows={3} />;
      case 'select':
        return (
          <Select value={val} onValueChange={onChange} disabled={isReadOnly}>
            <SelectTrigger><SelectValue placeholder={`Select ${field.label.toLowerCase()}`} /></SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case 'date':
        return <Input type="date" value={val} onChange={e => onChange(e.target.value)} disabled={isReadOnly} />;
      default:
        return <Input value={val} onChange={e => onChange(e.target.value)} disabled={isReadOnly} placeholder={`Enter ${field.label.toLowerCase()}`} />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/pre-licensee/applications/${applicationId}/forms`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{template.name}</h1>
            <p className="text-muted-foreground">Application: {applicationId} &middot; Form: {formId}</p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${mode === 'view' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-warning/10 text-warning border border-warning/20'}`}>
            {mode === 'view' ? 'Read Only' : 'Editing'}
          </span>
        </div>

        <div className="card-elevated p-6 space-y-6">
          {template.fields.map(field => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id}>{field.label}</Label>
              {renderField(field)}
            </div>
          ))}

          {!isReadOnly && (
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
