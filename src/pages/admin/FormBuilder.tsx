import { useState, useMemo, useCallback } from 'react';
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
import { Eye, Save } from 'lucide-react';
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

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const formType = searchParams.get('type') || 'pre_license';
  const formTypeLabel = formType === 'pre_license' ? 'Pre-License' : 'Post-License';

  const [formName, setFormName] = useState('');
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedSubSector, setSelectedSubSector] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');

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

  // Field management
  const handleAddField = useCallback((type: string) => {
    const ft = fieldTypes.find(f => f.type === type);
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: ft?.label || 'New Field',
      required: false,
      placeholder: '',
    };
    setFields(prev => [...prev, newField]);
    setSelectedField(newField);
  }, []);

  const handleDeleteField = useCallback((id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    setSelectedField(prev => (prev?.id === id ? null : prev));
  }, []);

  const handleDuplicateField = useCallback((id: string) => {
    setFields(prev => {
      const idx = prev.findIndex(f => f.id === id);
      if (idx === -1) return prev;
      const clone = { ...prev[idx], id: crypto.randomUUID() };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  }, []);

  const handleReorder = useCallback((reordered: FormField[]) => {
    setFields(reordered);
  }, []);

  const handleUpdateField = useCallback((id: string, updates: Partial<FormField>) => {
    setFields(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
    setSelectedField(prev => (prev?.id === id ? { ...prev, ...updates } : prev));
  }, []);

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Please enter a form name.');
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
        ? (categories.find(c => c.id === selectedCategory)?.name || selectedCategory)
        : '';
      const serviceName = selectedService
        ? (services.find(s => s.id === selectedService)?.name || selectedService)
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
      navigate(formType === 'pre_license' ? '/admin/forms/pre-license' : '/admin/forms/post-license');
    } catch (error) {
      console.error('Error saving form:', error);
      toast.error('Failed to save form. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {formTypeLabel} Form Builder
            </h1>
            <p className="mt-1 text-muted-foreground">
              Create a new {formTypeLabel.toLowerCase()} form with drag-and-drop fields.
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
              {/* Sector */}
              <div className="space-y-2">
                <Label>Sector</Label>
                <Select value={selectedSector} onValueChange={handleSectorChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sector" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectors.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sub Sector */}
              {selectedSector && (
                <div className="space-y-2">
                  <Label>Sub Sector</Label>
                  <Select value={selectedSubSector} onValueChange={handleSubSectorChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sub sector" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSubSectors.map(ss => (
                        <SelectItem key={ss.id} value={ss.id}>{ss.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Category for Pre-License */}
              {formType === 'pre_license' && selectedSubSector && (
                <div className="space-y-2">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCategories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Service for Post-License */}
              {formType === 'post_license' && selectedSubSector && (
                <div className="space-y-2">
                  <Label>Service <span className="text-destructive">*</span></Label>
                  <Select value={selectedService} onValueChange={setSelectedService}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredServices.map(svc => (
                        <SelectItem key={svc.id} value={svc.id}>{svc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Form Name after Category/Service */}
              {((formType === 'pre_license' && selectedCategory) || (formType === 'post_license' && selectedService)) && (
                <div className="space-y-2">
                  <Label>Form Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="Enter form name"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Builder panels */}
        <div className="grid lg:grid-cols-4 gap-6 animate-slide-up delay-200">
          <FormBuilderFieldPalette onAddField={handleAddField} />
          <FormBuilderCanvas
            fields={fields}
            selectedField={selectedField}
            onSelectField={setSelectedField}
            onReorder={handleReorder}
            onAddField={handleAddField}
            onDeleteField={handleDeleteField}
            onDuplicateField={handleDuplicateField}
          />
          <FormBuilderFieldProperties
            selectedField={selectedField}
            onUpdateField={handleUpdateField}
          />
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
            {fields.map(field => (
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
