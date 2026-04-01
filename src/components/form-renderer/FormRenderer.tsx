import { useState, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft, ArrowRight, Save, CheckCircle2, Plus, Trash2,
  FileText, Eye, Upload, Loader2, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { FormSection, FormField, ConditionalRule } from '@/types/formBuilder';
import { evaluateFormula } from '@/lib/safeEval';
import { uploadFormFile, deleteFormFile, refreshFormFileUrl, type FormFileData } from '@/lib/formFileUpload';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  formName: string;
  sections: FormSection[];
  initialData?: Record<string, any>;
  onSaveDraft: (data: Record<string, any>) => void;
  onSubmit: (data: Record<string, any>) => void;
  saving?: boolean;
  readOnly?: boolean;
  applicationId?: string;
}

function evaluateCondition(rule: ConditionalRule, formData: Record<string, any>, allFields: FormField[]): boolean {
  const watchedField = allFields.find(f => f.id === rule.fieldId);
  if (!watchedField) return false;
  const value = formData[watchedField.fieldName] ?? '';
  const strVal = String(value);

  switch (rule.operator) {
    case 'equals': return strVal === rule.value;
    case 'not_equals': return strVal !== rule.value;
    case 'contains': return strVal.includes(rule.value || '');
    case 'not_contains': return !strVal.includes(rule.value || '');
    case 'is_empty': return !strVal;
    case 'is_not_empty': return !!strVal;
    case 'greater_than': return Number(strVal) > Number(rule.value || 0);
    case 'less_than': return Number(strVal) < Number(rule.value || 0);
    default: return false;
  }
}

function isFieldVisible(field: FormField, formData: Record<string, any>, allFields: FormField[]): boolean {
  if (!field.conditionalLogic?.length) return true;
  for (const rule of field.conditionalLogic) {
    const result = evaluateCondition(rule, formData, allFields);
    if (rule.action === 'show' && !result) return false;
    if (rule.action === 'hide' && result) return false;
  }
  return true;
}

function isFieldRequired(field: FormField, formData: Record<string, any>, allFields: FormField[]): boolean {
  let required = field.required;
  if (field.conditionalLogic) {
    for (const rule of field.conditionalLogic) {
      const result = evaluateCondition(rule, formData, allFields);
      if (rule.action === 'require' && result) required = true;
      if (rule.action === 'unrequire' && result) required = false;
    }
  }
  return required;
}

export function FormRenderer({
  formName, sections, initialData, onSaveDraft, onSubmit, saving, readOnly, applicationId,
}: Props) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>(initialData || {});
  const [repeatableData, setRepeatableData] = useState<Record<string, Record<string, any>[]>>(
    initialData?.__repeatable || {}
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string; type: string } | null>(null);
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const allFields = useMemo(() => sections.flatMap(s => s.fields), [sections]);
  const visibleSections = useMemo(() =>
    sections.filter(s => {
      if (!s.conditionalLogic?.length) return true;
      for (const rule of s.conditionalLogic) {
        const result = evaluateCondition(rule, formData, allFields);
        if (rule.action === 'show' && !result) return false;
        if (rule.action === 'hide' && result) return false;
      }
      return true;
    }),
    [sections, formData, allFields]
  );

  const currentSection = visibleSections[currentStep];
  const totalSteps = visibleSections.length;
  const progress = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;
  const showTabs = totalSteps > 1;

  // Check if a section has any data filled in
  const isSectionCompleted = useCallback((section: FormSection): boolean => {
    return section.fields.some(f => {
      const val = formData[f.fieldName];
      return val !== undefined && val !== null && val !== '';
    });
  }, [formData]);

  const updateField = useCallback((fieldName: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[fieldName]; return n; });
  }, []);

  // Merge repeatable data into the main payload for save/submit
  const getMergedData = useCallback((): Record<string, any> => {
    const merged = { ...formData };
    // Store repeatable data under a special key
    if (Object.keys(repeatableData).length > 0) {
      merged.__repeatable = repeatableData;
    }
    // Also flatten repeatable data into named fields for backward compatibility
    for (const [sectionId, entries] of Object.entries(repeatableData)) {
      if (entries.length > 0) {
        merged[`_repeatable_${sectionId}`] = entries;
      }
    }
    return merged;
  }, [formData, repeatableData]);

  const validateCurrentStep = (): boolean => {
    if (!currentSection) return true;
    const stepErrors: Record<string, string> = {};
    const fieldsToCheck = currentSection.fields.filter(f => isFieldVisible(f, formData, allFields));

    for (const field of fieldsToCheck) {
      const val = formData[field.fieldName];
      const required = isFieldRequired(field, formData, allFields);

      if (required && (val === undefined || val === null || val === '')) {
        stepErrors[field.fieldName] = `${field.label} is required`;
        continue;
      }
      if (val && field.validation) {
        const v = field.validation;
        const strVal = String(val);
        if (v.minLength && strVal.length < v.minLength) stepErrors[field.fieldName] = `Minimum ${v.minLength} characters`;
        if (v.maxLength && strVal.length > v.maxLength) stepErrors[field.fieldName] = `Maximum ${v.maxLength} characters`;
        if (v.min !== undefined && Number(val) < v.min) stepErrors[field.fieldName] = `Minimum value is ${v.min}`;
        if (v.max !== undefined && Number(val) > v.max) stepErrors[field.fieldName] = `Maximum value is ${v.max}`;
      }
      if (field.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
        stepErrors[field.fieldName] = 'Invalid email address';
      }
      if (field.type === 'phone' && val && !/^[+]?[\d\s\-()]{7,20}$/.test(String(val))) {
        stepErrors[field.fieldName] = 'Invalid phone number';
      }
      // Validate numeric fields store actual numbers
      if ((field.type === 'number' || field.type === 'decimal') && val !== undefined && val !== '' && val !== null) {
        const numVal = Number(val);
        if (isNaN(numVal)) {
          stepErrors[field.fieldName] = 'Must be a valid number';
        }
      }
    }
    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  };

  const handleNext = () => {
    if (validateCurrentStep() && currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  const handleSaveDraft = () => onSaveDraft(getMergedData());

  const handleSubmit = () => {
    if (validateCurrentStep()) onSubmit(getMergedData());
  };

  // Handle file upload to storage
  const handleFileUpload = async (fieldName: string, file: File) => {
    if (!user) { toast.error('You must be logged in to upload files'); return; }
    setUploadingFields(prev => ({ ...prev, [fieldName]: true }));
    const result = await uploadFormFile(file, user.id, applicationId);
    setUploadingFields(prev => ({ ...prev, [fieldName]: false }));
    if (result.success && result.data) {
      updateField(fieldName, result.data);
      toast.success(`${file.name} uploaded`);
    } else {
      toast.error(result.error || 'Upload failed');
    }
  };

  // Handle file removal
  const handleFileRemove = async (fieldName: string) => {
    const fileData = formData[fieldName] as FormFileData | undefined;
    if (fileData?.filePath) {
      await deleteFormFile(fileData.filePath, fileData.uploadId);
    }
    updateField(fieldName, '');
  };

  // Handle file preview with fresh signed URL
  const handleFilePreview = async (fileData: FormFileData) => {
    if (fileData.filePath) {
      const freshUrl = await refreshFormFileUrl(fileData.filePath);
      setPreviewFile({ name: fileData.name, url: freshUrl, type: fileData.type });
    } else if (fileData.url) {
      setPreviewFile({ name: fileData.name, url: fileData.url, type: fileData.type });
    }
  };

  // Repeatable section helpers
  const addRepeatableEntry = (sectionId: string) => {
    setRepeatableData(prev => ({
      ...prev,
      [sectionId]: [...(prev[sectionId] || [{}]), {}],
    }));
  };

  const removeRepeatableEntry = (sectionId: string, idx: number) => {
    setRepeatableData(prev => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).filter((_, i) => i !== idx),
    }));
  };

  const updateRepeatableField = (sectionId: string, entryIdx: number, fieldName: string, value: any) => {
    setRepeatableData(prev => {
      const entries = [...(prev[sectionId] || [])];
      entries[entryIdx] = { ...entries[entryIdx], [fieldName]: value };
      return { ...prev, [sectionId]: entries };
    });
  };

  const renderField = (field: FormField, data: Record<string, any>, onChange: (fieldName: string, val: any) => void) => {
    if (!isFieldVisible(field, data, allFields)) return null;
    const val = data[field.fieldName] ?? field.defaultValue ?? '';
    const required = isFieldRequired(field, data, allFields);
    const error = errors[field.fieldName];
    const isUploading = uploadingFields[field.fieldName];

    const fieldLabel = field.type !== 'paragraph' && field.type !== 'checkbox' ? (
      <Label className="text-sm">
        {field.label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
    ) : null;

    let input: React.ReactNode;

    switch (field.type) {
      case 'text':
      case 'email':
        input = <Input type={field.type === 'email' ? 'email' : 'text'} value={val} onChange={e => onChange(field.fieldName, e.target.value)} placeholder={field.placeholder} disabled={readOnly} />;
        break;
      case 'phone':
        input = <Input type="tel" value={val} onChange={e => onChange(field.fieldName, e.target.value)} placeholder={field.placeholder || '+1 (555) 123-4567'} disabled={readOnly} />;
        break;
      case 'number':
      case 'decimal':
        input = (
          <Input
            type="number"
            step={field.type === 'decimal' ? '0.01' : '1'}
            value={val}
            onChange={e => {
              const raw = e.target.value;
              // Store as number when valid, empty string when blank
              if (raw === '' || raw === '-') {
                onChange(field.fieldName, raw);
              } else {
                const num = field.type === 'decimal' ? parseFloat(raw) : parseInt(raw, 10);
                onChange(field.fieldName, isNaN(num) ? raw : num);
              }
            }}
            placeholder={field.placeholder}
            disabled={readOnly}
          />
        );
        break;
      case 'date':
        input = <Input type="date" value={val} onChange={e => onChange(field.fieldName, e.target.value)} disabled={readOnly} />;
        break;
      case 'textarea':
        input = <Textarea value={val} onChange={e => onChange(field.fieldName, e.target.value)} placeholder={field.placeholder} rows={3} disabled={readOnly} />;
        break;
      case 'select':
        input = (
          <Select value={val} onValueChange={v => onChange(field.fieldName, v)} disabled={readOnly}>
            <SelectTrigger><SelectValue placeholder={field.placeholder || 'Select...'} /></SelectTrigger>
            <SelectContent>{(field.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        );
        break;
      case 'multi_select':
        input = (
          <div className="space-y-1">
            {(field.options || []).map(opt => {
              const selected = Array.isArray(val) ? val : [];
              return (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(opt)}
                    onCheckedChange={checked => {
                      const next = checked ? [...selected, opt] : selected.filter((v: string) => v !== opt);
                      onChange(field.fieldName, next);
                    }}
                    disabled={readOnly}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        );
        break;
      case 'checkbox':
        input = (
          <div className="flex items-center gap-2">
            <Checkbox checked={val === true || val === 'true'} onCheckedChange={v => onChange(field.fieldName, v)} disabled={readOnly} />
            <Label className="text-sm">{field.label}{required && <span className="text-destructive ml-1">*</span>}</Label>
          </div>
        );
        break;
      case 'radio':
        input = (
          <div className="space-y-1.5">
            {(field.options || []).map(opt => (
              <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name={field.fieldName} value={opt} checked={val === opt} onChange={() => onChange(field.fieldName, opt)} disabled={readOnly} className="accent-primary" />
                {opt}
              </label>
            ))}
          </div>
        );
        break;
      case 'file':
        input = (
          <div className="space-y-2">
            {!readOnly && (
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  ref={el => { fileInputRefs.current[field.fieldName] = el; }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(field.fieldName, file);
                    }
                    // Reset input so same file can be re-selected
                    if (e.target) e.target.value = '';
                  }}
                  className="flex-1"
                  disabled={isUploading}
                />
                {isUploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            )}
            {val && typeof val === 'object' && val.name && (
              <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm truncate flex-1">{val.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {val.size ? `${(val.size / 1024).toFixed(1)} KB` : ''}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleFilePreview(val)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                {!readOnly && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleFileRemove(field.fieldName)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        );
        break;
      case 'paragraph':
        input = <p className="text-sm text-muted-foreground whitespace-pre-wrap">{field.content}</p>;
        break;
      case 'table':
        const tableData = Array.isArray(val) ? val : [{}];
        input = (
          <div className="space-y-2 overflow-x-auto">
            <table className="w-full text-sm border">
              <thead>
                <tr className="bg-muted">
                  {(field.tableColumns || []).map(col => (
                    <th key={col.id} className="p-2 text-left text-xs font-medium border-b">{col.label}</th>
                  ))}
                  {!readOnly && <th className="w-10 border-b" />}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row: Record<string, any>, rowIdx: number) => (
                  <tr key={rowIdx} className="border-b">
                    {(field.tableColumns || []).map(col => (
                      <td key={col.id} className="p-1">
                        <Input
                          type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                          value={row[col.id] || ''}
                          onChange={e => {
                            const newData = [...tableData];
                            newData[rowIdx] = { ...newData[rowIdx], [col.id]: e.target.value };
                            onChange(field.fieldName, newData);
                          }}
                          disabled={readOnly}
                          className="h-8 text-xs"
                        />
                      </td>
                    ))}
                    {!readOnly && (
                      <td className="p-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                          const newData = tableData.filter((_: any, i: number) => i !== rowIdx);
                          onChange(field.fieldName, newData.length ? newData : [{}]);
                        }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!readOnly && (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => onChange(field.fieldName, [...tableData, {}])}>
                <Plus className="h-3 w-3 mr-1" /> Add Row
              </Button>
            )}
          </div>
        );
        break;
      case 'calculated':
        const result = field.calculatedExpression
          ? evaluateFormula(field.calculatedExpression, data)
          : '0';
        input = <Input value={result} disabled className="bg-muted" />;
        break;
      default:
        input = <Input value={val} onChange={e => onChange(field.fieldName, e.target.value)} disabled={readOnly} />;
    }

    return (
      <div key={field.id} className="space-y-1.5">
        {fieldLabel}
        {input}
        {field.helpText && <p className="text-[10px] text-muted-foreground">{field.helpText}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  if (!currentSection) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">This form has no sections configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formName}</span>
          <span>Step {currentStep + 1} of {totalSteps}</span>
        </div>
        <Progress value={progress} className="h-2" />
        {/* Step indicators */}
        <div className="flex gap-1">
          {visibleSections.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i <= currentStep ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Section Content */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{currentSection.title}</CardTitle>
              {currentSection.description && (
                <p className="text-sm text-muted-foreground mt-1">{currentSection.description}</p>
              )}
            </div>
            {currentSection.isRepeatable && (
              <Badge variant="outline" className="text-xs">Repeatable</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!currentSection.isRepeatable ? (
            <div className="grid md:grid-cols-2 gap-4">
              {currentSection.fields.map(field => renderField(field, formData, updateField))}
            </div>
          ) : (
            <div className="space-y-4">
              {(repeatableData[currentSection.id] || [{}]).map((entry, entryIdx) => (
                <Card key={entryIdx} className="border-dashed">
                  <CardHeader className="py-2 px-4 flex-row items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Entry {entryIdx + 1}</span>
                    {entryIdx > 0 && !readOnly && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeRepeatableEntry(currentSection.id, entryIdx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {currentSection.fields.map(field =>
                        renderField(field, entry, (fn, v) => updateRepeatableField(currentSection.id, entryIdx, fn, v))
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={() => addRepeatableEntry(currentSection.id)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Another Entry
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handlePrev} disabled={currentStep === 0}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Previous
        </Button>
        <div className="flex gap-2">
          {!readOnly && (
            <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Draft'}
            </Button>
          )}
          {currentStep < totalSteps - 1 ? (
            <Button onClick={handleNext}>
              Next <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            !readOnly && (
              <Button onClick={handleSubmit} disabled={saving}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Submit
              </Button>
            )
          )}
        </div>
      </div>

      {/* File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="truncate">{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto">
            {previewFile?.type?.startsWith('image/') ? (
              <img src={previewFile.url} alt={previewFile.name} className="w-full rounded-lg object-contain max-h-[65vh]" />
            ) : previewFile?.type === 'application/pdf' ? (
              <iframe src={previewFile.url} className="w-full h-[65vh] rounded-lg border" title={previewFile.name} />
            ) : (
              <p className="text-center py-8 text-muted-foreground">Preview not available for this file type</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
