import { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
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
import { Badge } from '@/components/ui/badge';
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
import { useSaveForm, useForm } from '@/hooks/useForms';
import type { FormField, FormRow } from '@/types/formBuilder';

const defaultRows: FormRow[] = [
  {
    id: '1',
    columns: 2,
    fields: [
      { id: 'f1', type: 'text', label: 'First Name', required: true, placeholder: 'Enter first name' },
      { id: 'f2', type: 'text', label: 'Last Name', required: true, placeholder: 'Enter last name' },
    ],
  },
  {
    id: '2',
    columns: 3,
    fields: [
      { id: 'f3', type: 'email', label: 'Email', required: true, placeholder: 'email@example.com' },
      { id: 'f4', type: 'phone', label: 'Phone', required: true, placeholder: '+1 234 567 8900' },
      { id: 'f5', type: 'date', label: 'Date of Birth', required: false },
    ],
  },
  {
    id: '3',
    columns: 1,
    fields: [
      { id: 'f6', type: 'textarea', label: 'Address', required: false, placeholder: 'Enter full address...' },
    ],
  },
];

export default function FormBuilder() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const formType = searchParams.get('type') || 'pre_license';
  const formTypeLabel = formType === 'pre_license' ? 'Pre-License' : 'Post-License';
  const editId = searchParams.get('id');
  const isViewMode = searchParams.get('mode') === 'view';
  const saveFormMutation = useSaveForm();

  // Load existing form if editing
  const { data: existingForm } = useForm(editId);

  const [rows, setRows] = useState<FormRow[]>(defaultRows);
  const [selectedField, setSelectedField] = useState<FormField | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedSubSector, setSelectedSubSector] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Populate state when existing form loads
  useMemo(() => {
    if (!existingForm || initialized) return;
    setRows(existingForm.rows || defaultRows);
    setFormName(existingForm.name || '');
    setSelectedSector(existingForm.sector || '');
    setSelectedSubSector(existingForm.sub_sector || '');
    const cat = categories.find(c => c.name === existingForm.category);
    setSelectedCategory(cat?.id || '');
    const svc = services.find(s => s.name === existingForm.service);
    setSelectedService(svc?.id || '');
    setInitialized(true);
  }, [existingForm, initialized]);

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

  // Row management
  const handleAddRow = useCallback((columns: 1 | 2 | 3 | 4) => {
    const newRow: FormRow = {
      id: crypto.randomUUID(),
      columns,
      fields: Array(columns).fill(null),
    };
    setRows(prev => [...prev, newRow]);
  }, []);

  const handleDeleteRow = useCallback((rowId: string) => {
    setRows(prev => prev.filter(r => r.id !== rowId));
    setSelectedField(prev => {
      const row = rows.find(r => r.id === rowId);
      if (row && row.fields.some(f => f?.id === prev?.id)) return null;
      return prev;
    });
  }, [rows]);

  const handleUpdateRowColumns = useCallback((rowId: string, columns: 1 | 2 | 3 | 4) => {
    setRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      const newFields: (FormField | null)[] = Array(columns).fill(null);
      // Preserve existing fields
      for (let i = 0; i < Math.min(row.fields.length, columns); i++) {
        newFields[i] = row.fields[i];
      }
      return { ...row, columns, fields: newFields };
    }));
  }, []);

  const handleReorderRows = useCallback((reordered: FormRow[]) => {
    setRows(reordered);
  }, []);

  // Field management
  const handleAddFieldToSlot = useCallback((rowId: string, slotIndex: number, type: string) => {
    const ft = fieldTypes.find(f => f.type === type);
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: ft?.label || 'New Field',
      required: false,
      placeholder: '',
      options: ['radio', 'select', 'checkbox'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
      content: type === 'paragraph' ? 'Enter your text here...' : undefined,
    };
    setRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      const fields = [...row.fields];
      fields[slotIndex] = newField;
      return { ...row, fields };
    }));
    setSelectedField(newField);
  }, []);

  const handleAddFieldFromPalette = useCallback((type: string) => {
    // Add a new 1-column row with the field
    const ft = fieldTypes.find(f => f.type === type);
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: ft?.label || 'New Field',
      required: false,
      placeholder: '',
      options: ['radio', 'select', 'checkbox'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
      content: type === 'paragraph' ? 'Enter your text here...' : undefined,
    };
    const newRow: FormRow = {
      id: crypto.randomUUID(),
      columns: 1,
      fields: [newField],
    };
    setRows(prev => [...prev, newRow]);
    setSelectedField(newField);
  }, []);

  const handleDeleteField = useCallback((rowId: string, slotIndex: number) => {
    setRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      const fields = [...row.fields];
      if (fields[slotIndex]?.id === selectedField?.id) setSelectedField(null);
      fields[slotIndex] = null;
      return { ...row, fields };
    }));
  }, [selectedField]);

  const handleDuplicateField = useCallback((rowId: string, slotIndex: number) => {
    setRows(prev => {
      const rowIdx = prev.findIndex(r => r.id === rowId);
      if (rowIdx === -1) return prev;
      const field = prev[rowIdx].fields[slotIndex];
      if (!field) return prev;
      const clone: FormField = { ...field, id: crypto.randomUUID() };
      // Add as new 1-col row after current row
      const newRow: FormRow = { id: crypto.randomUUID(), columns: 1, fields: [clone] };
      const next = [...prev];
      next.splice(rowIdx + 1, 0, newRow);
      return next;
    });
  }, []);

  const handleUpdateField = useCallback((id: string, updates: Partial<FormField>) => {
    setRows(prev => prev.map(row => ({
      ...row,
      fields: row.fields.map(f => (f?.id === id ? { ...f, ...updates } : f)),
    })));
    setSelectedField(prev => (prev?.id === id ? { ...prev, ...updates } : prev));
  }, []);

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Please enter a form name.');
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

      await saveFormMutation.mutateAsync({
        id: editId || crypto.randomUUID(),
        name: formName.trim(),
        form_type: formType as 'pre_license' | 'post_license',
        category: categoryName,
        service: serviceName,
        sector: selectedSector,
        sub_sector: selectedSubSector,
        status: existingForm?.status || 'draft',
        rows,
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

  // Flatten fields for preview
  const allFields = rows.flatMap(r => r.fields.filter(Boolean)) as FormField[];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title={`${formTypeLabel} Form Builder`}
          description={`Create a new ${formTypeLabel.toLowerCase()} form with row-based layouts.`}
          backHref={formType === 'pre_license' ? '/admin/forms/pre-license' : '/admin/forms/post-license'}
          backLabel={`${formTypeLabel} Forms`}
          actions={
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
          }
        />

        {/* Form Details */}
        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Form Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Sector</Label>
                <Select value={selectedSector} onValueChange={handleSectorChange} disabled={isViewMode}>
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

              {selectedSector && (
                <div className="space-y-2">
                  <Label>Sub Sector</Label>
                  <Select value={selectedSubSector} onValueChange={handleSubSectorChange} disabled={isViewMode}>
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

              {formType === 'pre_license' && selectedSubSector && (
                <div className="space-y-2">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={isViewMode}>
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

              {formType === 'post_license' && selectedSubSector && (
                <div className="space-y-2">
                  <Label>Service <span className="text-destructive">*</span></Label>
                  <Select value={selectedService} onValueChange={setSelectedService} disabled={isViewMode}>
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

              {((formType === 'pre_license' && selectedCategory) || (formType === 'post_license' && selectedService)) && (
                <div className="space-y-2">
                  <Label>Form Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="Enter form name"
                    disabled={isViewMode}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Builder panels */}
        <div className="grid grid-cols-12 gap-6 animate-slide-up delay-200">
          <FormBuilderCanvas
            rows={rows}
            selectedField={selectedField}
            onSelectField={setSelectedField}
            onReorderRows={handleReorderRows}
            onAddRow={handleAddRow}
            onDeleteRow={handleDeleteRow}
            onUpdateRowColumns={handleUpdateRowColumns}
            onAddFieldToSlot={handleAddFieldToSlot}
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
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formName || 'Untitled Form'}</DialogTitle>
            <DialogDescription>
              Preview of form layout ({allFields.length} fields · {rows.length} rows)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {rows.map((row) => (
              <div
                key={row.id}
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${row.columns}, 1fr)` }}
              >
                {row.fields.map((field, slotIndex) => (
                  <div key={`${row.id}-${slotIndex}`}>
                    {field ? (
                      <div className="space-y-2">
                        {field.type === 'paragraph' ? (
                          <div className="p-3 rounded-md bg-muted/50 text-sm text-muted-foreground whitespace-pre-wrap">
                            {field.content || 'Paragraph text...'}
                          </div>
                        ) : (
                          <>
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
                              <div className="space-y-1.5">
                                {(field.options || ['Option 1']).map((opt, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <input type="checkbox" disabled className="h-4 w-4" />
                                    <span className="text-sm text-muted-foreground">{opt}</span>
                                  </div>
                                ))}
                              </div>
                            ) : field.type === 'radio' ? (
                              <div className="space-y-1.5">
                                {(field.options || ['Option 1']).map((opt, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <input type="radio" disabled name={field.id} className="h-4 w-4" />
                                    <span className="text-sm text-muted-foreground">{opt}</span>
                                  </div>
                                ))}
                              </div>
                            ) : field.type === 'select' ? (
                              <Select disabled>
                                <SelectTrigger>
                                  <SelectValue placeholder={field.placeholder || 'Select...'} />
                                </SelectTrigger>
                                <SelectContent>
                                  {(field.options || ['Option 1']).map((opt, i) => (
                                    <SelectItem key={i} value={opt}>{opt}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={field.type === 'phone' ? 'tel' : field.type}
                                placeholder={field.placeholder}
                                disabled
                              />
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="h-16 rounded-md border-2 border-dashed border-muted-foreground/10 flex items-center justify-center">
                        <span className="text-xs text-muted-foreground/40">Empty</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
