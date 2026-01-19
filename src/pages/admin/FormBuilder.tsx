import { useState } from 'react';
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
  Plus,
  GripVertical,
  Settings,
  Copy,
  Trash2,
  Eye,
  Save,
  Type,
  Hash,
  Mail,
  Calendar,
  List,
  CheckSquare,
  FileUp,
  AlignLeft,
  Phone,
} from 'lucide-react';

interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
}

const fieldTypes = [
  { type: 'text', label: 'Text Input', icon: <Type className="h-4 w-4" /> },
  { type: 'number', label: 'Number', icon: <Hash className="h-4 w-4" /> },
  { type: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { type: 'phone', label: 'Phone', icon: <Phone className="h-4 w-4" /> },
  { type: 'date', label: 'Date', icon: <Calendar className="h-4 w-4" /> },
  { type: 'select', label: 'Dropdown', icon: <List className="h-4 w-4" /> },
  { type: 'checkbox', label: 'Checkbox', icon: <CheckSquare className="h-4 w-4" /> },
  { type: 'file', label: 'File Upload', icon: <FileUp className="h-4 w-4" /> },
  { type: 'textarea', label: 'Text Area', icon: <AlignLeft className="h-4 w-4" /> },
];

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

  const getFieldIcon = (type: string) => {
    const fieldType = fieldTypes.find(f => f.type === type);
    return fieldType?.icon || <Type className="h-4 w-4" />;
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
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Form Name</Label>
                <Input defaultValue="Life Insurance Application Form" />
              </div>
              <div className="space-y-2">
                <Label>Form Type</Label>
                <Select defaultValue="pre_license">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_license">Pre-License</SelectItem>
                    <SelectItem value="post_license">Post-License</SelectItem>
                    <SelectItem value="return">Return</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select defaultValue="life_insurer">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="life_insurer">Life Insurer License</SelectItem>
                    <SelectItem value="life_broker">Life Insurance Broker</SelectItem>
                    <SelectItem value="general_insurer">General Insurer License</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-4 gap-6 animate-slide-up delay-200">
          {/* Field Palette */}
          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-base">Field Types</CardTitle>
                <CardDescription>Drag fields to the form</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {fieldTypes.map((fieldType) => (
                  <div
                    key={fieldType.type}
                    className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 cursor-grab transition-colors"
                    draggable
                  >
                    <div className="text-muted-foreground">{fieldType.icon}</div>
                    <span className="text-sm font-medium">{fieldType.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Form Canvas */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Form Fields</CardTitle>
                  <Badge variant="secondary">{fields.length} fields</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className={`flex items-center gap-3 p-4 rounded-lg border transition-all cursor-pointer ${
                      selectedField?.id === field.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedField(field)}
                  >
                    <div className="cursor-grab text-muted-foreground hover:text-foreground">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
                      {getFieldIcon(field.type)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{field.label}</p>
                      <p className="text-xs text-muted-foreground capitalize">{field.type}</p>
                    </div>
                    {field.required && (
                      <Badge variant="outline" className="text-xs">Required</Badge>
                    )}
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full border-dashed">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Field
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Field Properties */}
          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-base">Field Properties</CardTitle>
                <CardDescription>
                  {selectedField ? `Editing: ${selectedField.label}` : 'Select a field to edit'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedField ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Label</Label>
                      <Input defaultValue={selectedField.label} />
                    </div>
                    <div className="space-y-2">
                      <Label>Field Type</Label>
                      <Select defaultValue={selectedField.type}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {fieldTypes.map((ft) => (
                            <SelectItem key={ft.type} value={ft.type}>
                              <div className="flex items-center gap-2">
                                {ft.icon}
                                <span>{ft.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Placeholder</Label>
                      <Input defaultValue={selectedField.placeholder} placeholder="Enter placeholder text" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Required</Label>
                      <input type="checkbox" defaultChecked={selectedField.required} className="h-4 w-4" />
                    </div>
                    <div className="pt-4 border-t space-y-2">
                      <Label className="text-muted-foreground">Validation Rules</Label>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Minimum Length</span>
                          <Input type="number" className="w-20 h-8" placeholder="0" />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Maximum Length</span>
                          <Input type="number" className="w-20 h-8" placeholder="255" />
                        </div>
                      </div>
                    </div>
                    <div className="pt-4 border-t">
                      <Button variant="outline" className="w-full">
                        <Settings className="h-4 w-4 mr-2" />
                        Advanced Settings
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Settings className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Click on a field to edit its properties
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
