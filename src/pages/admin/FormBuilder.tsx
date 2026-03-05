import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
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
  Eye,
  Save,
} from 'lucide-react';
import {
  sectors,
  subSectors,
  categories,
  services,
  getSubSectorsBySector,
  getCategoriesBySubSector,
  getServicesBySubSector,
} from '@/data/sectorData';
import { FormBuilderFieldPalette } from '@/components/form-builder/FieldPalette';
import { FormBuilderCanvas } from '@/components/form-builder/Canvas';
import { FormBuilderFieldProperties } from '@/components/form-builder/FieldProperties';

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

  // Form details state
  const [formName, setFormName] = useState('Life Insurance Application Form');
  const [formType, setFormType] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [selectedSubSector, setSelectedSubSector] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('');

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
            <Button variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button>
              <Save className="h-4 w-4 mr-2" />
              Save Form
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
              {/* Form Name */}
              <div className="space-y-2">
                <Label>Form Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Enter form name"
                />
              </div>

              {/* Form Type */}
              <div className="space-y-2">
                <Label>Form Type</Label>
                <Select value={formType} onValueChange={handleFormTypeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select form type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_license">Pre-License</SelectItem>
                    <SelectItem value="post_license">Post-License</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sector – shown once form type is selected */}
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

              {/* Sub Sector */}
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

              {/* Category – Pre-License only */}
              {formType === 'pre_license' && selectedSubSector && (
                <div className="space-y-2">
                  <Label>
                    Category <span className="text-destructive">*</span>
                  </Label>
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

              {/* Service – Post-License only */}
              {formType === 'post_license' && selectedSubSector && (
                <div className="space-y-2">
                  <Label>
                    Service <span className="text-destructive">*</span>
                  </Label>
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
    </DashboardLayout>
  );
}
