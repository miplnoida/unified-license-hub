import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Eye,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  sectors,
  getSubSectorsBySector,
  getCategoriesBySubSector,
  getServicesBySubSector,
  categories,
  services,
} from '@/data/sectorData';
import { FormBuilderFieldPalette, fieldTypes } from '@/components/form-builder/FieldPalette';
import { FormBuilderCanvas } from '@/components/form-builder/Canvas';
import { FormBuilderFieldProperties } from '@/components/form-builder/FieldProperties';
import { saveForm } from '@/lib/formStorage';

interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
}

const sampleFields: FormField[] = [
  { id: '1', type: 'text', label: 'Company Name', required: true, placeholder: 'Enter company name' },
  { id: '2', type: 'text', label: 'Registration Number', required: true, placeholder: 'Enter registration number' },
  { id: '3', type: 'email', label: 'Contact Email', required: true, placeholder: 'email@example.com' },
  { id: '4', type: 'phone', label: 'Contact Phone', required: true, placeholder: '+1 234 567 8900' },
  { id: '5', type: 'textarea', label: 'Business Description', required: false, placeholder: 'Describe your business...' },
  { id: '6', type: 'file', label: 'Registration Certificate', required: true },
];

export default function FormBuilder() {
  const [fields, setFields] = useState<FormField[]>(sampleFields);
  const [selectedField, setSelectedField] = useState<FormField | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Read locked form type from URL params
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const lockedFormType = searchParams.get('type') || '';

  // Form details state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<string>(lockedFormType);
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [selectedSubSector, setSelectedSubSector] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('');

  const isFormTypeLocked = !!lockedFormType;
  const filteredSubSectors = useMemo(
    () => (selectedSector ? getSubSectorsBySector(selectedSector) : []),
    [selectedSector]
  );

  const filteredCategories = useMemo(
    () => (selectedSubSector ? getCategoriesBySubSector(selectedSubSector) : []),
    [selectedSubSector]
  );

  const filteredServices = useMemo(
    () => (selectedSubSector ? getServicesBySubSector(selectedSubSector) : []),
    [selectedSubSector]
  );

  const handleFormTypeChange = (value: string) => {
    setFormType(value);
    setSelectedSector('');
    setSelectedSubSector('');
    setSelectedCategory('');
    setSelectedService('');
  };

  const handleSectorChange = (value: string) => {
    setSelectedSector(value);
    setSelectedSubSector('');
    setSelectedCategory('');
    setSelectedService('');
  };

  const handleSubSectorChange = (value: string) => {
    setSelectedSubSector(value);
    setSelectedCategory('');
    setSelectedService('');
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Please enter a form name.');
      return;
    }
    if (!formType) {
      toast.error('Please select a form type.');
      return;
    }
    if (formType === 'pre_license' && selectedSubSector && !selectedCategory) {
      toast.error('Please select a category for Pre-License forms.');
      return;
    }
    if (formType === 'post_license' && selectedSubSector && !selectedService) {
      toast.error('Please select a service for Post-License forms.');
      return;
    }

    setIsSaving(true);
    try {
      const categoryName = selectedCategory
        ? (categories.find((c) => c.id === selectedCategory)?.name || selectedCategory)
        : '';
      const serviceName = selectedService
        ? (services.find((s) => s.id === selectedService)?.name || selectedService)
        : '';

      saveForm({
        id: crypto.randomUUID(),
        name: formName.trim(),
        formType: formType as 'pre_license' | 'post_license',
        category: categoryName,
        service: serviceName,
        sector: selectedSector,
        subSector: selectedSubSector,
        status: 'draft',
        createdDate: new Date().toISOString().split('T')[0],
        fields,
      });

      toast.success('Form saved successfully!');
      const listPath = formType === 'pre_license'
        ? '/admin/forms/pre-license'
        : '/admin/forms/post-license';
      navigate(listPath);
    } catch (error) {
      console.error('Error saving form:', error);
      toast.error('Failed to save form. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const getFieldIcon = (type: string) => {
    const ft = fieldTypes.find((f) => f.type === type);
    return ft?.icon || null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Form Builder</h1>
            <p className="mt-1 text-muted-foreground">
              Create and manage dynamic forms for applications and returns.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowPreview(true)}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Form'}
            </Button>
          </div>
        </div>

        {/* Form Details */}
        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Form Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Form Type</Label>
                <Select value={formType} onValueChange={handleFormTypeChange} disabled={isFormTypeLocked}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select form type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_license">Pre-License</SelectItem>
                    <SelectItem value="post_license">Post-License</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formType && (
                <div className="space-y-2">
                  <Label>Sector</Label>
                  <Select value={selectedSector} onValueChange={handleSectorChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sector" />
                    </SelectTrigger>
                    <SelectContent>
                      {sectors.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedSector && (
                <div className="space-y-2">
                  <Label>Sub Sector</Label>
                  <Select value={selectedSubSector} onValueChange={handleSubSectorChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sub sector" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSubSectors.map((ss) => (
                        <SelectItem key={ss.id} value={ss.id}>{ss.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formType === 'pre_license' && selectedSubSector && (
                <div className="space-y-2">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formType === 'post_license' && selectedSubSector && (
                <div className="space-y-2">
                  <Label>Service <span className="text-destructive">*</span></Label>
                  <Select value={selectedService} onValueChange={setSelectedService}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredServices.map((svc) => (
                        <SelectItem key={svc.id} value={svc.id}>{svc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Form Name appears after Category/Service selection */}
              {(formType === 'pre_license' && selectedCategory) || (formType === 'post_license' && selectedService) ? (
                <div className="space-y-2">
                  <Label>Form Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Enter form name"
                  />
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Builder panels */}
        <div className="grid lg:grid-cols-4 gap-6 animate-slide-up delay-200">
          <FormBuilderFieldPalette />
          <FormBuilderCanvas
            fields={fields}
            selectedField={selectedField}
            onSelectField={setSelectedField}
          />
          <FormBuilderFieldProperties selectedField={selectedField} />
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formName || 'Untitled Form'}</DialogTitle>
            <DialogDescription>
              Preview of form fields ({fields.length} fields)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {fields.map((field) => (
              <div key={field.id} className="space-y-2">
                <Label>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.type === 'textarea' ? (
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder={field.placeholder}
                    disabled
                  />
                ) : field.type === 'file' ? (
                  <Input type="file" disabled />
                ) : field.type === 'checkbox' ? (
                  <div className="flex items-center gap-2">
                    <input type="checkbox" disabled className="h-4 w-4" />
                    <span className="text-sm text-muted-foreground">{field.label}</span>
                  </div>
                ) : field.type === 'select' ? (
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder || 'Select...'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="option1">Option 1</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.type === 'phone' ? 'tel' : field.type}
                    placeholder={field.placeholder}
                    disabled
                  />
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
