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
import { Eye, Save, GitBranch, History } from 'lucide-react';
import { VersionHistory } from '@/components/form-builder/VersionHistory';
import { FileImportDialog, type MultiSheetParseResult } from '@/components/form-builder/FileImport';
import { toast } from 'sonner';
import { useSectors, useSubSectors, useCategories, useServices } from '@/hooks/useMasterConfig';
import { useReturnTypes } from '@/hooks/useReturnsManagement';
import { FormBuilderFieldPalette } from '@/components/form-builder/FieldPalette';
import { SectionManager } from '@/components/form-builder/SectionManager';
import { FormBuilderFieldProperties } from '@/components/form-builder/FieldProperties';
import {
  useFormTemplate, useLatestVersion, useSaveFormTemplate,
  useFormFields, useFieldConditions, fieldRowsToSections,
} from '@/hooks/useFormTemplates';
import { useRegulator } from '@/contexts/RegulatorContext';
import { fieldTypes } from '@/components/form-builder/FieldPalette';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  const { activeRegulatorId } = useRegulator();

  const saveTemplateMutation = useSaveFormTemplate();

  const { data: existingTemplate } = useFormTemplate(editId);
  const { data: latestVersion } = useLatestVersion(editId);
  const { data: versionFieldRows = [], isFetched: fieldsFetched } = useFormFields(latestVersion?.id || null);
  const { data: versionConditionRows = [] } = useFieldConditions(latestVersion?.id || null);

  const { data: dbSectors = [] } = useSectors();
  const { data: dbSubSectors = [] } = useSubSectors();
  const { data: dbCategories = [] } = useCategories();
  const { data: dbServices = [] } = useServices();

  const activeSectors = dbSectors.filter(s => s.status === 'active');

  const [sections, setSections] = useState<FormSection[]>([]);
  const [initialSections, setInitialSections] = useState<FormSection[]>([]);
  const [selectedField, setSelectedField] = useState<FormField | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [tabName, setTabName] = useState('');
  const [formOrder, setFormOrder] = useState(0);
  const [selectedSector, setSelectedSector] = useState('');
  const [selectedSubSector, setSelectedSubSector] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedReturnTypeId, setSelectedReturnTypeId] = useState<string>('');
  const { data: returnTypes = [] } = useReturnTypes();
  const activeReturnTypes = (returnTypes || []).filter((rt: any) => rt.status === 'active');
  const [initialized, setInitialized] = useState(false);

  // Populate state when existing template + version loads
  useEffect(() => {
    if (!existingTemplate || initialized || dbSectors.length === 0) return;
    const loadedSections = latestVersion?.schema_snapshot as unknown as FormSection[];
    const snapshotSections = Array.isArray(loadedSections) ? loadedSections : [];

    // If snapshot is empty, wait for normalized fields and rebuild sections from rows.
    if (snapshotSections.length === 0 && latestVersion?.id && !fieldsFetched) return;

    const parsed = snapshotSections.length > 0
      ? snapshotSections
      : (versionFieldRows.length > 0 ? fieldRowsToSections(versionFieldRows, versionConditionRows) : []);

    setSections(parsed);
    setInitialSections(JSON.parse(JSON.stringify(parsed)));
    setFormName(existingTemplate.name || '');
    setFormDescription(existingTemplate.description || '');
    setTabName((existingTemplate as any).tab_name || '');
    setFormOrder((existingTemplate as any).form_order || 0);
    const sectorId = existingTemplate.sector_id || dbSectors.find(s => s.name === existingTemplate.sector)?.id || '';
    setSelectedSector(sectorId);
    const subSectorId = existingTemplate.sub_sector_id || dbSubSectors.find(s => s.name === existingTemplate.sub_sector)?.id || '';
    setSelectedSubSector(subSectorId);
    const catId = existingTemplate.category_id || dbCategories.find(c => c.name === existingTemplate.category)?.id || '';
    setSelectedCategory(catId);
    const svcId = existingTemplate.service_id || dbServices.find(s => s.name === existingTemplate.service)?.id || '';
    setSelectedService(svcId);
    const resolvedReturnTypeId = (existingTemplate as any).return_type_id || '';
    setSelectedReturnTypeId(resolvedReturnTypeId);
    setInitialized(true);
  }, [
    existingTemplate,
    latestVersion,
    versionFieldRows,
    versionConditionRows,
    fieldsFetched,
    initialized,
    dbSectors,
    dbSubSectors,
    dbCategories,
    dbServices,
  ]);

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

  // Compute display version
  const currentVersionStr = latestVersion
    ? (latestVersion as any).semantic_version || `${latestVersion.version}.0`
    : '1.0';

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Please enter a form name.'); return; }
    setIsSaving(true);
    try {
      const sectorName = dbSectors.find(s => s.id === selectedSector)?.name || '';
      const subSectorName = dbSubSectors.find(s => s.id === selectedSubSector)?.name || '';
      const categoryName = selectedCategory ? (dbCategories.find(c => c.id === selectedCategory)?.name || '') : '';
      const serviceName = selectedService ? (dbServices.find(s => s.id === selectedService)?.name || '') : '';

      const templateId = editId || crypto.randomUUID();
      const versionId = latestVersion?.id || crypto.randomUUID();
      const intVersion = latestVersion?.version || 1;

      // Save never bumps the version. Versioning is handled exclusively at
      // Publish time so submissions stay linked to their original published
      // version and version history stays clean.
      await saveTemplateMutation.mutateAsync({
        template: {
          id: templateId,
          name: formName.trim(),
          description: formDescription.trim() || null,
          form_type: formType,
          category: categoryName,
          service: serviceName,
          sector: sectorName,
          sub_sector: subSectorName,
          sector_id: selectedSector || null,
          sub_sector_id: selectedSubSector || null,
          category_id: selectedCategory || null,
          service_id: selectedService || null,
          sector_name: sectorName || null,
          sub_sector_name: subSectorName || null,
          category_name: categoryName || null,
          service_name: serviceName || null,
          status: existingTemplate?.status || 'draft',
          regulator_id: activeRegulatorId || existingTemplate?.regulator_id || null,
          is_reusable: true,
          created_by: existingTemplate?.created_by || null,
          tab_name: tabName.trim() || null,
          form_order: formOrder,
          return_type_id: formType === 'returns' ? (selectedReturnTypeId || null) : null,
        } as any,
        sections,
        versionId,
        version: intVersion,
        // Intentionally omit changeNotes / semanticVersion: existing values are preserved.
      });

      // Also save to legacy forms table for backward compatibility
      await supabase.from('forms').upsert({
        id: templateId,
        name: formName.trim(),
        description: formDescription.trim(),
        form_type: formType,
        category: categoryName,
        service: serviceName,
        sector: sectorName,
        sub_sector: subSectorName,
        status: existingTemplate?.status || 'draft',
        version: intVersion,
        parent_form_id: null,
        regulator_id: activeRegulatorId || existingTemplate?.regulator_id || null,
        rows: JSON.parse(JSON.stringify(sections)),
      } as any);

      toast.success(`Form saved — Version ${currentVersionStr} (versions only change on Publish)`);
      navigate(`/admin/forms?tab=${formType}`);
    } catch (error: any) {
      console.error('[FormBuilder] save failed:', error);
      const msg = error?.message || error?.error_description || 'Unknown error';
      toast.error(`Failed to save form: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // handleCreateVersion removed: versions are now created automatically on Publish
  // when structural changes are detected. See useUpdateTemplateStatus.

  const handleFileImport = useCallback((imported: FormSection[]) => {
    setSections(prev => {
      const offset = prev.length;
      return [...prev, ...imported.map((s, i) => ({ ...s, sortOrder: offset + i }))];
    });
  }, []);

  const handleMultiSheetImport = useCallback(async (result: MultiSheetParseResult) => {
    try {
      setIsSaving(true);
      const sectorName = dbSectors.find(s => s.id === selectedSector)?.name || '';
      const subSectorName = dbSubSectors.find(s => s.id === selectedSubSector)?.name || '';
      const categoryName = selectedCategory ? (dbCategories.find(c => c.id === selectedCategory)?.name || '') : '';
      const serviceName = selectedService ? (dbServices.find(s => s.id === selectedService)?.name || '') : '';

      // 1. Create return template
      const returnTemplateId = crypto.randomUUID();
      const { error: rtErr } = await supabase.from('return_templates' as any).insert({
        id: returnTemplateId,
        name: result.fileName,
        description: `Imported from ${result.fileName} with ${result.sheets.length} sheets`,
        source_file_name: result.fileName,
        sheet_count: result.sheets.length,
        regulator_id: activeRegulatorId || null,
      });
      if (rtErr) throw rtErr;

      // 2. Create a form template + version for each sheet
      const sheetToTemplateId = new Map<string, string>();

      for (let sheetIdx = 0; sheetIdx < result.sheets.length; sheetIdx++) {
        const sheet = result.sheets[sheetIdx];
        const templateId = crypto.randomUUID();
        const versionId = crypto.randomUUID();
        sheetToTemplateId.set(sheet.sheetName, templateId);

        // Derive tab_name from sheet name (use letter prefix if present, otherwise sheet name)
        const tabMatch = sheet.sheetName.match(/^([A-Z])\d/i);
        const tabName = tabMatch ? tabMatch[1].toUpperCase() : sheet.sheetName;

        // Save template with return_template_id, sheet_name, tab_name, and form_order
        const { error: tErr } = await supabase.from('form_templates').upsert({
          id: templateId,
          name: sheet.formName,
          description: `Sheet "${sheet.sheetName}" from ${result.fileName}`,
          form_type: formType,
          category: categoryName,
          service: serviceName,
          sector: sectorName,
          sub_sector: subSectorName,
          sector_id: selectedSector || null,
          sub_sector_id: selectedSubSector || null,
          category_id: selectedCategory || null,
          service_id: selectedService || null,
          status: 'draft',
          regulator_id: activeRegulatorId || null,
          is_reusable: true,
          return_template_id: returnTemplateId,
          sheet_name: sheet.sheetName,
          tab_name: tabName,
          form_order: sheetIdx,
        } as any);
        if (tErr) throw tErr;

        // Save version with schema snapshot
        const { error: vErr } = await supabase.from('form_versions').upsert({
          id: versionId,
          template_id: templateId,
          version: 1,
          schema_snapshot: JSON.parse(JSON.stringify(sheet.sections)),
          status: 'draft',
          change_notes: `Auto-imported from Excel sheet "${sheet.sheetName}"`,
        } as any);
        if (vErr) throw vErr;

        // Save to legacy forms table
        await supabase.from('forms').upsert({
          id: templateId,
          name: sheet.formName,
          description: `Sheet "${sheet.sheetName}" from ${result.fileName}`,
          form_type: formType,
          category: categoryName,
          service: serviceName,
          sector: sectorName,
          sub_sector: subSectorName,
          status: 'draft',
          version: 1,
          parent_form_id: null,
          regulator_id: activeRegulatorId || null,
          rows: JSON.parse(JSON.stringify(sheet.sections)),
        } as any);
      }

      // 3. Save cross-sheet dependencies
      const deps = result.allCrossSheetRefs.filter(
        r => sheetToTemplateId.has(r.sourceSheet) && sheetToTemplateId.has(r.targetSheet)
      );
      if (deps.length > 0) {
        const depRows = deps.map(d => ({
          id: crypto.randomUUID(),
          source_form_id: sheetToTemplateId.get(d.sourceSheet)!,
          source_field_id: d.sourceField,
          dependent_form_id: sheetToTemplateId.get(d.targetSheet)!,
          dependent_field_id: d.targetField,
          formula_reference: d.formula,
        }));
        await supabase.from('form_field_dependencies' as any).insert(depRows);
      }

      toast.success(`Created ${result.sheets.length} forms under "${result.fileName}" template!`);
      navigate(`/admin/forms?tab=${formType}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to create forms from Excel import.');
    } finally {
      setIsSaving(false);
    }
  }, [formType, activeRegulatorId, selectedSector, selectedSubSector, selectedCategory, selectedService, dbSectors, dbSubSectors, dbCategories, dbServices, navigate]);

  const formTypeLabel = formType === 'pre_license' ? 'Pre-License' : formType === 'post_license' ? 'Post-License' : formType === 'returns' ? 'Returns' : 'Form';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`${formTypeLabel} Form Builder`}
          description={`Design dynamic forms with sections, fields, and conditional logic.`}
          backHref={`/admin/forms?tab=${formType}`}
          backLabel="Form Management"
          actions={
            <div className="flex items-center gap-2">
              {editId && latestVersion && (
                <Badge variant="secondary" className="gap-1">
                  <GitBranch className="h-3 w-3" /> v{currentVersionStr}
                </Badge>
              )}
              {/* "New Version" button removed — versions are managed automatically on Publish.
                  Structural changes auto-create a new version; cosmetic changes keep the same version. */}
              {editId && (
                <VersionHistory templateId={editId} formName={formName || 'Untitled Form'} />
              )}
              <FileImportDialog
                onImport={handleFileImport}
                onMultiSheetImport={handleMultiSheetImport}
                autoOpen={searchParams.get('import') === 'excel'}
                buttonLabel={formType === 'returns' ? 'Import from Excel' : 'Import File'}
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (latestVersion?.id) {
                    window.open(`/preview/${latestVersion.id}`, '_blank', 'noopener');
                  } else {
                    toast.info('Save the form first to preview it in a new tab.');
                    setShowPreview(true);
                  }
                }}
                title={latestVersion?.id ? 'Open preview in new tab' : 'Save first to enable new-tab preview'}
              >
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
              {(formType === 'post_license' || formType === 'returns') && (
                <>
                  {formType === 'returns' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Return Type <span className="text-destructive">*</span></Label>
                      <Select
                        key={`${editId || 'new'}-${selectedReturnTypeId || 'none'}`}
                        value={selectedReturnTypeId || 'none'}
                        onValueChange={(value) => setSelectedReturnTypeId(value === 'none' ? '' : value)}
                        disabled={isViewMode}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select return type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {activeReturnTypes.map((rt: any) => (
                            <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Pulled from the Return Types master configuration</p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tab Name</Label>
                    <Input value={tabName} onChange={e => setTabName(e.target.value)} placeholder="e.g. B1, B2, Q14" disabled={isViewMode} className="h-9" />
                    <p className="text-[10px] text-muted-foreground">Used to group forms into tabs on the licensee side</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Form Order</Label>
                    <Input type="number" value={formOrder} onChange={e => setFormOrder(parseInt(e.target.value) || 0)} placeholder="0" disabled={isViewMode} className="h-9" />
                    <p className="text-[10px] text-muted-foreground">Controls display order within its tab</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Read-only banner in View mode */}
        {isViewMode && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800">
            View-only mode — editing, saving, and structural changes are disabled. Use History to compare or export versions.
          </div>
        )}

        {/* Builder: 3-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" style={{ minHeight: 'calc(100vh - 400px)' }}>
          {/* Left: Field Palette — hidden in view mode */}
          {!isViewMode && (
            <div className="lg:col-span-2">
              <ScrollArea className="h-[calc(100vh-400px)]">
                <FormBuilderFieldPalette onAddField={handleAddFieldFromPalette} />
              </ScrollArea>
            </div>
          )}

          {/* Center: Section Manager (wider in view mode since palette/props are hidden) */}
          <div className={isViewMode ? 'lg:col-span-12' : 'lg:col-span-7'}>
            <ScrollArea className="h-[calc(100vh-400px)]">
              <div
                className={isViewMode ? 'pointer-events-none opacity-90 select-none' : ''}
                aria-disabled={isViewMode}
              >
                <SectionManager
                  sections={sections}
                  selectedFieldId={selectedField?.id || null}
                  onSelectField={isViewMode ? () => {} : handleSelectField}
                  onSectionsChange={isViewMode ? () => {} : setSections}
                  onAddField={isViewMode ? () => {} : handleAddField}
                  onDeleteField={isViewMode ? () => {} : handleDeleteField}
                  onDuplicateField={isViewMode ? () => {} : handleDuplicateField}
                />
              </div>
            </ScrollArea>
          </div>

          {/* Right: Field Properties — hidden in view mode */}
          {!isViewMode && (
            <div className="lg:col-span-3">
              <ScrollArea className="h-[calc(100vh-400px)]">
                <FormBuilderFieldProperties
                  selectedField={selectedField}
                  allFields={allFields}
                  onUpdateField={handleUpdateField}
                  onDeleteField={selectedField && selectedSectionId ? () => {
                    handleDeleteField(selectedSectionId, selectedField.id);
                    setSelectedField(null);
                    setSelectedSectionId(null);
                  } : undefined}
                />
              </ScrollArea>
            </div>
          )}
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
                      ) : (
                        <Input disabled placeholder={field.placeholder || field.label} className="text-sm" />
                      )}
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
