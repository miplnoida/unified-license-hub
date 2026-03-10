import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Eye, Save, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { useSectors, useSubSectors, useCategories, useServices } from '@/hooks/useMasterConfig';
import { FormBuilderFieldPalette } from '@/components/form-builder/FieldPalette';
import { SectionManager } from '@/components/form-builder/SectionManager';
import { FormBuilderFieldProperties } from '@/components/form-builder/FieldProperties';
import { useSaveForm, useForm, useCreateNewVersion } from '@/hooks/useForms';
import { fieldTypes } from '@/components/form-builder/FieldPalette';
import type { FormField, FormSection, FieldType } from '@/types/formBuilder';

function toFieldName(label: string): string {
  return label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

export default function FormBuilder() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const formType = searchParams.get('type') || 'pre_license';
  const editId = searchParams.get('id');
  const isViewMode = searchParams.get('mode') === 'view';
  const saveFormMutation = useSaveForm();
  const createVersionMutation = useCreateNewVersion();

  const { data: existingForm } = useForm(editId);

  const { data: dbSectors = [] } = useSectors();
  const { data: dbSubSectors = [] } = useSubSectors();
  const { data: dbCategories = [] } = useCategories();
  const { data: dbServices = [] } = useServices();

  const activeSectors = dbSectors.filter(s => s.status === 'active');

  const [sections, setSections] = useState<FormSection[]>([]);
  const [selectedField, setSelectedField] = useState<FormField | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedSubSector, setSelectedSubSector] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Populate state when existing form loads
  useEffect(() => {
    if (!existingForm || initialized || dbSectors.length === 0) return;
    // rows column stores sections now
    const loadedSections = existingForm.rows as unknown as FormSection[];
    setSections(Array.isArray(loadedSections) ? loadedSections : []);
    setFormName(existingForm.name || '');
    setFormDescription(existingForm.description || '');
    const sectorRow = dbSectors.find(s => s.name === existingForm.sector);
    setSelectedSector(sectorRow?.id || '');
    const subSectorRow = dbSubSectors.find(s => s.name === existingForm.sub_sector);
    setSelectedSubSector(subSectorRow?.id || '');
    const catRow = dbCategories.find(c => c.name === existingForm.category);
    setSelectedCategory(catRow?.id || '');
    const svcRow = dbServices.find(s => s.name === existingForm.service);
    setSelectedService(svcRow?.id || '');
    setInitialized(true);
  }, [existingForm, initialized, dbSectors, dbSubSectors, dbCategories, dbServices]);

  const filteredSubSectors = useMemo(
    () => dbSubSectors.filter(s => s.sector_id === selectedSector && s.status === 'active'),
    [selectedSector, dbSubSectors]
  );
  const filteredCategories = useMemo(
    () => dbCategories.filter(c => c.sub_sector_id === selectedSubSector && c.status === 'active'),
    [selectedSubSector, dbCategories]
  );
  const filteredServices = useMemo(
    () => dbServices.filter(s => s.sub_sector_id === selectedSubSector && s.status === 'active'),
    [selectedSubSector, dbServices]
  );

  const handleSectorChange = (v: string) => { setSelectedSector(v); setSelectedSubSector(''); setSelectedCategory(''); setSelectedService(''); };
  const handleSubSectorChange = (v: string) => { setSelectedSubSector(v); setSelectedCategory(''); setSelectedService(''); };

  // All fields flattened for properties panel
  const allFields = useMemo(() => sections.flatMap(s => s.fields), [sections]);

  // Field operations
  const handleAddField = useCallback((sectionId: string, type: FieldType) => {
    const ft = fieldTypes.find(f => f.type === type);
    const label = ft?.label || 'New Field';
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label,
      fieldName: toFieldName(label),
      required: false,
      placeholder: '',
      options: ['radio', 'select', 'checkbox', 'multi_select'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
      content: type === 'paragraph' ? 'Enter text here...' : undefined,
      tableColumns: type === 'table' ? [{ id: crypto.randomUUID(), label: 'Column 1', type: 'text' }] : undefined,
    };
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, fields: [...s.fields, newField] } : s
    ));
    setSelectedField(newField);
    setSelectedSectionId(sectionId);
  }, []);

  const handleAddFieldFromPalette = useCallback((type: FieldType) => {
    // Add to last section, or create one
    if (sections.length === 0) {
      const sId = crypto.randomUUID();
      const ft = fieldTypes.find(f => f.type === type);
      const label = ft?.label || 'New Field';
      const newField: FormField = {
        id: crypto.randomUUID(), type, label, fieldName: toFieldName(label), required: false,
        options: ['radio', 'select', 'checkbox', 'multi_select'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
        content: type === 'paragraph' ? 'Enter text here...' : undefined,
        tableColumns: type === 'table' ? [{ id: crypto.randomUUID(), label: 'Column 1', type: 'text' }] : undefined,
      };
      setSections([{ id: sId, title: 'Section 1', sortOrder: 0, isRepeatable: false, fields: [newField] }]);
      setSelectedField(newField);
      setSelectedSectionId(sId);
    } else {
      handleAddField(sections[sections.length - 1].id, type);
    }
  }, [sections, handleAddField]);

  const handleDeleteField = useCallback((sectionId: string, fieldId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, fields: s.fields.filter(f => f.id !== fieldId) } : s
    ));
    if (selectedField?.id === fieldId) setSelectedField(null);
  }, [selectedField]);

  const handleDuplicateField = useCallback((sectionId: string, fieldId: string) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const field = s.fields.find(f => f.id === fieldId);
      if (!field) return s;
      const clone = { ...field, id: crypto.randomUUID(), fieldName: field.fieldName + '_copy' };
      const idx = s.fields.findIndex(f => f.id === fieldId);
      const fields = [...s.fields];
      fields.splice(idx + 1, 0, clone);
      return { ...s, fields };
    }));
  }, []);

  const handleUpdateField = useCallback((id: string, updates: Partial<FormField>) => {
    setSections(prev => prev.map(s => ({
      ...s,
      fields: s.fields.map(f => f.id === id ? { ...f, ...updates } : f),
    })));
    setSelectedField(prev => prev?.id === id ? { ...prev, ...updates } : prev);
  }, []);

  const handleSelectField = useCallback((field: FormField, sectionId: string) => {
    setSelectedField(field);
    setSelectedSectionId(sectionId);
  }, []);

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Please enter a form name.'); return; }
    setIsSaving(true);
    try {
      const sectorName = dbSectors.find(s => s.id === selectedSector)?.name || '';
      const subSectorName = dbSubSectors.find(s => s.id === selectedSubSector)?.name || '';
      const categoryName = selectedCategory ? (dbCategories.find(c => c.id === selectedCategory)?.name || '') : '';
      const serviceName = selectedService ? (dbServices.find(s => s.id === selectedService)?.name || '') : '';

      await saveFormMutation.mutateAsync({
        id: editId || crypto.randomUUID(),
        name: formName.trim(),
        description: formDescription.trim(),
        form_type: formType,
        category: categoryName,
        service: serviceName,
        sector: sectorName,
        sub_sector: subSectorName,
        status: existingForm?.status || 'draft',
        version: existingForm?.version || 1,
        parent_form_id: existingForm?.parent_form_id || null,
        rows: sections,
      });
      toast.success('Form saved successfully!');
      navigate(formType === 'pre_license' ? '/admin/forms/pre-license' : '/admin/forms/post-license');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save form.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!existingForm) return;
    try {
      const newId = await createVersionMutation.mutateAsync(existingForm);
      toast.success(`Version ${existingForm.version + 1} created!`);
      navigate(`/admin/forms/create?type=${formType}&id=${newId}`);
    } catch (error) {
      toast.error('Failed to create new version.');
    }
  };

  const formTypeLabel = formType === 'pre_license' ? 'Pre-License' : formType === 'post_license' ? 'Post-License' : 'Form';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`${formTypeLabel} Form Builder`}
          description={`Design dynamic forms with sections, fields, and conditional logic.`}
          backHref={formType === 'pre_license' ? '/admin/forms/pre-license' : '/admin/forms/post-license'}
          backLabel={`${formTypeLabel} Forms`}
          actions={
            <div className="flex items-center gap-2">
              {editId && existingForm && (
                <Badge variant="secondary" className="gap-1">
                  <GitBranch className="h-3 w-3" /> v{existingForm.version}
                </Badge>
              )}
              {editId && existingForm && (
                <Button variant="outline" size="sm" onClick={handleCreateVersion} disabled={createVersionMutation.isPending}>
                  <GitBranch className="h-4 w-4 mr-1" />
                  New Version
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowPreview(true)}>
                <Eye className="h-4 w-4 mr-2" /> Preview
              </Button>
              {!isViewMode && (
                <Button onClick={handleSave} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" /> {isSaving ? 'Saving...' : 'Save Form'}
                </Button>
              )}
            </div>
          }
        />

        {/* Form Metadata */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Form Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Sector</Label>
                <Select value={selectedSector} onValueChange={handleSectorChange} disabled={isViewMode}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select sector" /></SelectTrigger>
                  <SelectContent>
                    {activeSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedSector && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Sub-Sector</Label>
                  <Select value={selectedSubSector} onValueChange={handleSubSectorChange} disabled={isViewMode}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select sub-sector" /></SelectTrigger>
                    <SelectContent>
                      {filteredSubSectors.map(ss => <SelectItem key={ss.id} value={ss.id}>{ss.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedSubSector && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={isViewMode}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedSubSector && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Service</Label>
                  <Select value={selectedService} onValueChange={setSelectedService} disabled={isViewMode}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select service" /></SelectTrigger>
                    <SelectContent>
                      {filteredServices.map(svc => <SelectItem key={svc.id} value={svc.id}>{svc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Form Name <span className="text-destructive">*</span></Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Enter form name" disabled={isViewMode} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Brief form description" disabled={isViewMode} className="h-9" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Builder: 3-column layout */}
        <div className="grid grid-cols-12 gap-4">
          {/* Field Palette */}
          <div className="col-span-2">
            <FormBuilderFieldPalette onAddField={handleAddFieldFromPalette} />
          </div>

          {/* Sections + Fields Canvas */}
          <div className="col-span-7">
            <SectionManager
              sections={sections}
              selectedFieldId={selectedField?.id || null}
              onSelectField={handleSelectField}
              onSectionsChange={setSections}
              onAddField={handleAddField}
              onDeleteField={handleDeleteField}
              onDuplicateField={handleDuplicateField}
            />
          </div>

          {/* Properties Panel */}
          <div className="col-span-3">
            <FormBuilderFieldProperties
              selectedField={selectedField}
              allFields={allFields}
              onUpdateField={handleUpdateField}
            />
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formName || 'Untitled Form'}</DialogTitle>
            <DialogDescription>
              Preview — {sections.length} sections, {allFields.length} fields
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            {sections.map(section => (
              <div key={section.id} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                  {section.description && <p className="text-xs text-muted-foreground">{section.description}</p>}
                  {section.isRepeatable && <Badge variant="outline" className="text-[10px] mt-1">Repeatable Section</Badge>}
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {section.fields.map(field => (
                    <div key={field.id} className="space-y-1.5">
                      {field.type !== 'paragraph' && (
                        <Label className="text-xs">
                          {field.label}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                      )}
                      {field.type === 'paragraph' ? (
                        <p className="text-sm text-muted-foreground">{field.content}</p>
                      ) : field.type === 'textarea' ? (
                        <Textarea disabled placeholder={field.placeholder} className="text-sm" rows={2} />
                      ) : field.type === 'select' || field.type === 'multi_select' ? (
                        <Select disabled>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={field.placeholder || `Select...`} /></SelectTrigger>
                          <SelectContent>{(field.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input disabled type={field.type === 'number' || field.type === 'decimal' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'} placeholder={field.placeholder} className="h-9 text-sm" />
                      )}
                      {field.helpText && <p className="text-[10px] text-muted-foreground">{field.helpText}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
