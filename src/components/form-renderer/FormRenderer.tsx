import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
import type { FormSection, FormField, FormRow, ConditionalRule } from '@/types/formBuilder';
import { migrateSectionsToRows } from '@/lib/formRows';
import { evaluateFormula } from '@/lib/safeEval';
import { uploadFormFile, deleteFormFile, refreshFormFileUrl, type FormFileData } from '@/lib/formFileUpload';
import { uploadVersionedDocument } from '@/lib/documentVersioning';
import { DocumentVersionHistoryDialog } from '@/components/documents/versioned/DocumentVersionHistoryDialog';
import { History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useActiveMasterItems } from '@/hooks/useMasterData';
import { isDisplayOnlyFieldType, resolveDisplayOnlyFieldText } from '@/lib/registrationDisplayTypes';
import { useExternalPortalAccess } from '@/hooks/useExternalPortalAccess';
import { useIsInternal } from '@/hooks/useUserPermissions';
import type { PortalArea, PortalCapability } from '@/lib/portalAccess';

const SUBMIT_CAPABILITY_BY_AREA: Record<PortalArea, PortalCapability> = {
  licensing: 'can_submit',
  returns: 'can_submit_returns',
  complaints: 'can_submit_complaints',
  fp_declarations: 'can_submit_fp_declarations',
};

// Returns Tailwind col-span class for a field's row width.
// Default: full-width for content blocks (paragraph/heading/table/calculated), half-width otherwise.
function getFieldSpanClass(field: FormField): string {
  const fallback: 1 | 2 | 3 | 4 =
    ['paragraph', 'heading', 'table', 'calculated'].includes(field.type) ? 4 : 2;
  const span = field.colSpan ?? fallback;
  switch (span) {
    case 1: return 'md:col-span-1';
    case 2: return 'md:col-span-2';
    case 3: return 'md:col-span-3';
    case 4:
    default: return 'md:col-span-4';
  }
}

interface Props {
  formName: string;
  sections: FormSection[];
  initialData?: Record<string, any>;
  onSaveDraft: (data: Record<string, any>) => void;
  onSubmit: (data: Record<string, any>) => void;
  /** Optional: fires on every field change with merged data (used for live state sync to parent). */
  onChange?: (data: Record<string, any>) => void;
  saving?: boolean;
  readOnly?: boolean;
  applicationId?: string;
  stepStorageKey?: string;
  /** When true, section tabs show full title instead of letter-prefixed labels */
  showFullTabTitles?: boolean;
  /** Form Management context for versioned document uploads. */
  formId?: string;
  formVersionId?: string | null;
  submissionId?: string | null;
  entityType?: string;
  entityId?: string | null;
  /** External portal area for capability gating (Submit/Upload). Internal users bypass. */
  portalArea?: PortalArea;
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
  if (isDisplayOnlyFieldType(field.type)) return false;
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
// Component for fields that load options from master data
function MasterDataField({ field, value, onChange, disabled, placeholder, allFormData }: {
  field: FormField;
  value: any;
  onChange: (fieldName: string, val: any) => void;
  disabled?: boolean;
  placeholder?: string;
  allFormData: Record<string, any>;
}) {
  const parentValue = field.masterDataParentField ? allFormData[field.masterDataParentField] : undefined;
  const { data: items = [] } = useActiveMasterItems(
    field.masterDataTypeCode || '',
    field.masterDataParentField ? (parentValue || null) : undefined
  );

  const options = items.map(i => ({ value: i.id, label: i.name }));
  const isDisabled = disabled || (field.masterDataParentField && !parentValue);

  if (field.type === 'select') {
    return (
      <Select value={value} onValueChange={v => onChange(field.fieldName, v)} disabled={!!isDisabled}>
        <SelectTrigger><SelectValue placeholder={placeholder || 'Select...'} /></SelectTrigger>
        <SelectContent>
          {options.length === 0 && <SelectItem value="__empty" disabled>No options available</SelectItem>}
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'multi_select') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1">
        {options.length === 0 && <p className="text-xs text-muted-foreground">No options available</p>}
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={checked => {
                const next = checked ? [...selected, opt.value] : selected.filter((v: string) => v !== opt.value);
                onChange(field.fieldName, next);
              }}
              disabled={!!isDisabled}
            />
            {opt.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === 'radio') {
    return (
      <div className="space-y-1.5">
        {options.length === 0 && <p className="text-xs text-muted-foreground">No options available</p>}
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name={field.fieldName} value={opt.value} checked={value === opt.value} onChange={() => onChange(field.fieldName, opt.value)} disabled={!!isDisabled} className="accent-primary" />
            {opt.label}
          </label>
        ))}
      </div>
    );
  }

  return null;
}

function RowsGrid({ rows, renderField }: { rows: FormRow[]; renderField: (field: FormField) => React.ReactNode }) {
  if (!rows.length) return null;
  const colsClass: Record<1 | 2 | 3 | 4, string> = {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  };
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.id} className={`grid gap-4 grid-cols-1 ${colsClass[row.columns] || 'md:grid-cols-1'}`}>
          {Array.from({ length: row.columns }).map((_, i) => {
            const field = row.fields[i] || null;
            return (
              <div key={field ? field.id : `empty-${row.id}-${i}`} className="min-w-0">
                {field ? renderField(field) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function FormRenderer({
  formName, sections: rawSections, initialData, onSaveDraft, onSubmit, onChange, saving, readOnly, applicationId, stepStorageKey, showFullTabTitles,
  formId, formVersionId, submissionId, entityType, entityId, portalArea,
}: Props) {
  const { user } = useAuth();
  const { can } = useExternalPortalAccess();
  const isInternal = useIsInternal();
  const submitCap = portalArea ? SUBMIT_CAPABILITY_BY_AREA[portalArea] : null;
  const capSubmitAllowed = !portalArea || isInternal || can(portalArea, submitCap!, entityId ?? null);
  const capUploadAllowed = !portalArea || isInternal || can(portalArea, 'can_upload_documents', entityId ?? null);
  const [historyGroup, setHistoryGroup] = useState<{ groupId: string; name: string } | null>(null);
  const [currentStep, setCurrentStep] = useState(() => {
    if (!stepStorageKey) return 0;
    try {
      const raw = sessionStorage.getItem(stepStorageKey);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as { currentStep?: number; activeFormIdx?: number; activeGroup?: string };
      return Number.isFinite(parsed.currentStep) && (parsed.currentStep ?? 0) >= 0 ? parsed.currentStep! : 0;
    } catch {
      return 0;
    }
  });
  const [formData, setFormData] = useState<Record<string, any>>(initialData || {});
  const [repeatableData, setRepeatableData] = useState<Record<string, Record<string, any>[]>>(
    initialData?.__repeatable || {}
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string; type: string } | null>(null);
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Normalize incoming sections so every section has a `rows` layout.
  const sections = useMemo(() => migrateSectionsToRows(rawSections), [rawSections]);
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

  // Detect grouped sections (e.g. "A1-...", "B3-...", etc.)
  const sectionGroups = useMemo(() => {
    const groups = new Map<string, typeof visibleSections>();
    let hasGroups = false;
    for (const s of visibleSections) {
      const match = s.title.match(/^([A-Z])\d+-/i);
      if (match) {
        hasGroups = true;
        const letter = match[1].toUpperCase();
        if (!groups.has(letter)) groups.set(letter, []);
        groups.get(letter)!.push(s);
      }
    }
    if (!hasGroups) return null;
    return groups;
  }, [visibleSections]);

  const groupKeys = useMemo(() => sectionGroups ? Array.from(sectionGroups.keys()).sort() : [], [sectionGroups]);
  const [activeGroup, setActiveGroup] = useState(() => {
    if (!stepStorageKey) return groupKeys[0] || '';
    try {
      const raw = sessionStorage.getItem(stepStorageKey);
      if (!raw) return groupKeys[0] || '';
      const parsed = JSON.parse(raw) as { activeGroup?: string };
      return parsed.activeGroup || groupKeys[0] || '';
    } catch {
      return groupKeys[0] || '';
    }
  });
  const [activeFormIdx, setActiveFormIdx] = useState(() => {
    if (!stepStorageKey) return 0;
    try {
      const raw = sessionStorage.getItem(stepStorageKey);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as { activeFormIdx?: number };
      return Number.isFinite(parsed.activeFormIdx) && (parsed.activeFormIdx ?? 0) >= 0 ? parsed.activeFormIdx! : 0;
    } catch {
      return 0;
    }
  });

  // Keep activeGroup valid if groupKeys change
  useEffect(() => {
    if (groupKeys.length > 0 && !groupKeys.includes(activeGroup)) {
      setActiveGroup(groupKeys[0]);
      setActiveFormIdx(0);
    }
  }, [groupKeys, activeGroup]);

  useEffect(() => {
    if (!stepStorageKey) return;
    try {
      sessionStorage.setItem(stepStorageKey, JSON.stringify({
        currentStep,
        activeGroup,
        activeFormIdx,
      }));
    } catch {
      // noop
    }
  }, [stepStorageKey, currentStep, activeGroup, activeFormIdx]);

  const activeGroupForms = sectionGroups?.get(activeGroup) || [];
  const currentSection = sectionGroups
    ? activeGroupForms[activeFormIdx] || activeGroupForms[0]
    : visibleSections[currentStep];

  const totalSteps = sectionGroups ? activeGroupForms.length : visibleSections.length;
  const currentStepIdx = sectionGroups ? activeFormIdx : currentStep;
  const progress = totalSteps > 0 ? ((currentStepIdx + 1) / totalSteps) * 100 : 0;
  const showTabs = !sectionGroups && visibleSections.length > 1;

  // Check if a section has any data filled in
  const isSectionCompleted = useCallback((section: FormSection): boolean => {
    return section.fields.some(f => {
      if (isDisplayOnlyFieldType(f.type)) return false;
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

  // Bubble live changes up to parent (used by Returns to keep allData in sync for Save/Next)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!onChangeRef.current) return;
    if (!didMountRef.current) { didMountRef.current = true; return; }
    onChangeRef.current(getMergedData());
  }, [formData, repeatableData, getMergedData]);

  const validateCurrentStep = (): { ok: boolean; entries: Array<{ fieldName: string; label: string; message: string }> } => {
    if (!currentSection) return { ok: true, entries: [] };
    const stepErrors: Record<string, string> = {};
    const entries: Array<{ fieldName: string; label: string; message: string }> = [];
    const pushErr = (field: FormField, message: string) => {
      if (stepErrors[field.fieldName]) return;
      stepErrors[field.fieldName] = message;
      entries.push({ fieldName: field.fieldName, label: field.label || field.fieldName, message });
    };
    const fieldsToCheck = currentSection.fields.filter(f => isFieldVisible(f, formData, allFields));

    for (const field of fieldsToCheck) {
      const val = formData[field.fieldName];
      const required = isFieldRequired(field, formData, allFields);

      if (required && (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0))) {
        pushErr(field, `${field.label} is required`);
        continue;
      }
      if (val && field.validation) {
        const v = field.validation;
        const strVal = String(val);
        if (v.minLength && strVal.length < v.minLength) pushErr(field, `Minimum ${v.minLength} characters`);
        if (v.maxLength && strVal.length > v.maxLength) pushErr(field, `Maximum ${v.maxLength} characters`);
        if (v.min !== undefined && Number(val) < v.min) pushErr(field, `Minimum value is ${v.min}`);
        if (v.max !== undefined && Number(val) > v.max) pushErr(field, `Maximum value is ${v.max}`);
        if (v.pattern && ['text', 'textarea'].includes(field.type)) {
          try {
            const re = new RegExp(v.pattern);
            if (!re.test(strVal)) pushErr(field, v.patternMessage || 'Invalid format');
          } catch {
            // ignore malformed regex (admin-configured)
          }
        }
      }
      if (field.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
        pushErr(field, 'Invalid email address');
      }
      if (field.type === 'phone' && val && !/^[+]?[\d\s\-()]{7,20}$/.test(String(val))) {
        pushErr(field, 'Invalid phone number');
      }
      if ((field.type === 'number' || field.type === 'decimal') && val !== undefined && val !== '' && val !== null) {
        const numVal = Number(val);
        if (isNaN(numVal)) {
          pushErr(field, 'Must be a valid number');
        }
      }
      // Table per-column validation
      if (field.type === 'table' && Array.isArray(val) && field.tableColumns) {
        for (let r = 0; r < val.length; r++) {
          const row = val[r] || {};
          for (const col of field.tableColumns) {
            const cv = col.validation;
            if (!cv) continue;
            const cellVal = row[col.id];
            if (cellVal === undefined || cellVal === null || cellVal === '') continue;
            const label = `${field.label} → ${col.label} (row ${r + 1})`;
            const errField = { ...field, fieldName: `${field.fieldName}__${r}__${col.id}`, label } as FormField;
            if (col.type === 'text') {
              const s = String(cellVal);
              if (cv.minLength && s.length < cv.minLength) { pushErr(errField, `Minimum ${cv.minLength} characters`); continue; }
              if (cv.maxLength && s.length > cv.maxLength) { pushErr(errField, `Maximum ${cv.maxLength} characters`); continue; }
              if (cv.pattern) {
                try { if (!new RegExp(cv.pattern).test(s)) { pushErr(errField, cv.patternMessage || 'Invalid format'); continue; } } catch {}
              }
            }
            if (col.type === 'number') {
              const n = Number(cellVal);
              if (isNaN(n)) { pushErr(errField, 'Must be a valid number'); continue; }
              if (cv.min !== undefined && n < cv.min) { pushErr(errField, `Minimum value is ${cv.min}`); continue; }
              if (cv.max !== undefined && n > cv.max) { pushErr(errField, `Maximum value is ${cv.max}`); continue; }
            }
          }
        }
      }
    }

    setErrors(stepErrors);
    return { ok: entries.length === 0, entries };
  };

  const reportValidationFailure = (entries: Array<{ fieldName: string; label: string; message: string }>) => {
    if (entries.length === 0) return;
    const names = entries.slice(0, 3).map(e => e.label).join(', ');
    const more = entries.length > 3 ? ` …and ${entries.length - 3} more` : '';
    toast.error(
      `Please fix ${entries.length} field${entries.length > 1 ? 's' : ''}: ${names}${more}`,
      { description: entries[0]?.message }
    );
    // Scroll to + focus first invalid field after errors paint
    const first = entries[0];
    if (typeof window !== 'undefined' && first) {
      requestAnimationFrame(() => {
        const selector = `[data-field-name="${(window as any).CSS?.escape ? CSS.escape(first.fieldName) : first.fieldName}"]`;
        const el = document.querySelector<HTMLElement>(selector);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusable = el.querySelector<HTMLElement>('input, select, textarea, [tabindex]:not([tabindex="-1"])');
          focusable?.focus({ preventScroll: true });
        }
      });
    }
  };

  const handleNext = () => {
    const res = validateCurrentStep();
    if (!res.ok) { reportValidationFailure(res.entries); return; }
    if (sectionGroups) {
      if (activeFormIdx < activeGroupForms.length - 1) {
        setActiveFormIdx(prev => prev + 1);
      } else {
        // Move to next group
        const nextGroupIdx = groupKeys.indexOf(activeGroup) + 1;
        if (nextGroupIdx < groupKeys.length) {
          setActiveGroup(groupKeys[nextGroupIdx]);
          setActiveFormIdx(0);
        }
      }
    } else {
      if (currentStep < visibleSections.length - 1) setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (sectionGroups) {
      if (activeFormIdx > 0) {
        setActiveFormIdx(prev => prev - 1);
      } else {
        // Move to previous group's last form
        const prevGroupIdx = groupKeys.indexOf(activeGroup) - 1;
        if (prevGroupIdx >= 0) {
          const prevKey = groupKeys[prevGroupIdx];
          setActiveGroup(prevKey);
          setActiveFormIdx((sectionGroups.get(prevKey)?.length || 1) - 1);
        }
      }
    } else {
      if (currentStep > 0) setCurrentStep(prev => prev - 1);
    }
  };

  const handleSaveDraft = () => onSaveDraft(getMergedData());

  const handleSubmit = () => {
    const res = validateCurrentStep();
    if (!res.ok) { reportValidationFailure(res.entries); return; }
    if (stepStorageKey) {
      try {
        sessionStorage.removeItem(stepStorageKey);
      } catch {
        // noop
      }
    }
    onSubmit(getMergedData());
  };

  // Handle file upload to storage.
  // When formId is provided (Form Management context), uses versioned upload:
  // uploading another file for the same field creates a new version of the same
  // logical document group. Otherwise falls back to the legacy uploadFormFile.
  const validateFileAgainstField = (field: FormField, file: File): string | null => {
    const v = field.validation;
    if (!v) return null;
    if (v.maxSizeMB && file.size > v.maxSizeMB * 1024 * 1024) {
      return `File exceeds maximum size of ${v.maxSizeMB} MB`;
    }
    if (v.minSizeKB && file.size < v.minSizeKB * 1024) {
      return `File must be at least ${v.minSizeKB} KB`;
    }
    if (v.allowedTypes && v.allowedTypes.length > 0) {
      const name = file.name.toLowerCase();
      const allowedExts = v.allowedTypes
        .flatMap(t => t.split(','))
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
      const ok = allowedExts.some(ext => name.endsWith(ext));
      if (!ok) return `Only ${allowedExts.join(', ')} files are allowed`;
    }
    return null;
  };

  const handleFileUpload = async (field: FormField, file: File) => {
    if (!user) { toast.error('You must be logged in to upload files'); return; }
    const validationError = validateFileAgainstField(field, file);
    if (validationError) { toast.error(validationError); return; }
    const fieldName = field.fieldName;
    setUploadingFields(prev => ({ ...prev, [fieldName]: true }));

    const existing = formData[fieldName] as (FormFileData & { groupId?: string; versionId?: string; version?: number }) | undefined;

    if (formId) {
      const docType = (field as any).documentType || fieldName;
      const res = await uploadVersionedDocument({
        file,
        userId: user.id,
        entityType: entityType || 'form_submission',
        entityId: entityId || applicationId || submissionId || null,
        documentType: docType,
        documentLabel: field.label || fieldName,
        displayName: file.name,
        formId,
        fieldId: field.id,
        submissionId: submissionId || applicationId || undefined,
        groupId: existing?.groupId,
      });
      setUploadingFields(prev => ({ ...prev, [fieldName]: false }));
      if (res.success === true) {
        const data = res.data;
        const value: FormFileData & { groupId: string; versionId: string; version: number; documentType: string } = {
          name: file.name,
          url: '',
          type: file.type,
          size: file.size,
          filePath: existing?.filePath || '',
          uploadId: data.fileUploadId,
          groupId: data.groupId,
          versionId: data.versionId,
          version: data.version,
          documentType: docType,
        };
        updateField(fieldName, value);
        toast.success(`${file.name} uploaded (v${data.version})`);
      } else {
        toast.error((res as { success: false; error: string }).error || 'Upload failed');
      }
      return;
    }

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

  // Multi-file upload: append each successful upload to the field's array value.
  // Each file becomes its own document group (no groupId passed), so re-uploading a
  // different file does NOT replace prior rows. To re-version a specific row, that
  // row's group is targeted via the History dialog.
  const handleMultiFileUpload = async (field: FormField, files: File[]) => {
    if (!user) { toast.error('You must be logged in to upload files'); return; }
    if (!files.length) return;
    const fieldName = field.fieldName;
    setUploadingFields(prev => ({ ...prev, [fieldName]: true }));
    const docType = (field as any).documentType || fieldName;
    const existing: any[] = Array.isArray(formData[fieldName]) ? [...formData[fieldName]] : [];
    let okCount = 0;
    let failCount = 0;
    for (const file of files) {
      const res = await uploadVersionedDocument({
        file,
        userId: user.id,
        entityType: entityType || 'form_submission',
        entityId: entityId || applicationId || submissionId || null,
        documentType: docType,
        documentLabel: field.label || fieldName,
        displayName: file.name,
        formId,
        fieldId: field.id,
        submissionId: submissionId || applicationId || undefined,
      });
      if (res.success === true) {
        okCount += 1;
        existing.push({
          name: file.name,
          url: '',
          type: file.type,
          size: file.size,
          filePath: '',
          uploadId: res.data.fileUploadId,
          groupId: res.data.groupId,
          versionId: res.data.versionId,
          version: res.data.version,
          documentType: docType,
        });
      } else {
        failCount += 1;
        toast.error(`${file.name}: ${(res as { success: false; error: string }).error || 'Upload failed'}`);
      }
    }
    setUploadingFields(prev => ({ ...prev, [fieldName]: false }));
    if (okCount > 0) {
      updateField(fieldName, existing);
      toast.success(`${okCount} file${okCount > 1 ? 's' : ''} uploaded`);
    }
    if (failCount > 0 && okCount === 0) {
      // already toasted per failure
    }
  };

  const handleMultiFileRemoveAt = (fieldName: string, idx: number) => {
    const list = Array.isArray(formData[fieldName]) ? [...formData[fieldName]] : [];
    list.splice(idx, 1);
    updateField(fieldName, list);
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

    const fieldLabel = !isDisplayOnlyFieldType(field.type) && field.type !== 'checkbox' ? (
      <Label className="text-sm">
        {field.label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
    ) : null;

    let input: React.ReactNode;
    const fieldType = String(field.type || '');

    if (isDisplayOnlyFieldType(fieldType)) {
      if (fieldType === 'divider') {
        input = <div className="border-t border-border my-2" aria-hidden="true" />;
      } else if (fieldType === 'heading' || fieldType === 'section_title') {
        const level = Math.min(6, Math.max(1, Number(field.headingLevel) || 2));
        const Tag = `h${level}` as keyof JSX.IntrinsicElements;
        const sizeClass = ['text-3xl', 'text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm'][level - 1];
        input = <Tag className={`${sizeClass} font-semibold text-foreground`}>{resolveDisplayOnlyFieldText(field)}</Tag>;
      } else {
        input = <p className="text-sm text-muted-foreground whitespace-pre-wrap">{resolveDisplayOnlyFieldText(field)}</p>;
      }

      return (
        <div className="space-y-1.5" data-field-name={field.fieldName}>
          {input}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );
    }

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
        if (field.optionSource === 'master_data' && field.masterDataTypeCode) {
          input = <MasterDataField field={field} value={val} onChange={onChange} disabled={readOnly} placeholder={field.placeholder} allFormData={data} />;
        } else {
          input = (
            <Select value={val} onValueChange={v => onChange(field.fieldName, v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder={field.placeholder || 'Select...'} /></SelectTrigger>
              <SelectContent>{(field.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          );
        }
        break;
      case 'multi_select':
        if (field.optionSource === 'master_data' && field.masterDataTypeCode) {
          input = <MasterDataField field={field} value={val} onChange={onChange} disabled={readOnly} placeholder={field.placeholder} allFormData={data} />;
        } else {
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
        }
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
        if (field.optionSource === 'master_data' && field.masterDataTypeCode) {
          input = <MasterDataField field={field} value={val} onChange={onChange} disabled={readOnly} placeholder={field.placeholder} allFormData={data} />;
        } else {
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
        }
        break;
      case 'file':
        if (field.allowMultiple) {
          const multiList: any[] = Array.isArray(val) ? val : [];
          input = (
            <div className="space-y-2">
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    multiple
                    ref={el => { fileInputRefs.current[field.fieldName] = el; }}
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      if (files.length) handleMultiFileUpload(field, files);
                      if (e.target) e.target.value = '';
                    }}
                    className="flex-1"
                    disabled={isUploading || !capUploadAllowed}
                    title={!capUploadAllowed ? "You don't have permission to upload documents in this portal" : undefined}
                  />
                  {isUploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              )}
              {multiList.length > 0 && (
                <div className="space-y-1.5">
                  {multiList.map((item: any, idx: number) => (
                    <div key={`${item.uploadId || item.groupId || item.name}-${idx}`} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm truncate flex-1">{item.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {item.size ? `${(item.size / 1024).toFixed(1)} KB` : ''}
                      </span>
                      {item.version && (
                        <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground border rounded px-1.5 py-0.5 shrink-0">
                          v{item.version}
                        </span>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleFilePreview(item)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {item.groupId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Version history"
                          onClick={() => setHistoryGroup({ groupId: item.groupId, name: item.name })}
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!readOnly && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleMultiFileRemoveAt(field.fieldName, idx)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
          break;
        }
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
                      handleFileUpload(field, file);
                    }
                    // Reset input so same file can be re-selected
                    if (e.target) e.target.value = '';
                  }}
                  className="flex-1"
                  disabled={isUploading || !capUploadAllowed}
                  title={!capUploadAllowed ? "You don't have permission to upload documents in this portal" : undefined}
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
                {val.version && (
                  <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground border rounded px-1.5 py-0.5 shrink-0">
                    v{val.version}
                  </span>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleFilePreview(val)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                {val.groupId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Version history"
                    onClick={() => setHistoryGroup({ groupId: val.groupId, name: val.name })}
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                )}
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
                        {col.type === 'file' ? (
                          (() => {
                            const cellKey = `${field.fieldName}__${rowIdx}__${col.id}`;
                            const cellVal = row[col.id] as (FormFileData | undefined);
                            const uploading = !!uploadingFields[cellKey];
                            return (
                              <div className="flex items-center gap-1">
                                <input
                                  id={`file-${cellKey}`}
                                  type="file"
                                  className="hidden"
                                  disabled={readOnly || uploading}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (!file) return;
                                    if (!user) { toast.error('You must be logged in to upload files'); return; }
                                    if (col.validation) {
                                      const colErr = validateFileAgainstField({ validation: col.validation } as any, file);
                                      if (colErr) { toast.error(colErr); return; }
                                    }
                                    setUploadingFields(prev => ({ ...prev, [cellKey]: true }));
                                    const result = await uploadFormFile(file, user.id, applicationId);
                                    setUploadingFields(prev => ({ ...prev, [cellKey]: false }));
                                    if (result.success && result.data) {
                                      const newData = [...tableData];
                                      newData[rowIdx] = { ...newData[rowIdx], [col.id]: result.data };
                                      onChange(field.fieldName, newData);
                                      toast.success(`${file.name} uploaded`);
                                    } else {
                                      toast.error(result.error || 'Upload failed');
                                    }
                                  }}

                                />
                                {cellVal?.name ? (
                                  <>
                                    <span className="text-xs truncate max-w-[140px]" title={cellVal.name}>{cellVal.name}</span>
                                    {!readOnly && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-destructive"
                                        onClick={async () => {
                                          if (cellVal.filePath) {
                                            await deleteFormFile(cellVal.filePath, cellVal.uploadId);
                                          }
                                          const newData = [...tableData];
                                          newData[rowIdx] = { ...newData[rowIdx], [col.id]: '' };
                                          onChange(field.fieldName, newData);
                                        }}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={readOnly || uploading}
                                    onClick={() => document.getElementById(`file-${cellKey}`)?.click()}
                                  >
                                    {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                                    Upload
                                  </Button>
                                )}
                              </div>
                            );
                          })()
                        ) : col.type === 'select' ? (
                          <Select
                            value={row[col.id] || ''}
                            onValueChange={(v) => {
                              const newData = [...tableData];
                              newData[rowIdx] = { ...newData[rowIdx], [col.id]: v };
                              onChange(field.fieldName, newData);
                            }}
                            disabled={readOnly}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              {(col.options || []).map((opt, i) => (
                                <SelectItem key={i} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                            value={row[col.id] || ''}
                            min={col.type === 'number' ? col.validation?.min : undefined}
                            max={col.type === 'number' ? col.validation?.max : undefined}
                            minLength={col.type === 'text' ? col.validation?.minLength : undefined}
                            maxLength={col.type === 'text' ? col.validation?.maxLength : undefined}
                            pattern={col.type === 'text' ? col.validation?.pattern : undefined}
                            title={col.type === 'text' ? col.validation?.patternMessage : undefined}
                            onChange={e => {
                              const val = e.target.value;
                              if (col.type === 'text' && val && col.validation?.pattern) {
                                try {
                                  const re = new RegExp(col.validation.pattern);
                                  if (!re.test(val)) {
                                    // allow typing but mark invalid via HTML5; show toast only on blur via title
                                  }
                                } catch {}
                              }
                              const newData = [...tableData];
                              newData[rowIdx] = { ...newData[rowIdx], [col.id]: val };
                              onChange(field.fieldName, newData);
                            }}
                            disabled={readOnly}
                            className="h-8 text-xs"
                          />
                        )}

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
      <div key={field.id} className="space-y-1.5" data-field-name={field.fieldName}>
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

  const isAtVeryStart = sectionGroups
    ? groupKeys.indexOf(activeGroup) === 0 && activeFormIdx === 0
    : currentStep === 0;

  const isAtVeryEnd = sectionGroups
    ? groupKeys.indexOf(activeGroup) === groupKeys.length - 1 && activeFormIdx === activeGroupForms.length - 1
    : currentStep === visibleSections.length - 1;

  // Total forms across all groups for progress
  const totalFormsCount = sectionGroups
    ? Array.from(sectionGroups.values()).reduce((sum, g) => sum + g.length, 0)
    : visibleSections.length;
  const completedFormsCount = sectionGroups
    ? groupKeys.slice(0, groupKeys.indexOf(activeGroup)).reduce((sum, k) => sum + (sectionGroups.get(k)?.length || 0), 0) + activeFormIdx + 1
    : currentStep + 1;
  const overallProgress = totalFormsCount > 0 ? (completedFormsCount / totalFormsCount) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formName}</span>
          <span>Form {completedFormsCount} of {totalFormsCount}</span>
        </div>
        <Progress value={overallProgress} className="h-2" />

        {/* Two-level navigation for grouped forms */}
        {sectionGroups && (
          <div className="space-y-3">
            {/* Group tabs (A Forms, B Forms, etc.) */}
            <div className="flex flex-wrap gap-1.5">
              {groupKeys.map(key => {
                const isActive = key === activeGroup;
                const groupForms = sectionGroups.get(key) || [];
                const allCompleted = groupForms.every(s => isSectionCompleted(s));
                return (
                  <button
                    key={key}
                    onClick={() => { setActiveGroup(key); setActiveFormIdx(0); }}
                    className={`
                      flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-bold transition-all
                      ${isActive
                        ? 'bg-[hsl(var(--warning,40_96%_53%))] text-white shadow-md'
                        : allCompleted
                          ? 'bg-primary/10 text-primary hover:bg-primary/20'
                          : 'bg-primary text-primary-foreground hover:opacity-90'
                      }
                    `}
                  >
                    {key} Forms
                    {allCompleted && !isActive && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>

            {/* Sub-form buttons */}
            <div className="flex flex-wrap gap-1.5">
              {activeGroupForms.map((s, i) => {
                const isActive = i === activeFormIdx;
                const isCompleted = isSectionCompleted(s);
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveFormIdx(i)}
                    title={s.title}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                      ${isActive
                        ? 'bg-[hsl(var(--warning,40_96%_53%))] text-white shadow-sm'
                        : isCompleted
                          ? 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30'
                          : 'bg-primary text-primary-foreground hover:opacity-90'
                      }
                    `}
                  >
                    <span className="truncate max-w-[200px]">{s.title}</span>
                    {isCompleted && !isActive && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Simple tab navigation for non-grouped multi-section forms */}
        {showTabs && (
          <div className="flex flex-wrap gap-1.5">
            {visibleSections.map((s, i) => {
              const isActive = i === currentStep;
              const isCompleted = isSectionCompleted(s);
              const letter = String.fromCharCode(65 + i);
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentStep(i)}
                  title={s.title}
                  className={`
                    relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border
                    ${isActive
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : isCompleted
                        ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                        : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                    }
                  `}
                >
                  {showFullTabTitles ? (
                    <span className="max-w-[200px] truncate">{s.title}</span>
                  ) : (
                    <>
                      <span className="font-bold">{letter}</span>
                      <span className="hidden sm:inline max-w-[120px] truncate">{s.title}</span>
                    </>
                  )}
                  {isCompleted && !isActive && (
                    <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Section Content */}
      <Card>
        <CardHeader className="pb-3 px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg">{currentSection.title}</CardTitle>
              {currentSection.description && (
                <p className="text-sm text-muted-foreground mt-1">{currentSection.description}</p>
              )}
            </div>
            {currentSection.isRepeatable && (
              <Badge variant="outline" className="text-xs">Repeatable</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-4 sm:px-6">
          {!currentSection.isRepeatable ? (
            <RowsGrid
              rows={currentSection.rows || []}
              renderField={(field) => renderField(field, formData, updateField)}
            />
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
                    <RowsGrid
                      rows={currentSection.rows || []}
                      renderField={(field) => renderField(field, entry, (fn, v) => updateRepeatableField(currentSection.id, entryIdx, fn, v))}
                    />
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <Button variant="outline" onClick={handlePrev} disabled={isAtVeryStart} className="w-full sm:w-auto">
          <ArrowLeft className="h-4 w-4 mr-2" /> Previous
        </Button>
        <div className="flex flex-col sm:flex-row gap-2">
          {!readOnly && (
            <Button variant="outline" onClick={handleSaveDraft} disabled={saving} className="w-full sm:w-auto">
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Draft'}
            </Button>
          )}
          {!isAtVeryEnd ? (
            <Button onClick={handleNext} className="w-full sm:w-auto">
              Next <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            !readOnly && (
              <Button
                onClick={handleSubmit}
                disabled={saving || !capSubmitAllowed}
                title={!capSubmitAllowed ? "You don't have permission to submit in this portal" : undefined}
                className="w-full sm:w-auto"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Submit
              </Button>
            )
          )}
        </div>
      </div>

      {/* File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[85vh]">
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
      <DocumentVersionHistoryDialog
        open={!!historyGroup}
        onOpenChange={(o) => { if (!o) setHistoryGroup(null); }}
        groupId={historyGroup?.groupId || null}
        groupName={historyGroup?.name}
      />
    </div>
  );
}
