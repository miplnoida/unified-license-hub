import { Input } from '@/components/ui/input';
import { EmailFieldControl } from '@/components/forms/EmailFieldControl';
import { EMAIL_FIELD_SETTINGS_OFF, resolveEmailFieldSettings } from '@/lib/emailFieldConfig';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { RegStep, RegField } from '@/types/registrationForm';
import { useSectors, useSubSectors, useCategories } from '@/hooks/useMasterConfig';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { recordRegistrationUpload, registrationUploadFolder, signRegistrationFile } from '@/lib/registrationFileAccess';
import { useActiveMasterItems } from '@/hooks/useMasterData';
import { Upload, FileText, X, Loader2, AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { validateFile, ACCEPT_STRING } from '@/lib/secureFileUpload';
import { AttachmentDisplay, isAttachmentValue, normalizeAttachments } from '@/components/registration/AttachmentDisplay';
import { isDisplayOnlyField, resolveDisplayKind, resolveDisplayOnlyFieldText } from '@/lib/registrationDisplayTypes';
import { uploadVersionedDocument } from '@/lib/documentVersioning';

/** Optional context that enables versioned uploads for `file` fields.
 * When provided, uploaded documents are recorded in `document_groups` /
 * `document_versions` so admin/licensee views can show version badges and
 * history. Signature (image-only) fields are unaffected.
 */
export interface RegistrationUploadContext {
  userId?: string | null;
  entityType?: string;
  entityId?: string | null;
  formId?: string | null;
}

interface Props extends RegistrationUploadContext {
  step: RegStep;
  data: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (fieldName: string, value: unknown) => void;
  onBlur?: (fieldName: string, value: unknown, field: RegField) => void;
  readOnly?: boolean;
  /**
   * True when the wizard itself owns email OTP verification (form-level
   * `require_otp` with a dedicated verification stage). Only the field-level
   * OTP control is suppressed — syntax, uniqueness and blur handling stay on.
   */
  suppressEmailVerification?: boolean;
}

/**
 * Renders a single registration step using the builder's row → column → field
 * grid layout. Responsive: columns collapse on mobile.
 */
export function RegistrationStepRenderer({ step, data, errors, onChange, onBlur, readOnly, suppressEmailVerification, userId, entityType, entityId, formId }: Props) {

  const uploadCtx: RegistrationUploadContext = { userId, entityType, entityId, formId };

  const allFields = useMemo(() => {
    return step.rows.flatMap(r => r.columns.map(c => c.field).filter(Boolean)) as RegField[];
  }, [step]);

  // Wire the "Same as Mailing Address" checkbox: when true, hide physical_*
  // fields and mirror the mailing_* values into their physical_* counterparts.
  const hasSameAsMailingField = useMemo(
    () => allFields.some(f => f.fieldName === 'same_as_mailing'),
    [allFields],
  );
  const sameAsMailing = data.same_as_mailing === true || data.same_as_mailing === 'true';

  // On toggle → true, copy each mailing_<suffix> value into its physical_<suffix>
  // sibling so downstream state (submission, review) reflects the choice.
  const previousSameAsMailing = useRef<boolean>(sameAsMailing);
  useEffect(() => {
    if (!hasSameAsMailingField) return;
    if (sameAsMailing && !previousSameAsMailing.current) {
      const physicalNames = allFields
        .map(f => f.fieldName)
        .filter(n => n && n.startsWith('physical_')) as string[];
      for (const physName of physicalNames) {
        const suffix = physName.slice('physical_'.length);
        const mailingName = `mailing_${suffix}`;
        const mailingVal = data[mailingName];
        if (mailingVal !== undefined && mailingVal !== null && mailingVal !== '') {
          if (data[physName] !== mailingVal) onChange(physName, mailingVal);
        }
      }
    }
    previousSameAsMailing.current = sameAsMailing;
    // Intentionally exclude `data` from deps to avoid a copy loop; we only
    // want to act on the false→true edge of the checkbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameAsMailing, hasSameAsMailingField]);


  // Compute initial entry count for repeatable steps based on already-saved data.
  // Any saved key matching `<baseFieldName>__<n>` raises the count to n+1.
  const initialEntryCount = useMemo(() => {
    if (!step.isRepeatable) return 1;
    let max = 0;
    const baseNames = allFields.map(f => f.fieldName);
    for (const k of Object.keys(data || {})) {
      const m = k.match(/^(.+)__(\d+)$/);
      if (!m) continue;
      if (!baseNames.includes(m[1])) continue;
      const n = parseInt(m[2], 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return Math.max(1, max + 1);
  }, [step.isRepeatable, allFields, data]);

  const [entryCount, setEntryCount] = useState<number>(initialEntryCount);


  const renderRows = (entryIndex: number) => (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-12">
      {step.rows.flatMap(row =>
        row.columns.map((col, colIdx) => {
          const baseField = col.field;
          
          const effectiveName = baseField
            ? (entryIndex === 0 ? baseField.fieldName : `${baseField.fieldName}__${entryIndex}`)
            : '';
          const effectiveField: RegField | null = baseField
            ? { ...baseField, fieldName: effectiveName }
            : null;
          return (
            <div
              key={`${row.id}-${colIdx}`}
              className="col-span-1"
              style={{ gridColumn: `span ${col.span}` } as React.CSSProperties}
            >
              {effectiveField ? (
                <InteractiveField
                  field={effectiveField}
                  value={data[effectiveName] ?? effectiveField.defaultValue ?? ''}
                  error={errors[effectiveName]}
                  onChange={onChange}
                  onBlur={onBlur}
                  readOnly={readOnly}
                  allData={data}
                  allFields={allFields}
                  uploadCtx={uploadCtx}
                  suppressEmailVerification={suppressEmailVerification}
                />

              ) : (
                <div className="h-10" />
              )}
            </div>
          );
        })
      )}
    </div>
  );


  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {step.description && (
          <p className="text-sm text-muted-foreground mb-4">{step.description}</p>
        )}

        {step.isRepeatable ? (
          <div className="space-y-6">
            {Array.from({ length: entryCount }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">
                    {(step.repeatLabel || step.title)} {i + 1}
                  </h4>
                  {i > 0 && !readOnly && (
                    <Button data-rbac="registration_management.edit"
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        // Drop saved values for this entry, then decrement count.
                        const baseNames = allFields.map(f => f.fieldName);
                        for (const name of baseNames) {
                          const key = `${name}__${i}`;
                          if (key in data) onChange(key, undefined);
                        }
                        setEntryCount(c => Math.max(1, c - 1));
                      }}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                  )}
                </div>
                {renderRows(i)}
              </div>
            ))}
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEntryCount(c => c + 1)}
              >
                + Add another {(step.repeatLabel || step.title).toLowerCase()}
              </Button>
            )}
          </div>
        ) : (
          step.rows.map(row => {
            return (
              <div
                key={row.id}
                className="grid gap-4 grid-cols-1 md:grid-cols-12"
              >
                {row.columns.map((col, colIdx) => (
                  <div
                    key={colIdx}
                    className="col-span-1"
                    style={{ gridColumn: `span ${col.span}` } as React.CSSProperties}
                  >
                    {col.field ? (
                      <InteractiveField
                        field={col.field}
                        value={data[col.field.fieldName] ?? col.field.defaultValue ?? ''}
                        error={errors[col.field.fieldName]}
                        onChange={onChange}
                        onBlur={onBlur}
                        readOnly={readOnly}
                        allData={data}
                        allFields={allFields}
                        uploadCtx={uploadCtx}
                        suppressEmailVerification={suppressEmailVerification}
                      />
                    ) : (
                      <div className="h-10" />
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}


        {step.rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No fields in this step.</p>
        )}
      </CardContent>
    </Card>
  );
}


interface FieldProps {
  field: RegField;
  value: unknown;
  error?: string;
  onChange: (fieldName: string, value: unknown) => void;
  onBlur?: (fieldName: string, value: unknown, field: RegField) => void;
  readOnly?: boolean;
  allData: Record<string, unknown>;
  allFields: RegField[];
  uploadCtx?: RegistrationUploadContext;
  /** Wizard-owned OTP: suppress only the field-level verification control. */
  suppressEmailVerification?: boolean;
}

function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('countries' as never)
        .select('*')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as { id: string; name: string; iso_code: string }[];
    },
  });
}

function useStates() {
  return useQuery({
    queryKey: ['states'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('states' as never)
        .select('*')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as { id: string; country_id: string; name: string }[];
    },
  });
}

function useDynamicOptions(field: RegField, allData: Record<string, unknown>) {
  const { data: sectors = [] } = useSectors();
  const { data: allSubSectors = [] } = useSubSectors();
  const { data: allCategories = [] } = useCategories();
  const { data: countries = [] } = useCountries();
  const { data: allStates = [] } = useStates();

  return useMemo(() => {
    if (!field.dataSource) return null;

    if (field.dataSource === 'sector') {
      return sectors.map((s: { id: string; name: string }) => ({ value: s.id, label: s.name }));
    }

    if (field.dataSource === 'sub_sector') {
      const parentFieldName = field.dependsOn;
      const parentValue = parentFieldName ? String(allData[parentFieldName] || '') : '';
      if (!parentValue) return [];
      return allSubSectors
        .filter((s: { sector_id: string }) => s.sector_id === parentValue)
        .map((s: { id: string; name: string }) => ({ value: s.id, label: s.name }));
    }

    if (field.dataSource === 'category') {
      const parentFieldName = field.dependsOn;
      const parentValue = parentFieldName ? String(allData[parentFieldName] || '') : '';
      if (!parentValue) return [];
      return allCategories
        .filter((c: { sub_sector_id: string }) => c.sub_sector_id === parentValue)
        .map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }));
    }

    if (field.dataSource === 'country') {
      if (countries.length === 0) return [{ value: '__empty', label: 'No countries available' }];
      return countries.map((c) => ({ value: c.id, label: c.name }));
    }

    if (field.dataSource === 'state') {
      const parentFieldName = field.dependsOn;
      const parentValue = parentFieldName ? String(allData[parentFieldName] || '') : '';
      if (!parentValue) return [];
      const filtered = allStates.filter((s) => s.country_id === parentValue);
      if (filtered.length === 0) return [{ value: '__empty', label: 'No states available for this country' }];
      return filtered.map((s) => ({ value: s.id, label: s.name }));
    }

    return null;
  }, [field.dataSource, field.dependsOn, allData, sectors, allSubSectors, allCategories, countries, allStates]);
}

function InteractiveField({ field, value, error, onChange, onBlur, readOnly, allData, allFields, uploadCtx, suppressEmailVerification }: FieldProps) {
  const handleChange = (val: unknown) => {
    onChange(field.fieldName, val);

    // Clear dependent fields when parent changes
    if (field.dataSource || field.optionSource === 'master_data') {
      const dependents = allFields.filter(f =>
        f.dependsOn === field.fieldName || f.masterDataParentField === field.fieldName
      );
      dependents.forEach(dep => onChange(dep.fieldName, ''));
    }
  };

  const handleBlur = (val: unknown) => {
    onBlur?.(field.fieldName, val, field);
  };

  const dynamicOptions = useDynamicOptions(field, allData);

  const isMasterData = field.optionSource === 'master_data' && field.masterDataTypeCode;

  const parentFieldName = field.dependsOn || field.masterDataParentField;
  const parentValue = parentFieldName ? String(allData[parentFieldName] || '') : '';
  const parentMissing = !!parentFieldName && !parentValue;

  const labelEl = !isDisplayOnlyField(field) && field.type !== 'checkbox' ? (
    <Label className="text-sm flex items-center gap-1.5">
      {field.label}
      {field.required && <span className="text-destructive ml-0.5">*</span>}
      {parentMissing && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent>Please select the parent field first</TooltipContent>
        </Tooltip>
      )}
    </Label>
  ) : null;


  let input: React.ReactNode;
  const strValue = typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));

  // Backward-compat: legacy registration configs may have signature fields saved as
  // 'text' (or an unknown/missing type). Detect via label/fieldName and re-route to
  // the image-only upload renderer so users get a signature uploader, not a text box.
  const KNOWN_REG_TYPES = new Set([
    'text','number','email','phone','password','confirm_password','date','textarea',
    'select','multi_select','checkbox','radio','file','signature',
    'paragraph','heading','static_text','section_title','divider','info',
  ]);
  const nameForMatch = `${field.label || ''} ${field.fieldName || ''}`.toLowerCase();
  const looksLikeSignature = /(^|[^a-z])signature([^a-z]|$)/.test(nameForMatch);
  const looksLikeConfirmPassword = nameForMatch.includes('password') && nameForMatch.includes('confirm');
  const looksLikePassword = nameForMatch.includes('password') && !looksLikeConfirmPassword;
  const looksLikeEmail = nameForMatch.includes('email');
  const effectiveType: string = (looksLikeSignature && (field.type === 'text' || !KNOWN_REG_TYPES.has(field.type as string)))
    ? 'signature'
    : (looksLikePassword && field.type !== 'password')
      ? 'password'
      : (looksLikeConfirmPassword && field.type !== 'confirm_password')
        ? 'confirm_password'
        : (looksLikeEmail && field.type !== 'email')
          ? 'email'
          : field.type;

  const configuredEmailSettings = effectiveType === 'email'
    ? resolveEmailFieldSettings({ type: 'email', validation: field.validation as any })
    : EMAIL_FIELD_SETTINGS_OFF;
  // The wizard's dedicated verification stage is the single runtime owner of OTP
  // when form-level OTP is on. Uniqueness/syntax checks are never suppressed.
  const emailSettings = suppressEmailVerification
    ? { ...configuredEmailSettings, requireVerification: false }
    : configuredEmailSettings;

  switch (effectiveType) {
    case 'email':
      if (!readOnly && (emailSettings.requireVerification || emailSettings.requireUniqueness)) {
        input = (
          <EmailFieldControl
            fieldKey={field.fieldName}
            value={strValue}
            onChange={handleChange}
            onBlur={handleBlur}
            settings={emailSettings}
            placeholder={field.placeholder}
            disabled={readOnly}
            invalid={!!error}
            ownEmail={typeof allData?.__ownEmail === 'string' ? allData.__ownEmail : null}
          />
        );
        break;
      }
      // falls through to the plain input below
    case 'text':
    case 'password':
    case 'confirm_password':
      input = (
        <Input
          type={effectiveType === 'email' ? 'email' : (effectiveType === 'password' || effectiveType === 'confirm_password') ? 'password' : 'text'}
          value={strValue}
          onChange={e => handleChange(e.target.value)}
          onBlur={e => handleBlur(e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
          autoComplete={(effectiveType === 'password' || effectiveType === 'confirm_password') ? 'new-password' : undefined}
          className={error ? 'border-destructive' : ''}
        />
      );
      break;
    case 'phone':
      input = (
        <Input
          type="tel"
          value={strValue}
          onChange={e => handleChange(e.target.value)}
          onBlur={e => handleBlur(e.target.value)}
          placeholder={field.placeholder || '+1 (555) 123-4567'}
          disabled={readOnly}
          className={error ? 'border-destructive' : ''}
        />
      );
      break;
    case 'number':
      input = (
        <Input
          type="number"
          value={strValue}
          onChange={e => {
            const raw = e.target.value;
            if (raw === '' || raw === '-') handleChange(raw);
            else {
              const num = parseInt(raw, 10);
              handleChange(isNaN(num) ? raw : num);
            }
          }}
          onBlur={e => handleBlur(e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
          className={error ? 'border-destructive' : ''}
        />
      );
      break;
    case 'date':
      input = (
        <Input
          type="date"
          value={strValue}
          onChange={e => handleChange(e.target.value)}
          onBlur={e => handleBlur(e.target.value)}
          disabled={readOnly}
          className={error ? 'border-destructive' : ''}
        />
      );
      break;
    case 'textarea':
      input = (
        <Textarea
          value={strValue}
          onChange={e => handleChange(e.target.value)}
          onBlur={e => handleBlur(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          disabled={readOnly}
          className={error ? 'border-destructive' : ''}
        />
      );
      break;
    case 'select': {
      if (isMasterData) {
        input = (
          <MasterDataRegField
            field={field}
            value={strValue}
            onChange={handleChange}
            disabled={readOnly}
            allData={allData}
          />
        );
      } else if (dynamicOptions) {
        const parentMissing = field.dependsOn && !allData[field.dependsOn];
        const isDisabled = readOnly || !!parentMissing;
        input = (
          <div>
            <Select value={strValue} onValueChange={handleChange} disabled={isDisabled}>
              <SelectTrigger onBlur={() => handleBlur(strValue)} className={error ? 'border-destructive' : ''}>
                <SelectValue placeholder={parentMissing ? 'Select...' : (field.placeholder || 'Select...')} />
              </SelectTrigger>
              <SelectContent>
                {dynamicOptions.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    {parentMissing ? '—' : 'No options available'}
                  </SelectItem>
                ) : (
                  dynamicOptions.map((o: { value: string; label: string }) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        );
      } else {
        input = (
          <Select value={strValue} onValueChange={handleChange} disabled={readOnly}>
            <SelectTrigger onBlur={() => handleBlur(strValue)} className={error ? 'border-destructive' : ''}>
              <SelectValue placeholder={field.placeholder || 'Select...'} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map(o => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      break;
    }
    case 'multi_select':
      if (isMasterData) {
        input = (
          <MasterDataRegField
            field={field}
            value={value}
            onChange={handleChange}
            disabled={readOnly}
            allData={allData}
            isMulti
          />
        );
      } else {
        input = (
          <div className="space-y-1">
            {(field.options || []).map(opt => {
              const selected = Array.isArray(value) ? value : [];
              return (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(opt)}
                    onCheckedChange={checked => {
                      const next = checked ? [...selected, opt] : selected.filter((v: string) => v !== opt);
                      handleChange(next);
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
          <Checkbox
            checked={value === true || value === 'true'}
            onCheckedChange={v => handleChange(v)}
            disabled={readOnly}
          />
          <Label className="text-sm">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
        </div>
      );
      break;
    case 'radio':
      if (isMasterData) {
        input = (
          <MasterDataRegField
            field={field}
            value={value}
            onChange={handleChange}
            disabled={readOnly}
            allData={allData}
            isRadio
          />
        );
      } else {
        input = (
          <div className="space-y-1.5">
            {(field.options || []).map(opt => (
              <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={field.fieldName}
                  value={opt}
                  checked={strValue === opt}
                  onChange={() => handleChange(opt)}
                  onBlur={() => handleBlur(opt)}
                  disabled={readOnly}
                  className="accent-primary"
                />
                {opt}
              </label>
            ))}
          </div>
        );
      }
      break;
    case 'file':
      input = (
        <FileUploadField
          field={field}
          value={value}
          onChange={handleChange}
          readOnly={readOnly}
          error={error}
          uploadCtx={uploadCtx}
        />
      );
      break;
    case 'signature':
      input = (
        <FileUploadField
          field={field}
          value={value}
          onChange={handleChange}
          readOnly={readOnly}
          error={error}
          imageOnly
        />
      );
      break;
    case 'paragraph':
    case 'heading':
    case 'section_title':
    case 'static_text':
    case 'info':
    case 'divider': {
      const displayKind = resolveDisplayKind(field.type);
      if (displayKind === 'divider') {
        return <div className="border-t border-border my-2" aria-hidden="true" />;
      }

      if (displayKind === 'heading') {
        const lvl = field.headingLevel || (field.type === 'section_title' ? 3 : 2);
        const Tag = (`h${lvl}` as unknown) as keyof JSX.IntrinsicElements;
        const sizeMap: Record<number, string> = { 1: 'text-3xl', 2: 'text-2xl', 3: 'text-xl', 4: 'text-lg', 5: 'text-base', 6: 'text-sm' };
        return (
          <Tag className={`font-semibold text-foreground ${sizeMap[lvl]}`}>
            {resolveDisplayOnlyFieldText(field) || 'Heading'}
          </Tag>
        );
      }

      return (
        <div className="p-3 rounded-md bg-muted/30 text-sm text-muted-foreground">
          {resolveDisplayOnlyFieldText(field) || 'Information'}
        </div>
      );
    }
    default:
      input = (
        <Input
          type="text"
          value={strValue}
          onChange={e => handleChange(e.target.value)}
          onBlur={e => handleBlur(e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
          className={error ? 'border-destructive' : ''}
        />
      );
  }

  return (
    <div className="space-y-1.5">
      {labelEl}
      {input}
      {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** File upload field that actually uploads to secure storage */
function FileUploadField({ field, value, onChange, readOnly, error, imageOnly, uploadCtx }: {
  field: RegField;
  value: unknown;
  onChange: (val: unknown) => void;
  readOnly?: boolean;
  error?: string;
  imageOnly?: boolean;
  uploadCtx?: RegistrationUploadContext;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp';
  const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp'];

  // Use the shared attachment detector so any file-shaped value (single object,
  // array, or legacy {fileName,url} shapes) renders View/Download actions.
  const hasAttachment = isAttachmentValue(value);
  const firstNormalized = hasAttachment ? normalizeAttachments(value)[0] : null;
  const fileData = firstNormalized ? { name: firstNormalized.name, path: firstNormalized.path || '', size: firstNormalized.size || 0 } : null;

  // For signature fields, resolve a signed preview URL from the storage path.
  const signaturePath = imageOnly && firstNormalized?.path ? firstNormalized.path : null;
  useEffect(() => {
    let cancelled = false;
    if (!signaturePath) {
      setPreviewUrl(null);
      return;
    }
    signRegistrationFile(signaturePath, 600).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => { cancelled = true; };
  }, [signaturePath]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (imageOnly) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const mimeOk = (file.type || '').startsWith('image/');
      const extOk = IMAGE_EXT.includes(ext);
      if (!mimeOk || !extOk) {
        toast.error('Signature must be an image (PNG, JPG, JPEG, or WEBP).');
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Signature image must be 5MB or smaller.');
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
    } else {
      const validation = validateFile(file);
      if (!validation.valid) {
        toast.error(validation.error || 'Invalid file');
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
    }

    setUploading(true);
    try {
      // Non-signature uploads: prefer the versioned document pipeline so the
      // stored value carries {groupId, versionId, version}. AttachmentDisplay
      // uses those to render the v# badge + history in admin/licensee views.
      // Requires: caller passed uploadCtx.userId and a stable formId.
      if (!imageOnly && uploadCtx?.userId && uploadCtx?.formId) {
        const existing = (value && typeof value === 'object' && !Array.isArray(value))
          ? (value as Record<string, unknown>)
          : null;
        const existingGroupId = (existing?.groupId || (existing as any)?.group_id) as string | undefined;
        const docType = (field as any).documentType || field.fieldName || 'document';
        const res = await uploadVersionedDocument({
          file,
          userId: uploadCtx.userId,
          entityType: uploadCtx.entityType || 'registration',
          entityId: uploadCtx.entityId ?? null,
          documentType: docType,
          documentLabel: field.label || field.fieldName,
          displayName: file.name,
          formId: uploadCtx.formId,
          fieldId: field.id,
          groupId: existingGroupId,
        });
        if (res.success === true) {
          onChange({
            name: file.name,
            path: '',
            size: file.size,
            type: file.type,
            groupId: res.data.groupId,
            versionId: res.data.versionId,
            version: res.data.version,
            uploadId: res.data.fileUploadId,
            documentType: docType,
          });
          toast.success(`${file.name} uploaded (v${res.data.version})`);
        } else {
          toast.error(res.error || 'Upload failed');
        }
        return;
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || (imageOnly ? 'png' : 'pdf');
      const subdir = await registrationUploadFolder(imageOnly ? 'signatures' : undefined);
      const filePath = `${subdir}/${crypto.randomUUID()}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('secure-documents')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        toast.error('Upload failed: ' + uploadError.message);
        return;
      }
      await recordRegistrationUpload(filePath);


      onChange({
        name: file.name,
        path: filePath,
        size: file.size,
        type: file.type,
      });
      toast.success(`${file.name} uploaded`);
    } catch (err) {
      console.error('File upload error:', err);
      toast.error(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (fileData?.path) {
      try {
        await supabase.storage.from('secure-documents').remove([fileData.path]);
      } catch { /* intentionally ignored */ }
    }
    onChange('');
  };

  if (hasAttachment) {
    return (
      <div className="space-y-1.5">
        {imageOnly && previewUrl ? (
          <div className="rounded-md border bg-muted/20 p-2 inline-block">
            <img
              src={previewUrl}
              alt={fileData?.name || 'Signature'}
              className="max-h-32 max-w-full object-contain"
            />
            <div className="text-[11px] text-muted-foreground mt-1 truncate">{fileData?.name}</div>
          </div>
        ) : (
          <AttachmentDisplay value={value} />
        )}
        {!readOnly && (
          <Button data-rbac="registration_management.edit" type="button" variant="ghost" size="sm" onClick={handleRemove} className="h-7 text-xs text-destructive hover:text-destructive">
            <X className="h-3 w-3 mr-1" /> Remove
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={imageOnly ? IMAGE_ACCEPT : ACCEPT_STRING}
        onChange={handleFileSelect}
        className="hidden"
        id={`file-${field.fieldName}`}
        disabled={readOnly || uploading}
      />
      <Button data-rbac="registration_management.create"
        type="button"
        variant="outline"
        className={`w-full ${error ? 'border-destructive' : ''}`}
        onClick={() => inputRef.current?.click()}
        disabled={readOnly || uploading}
      >
        {uploading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
        ) : (
          <><Upload className="h-4 w-4 mr-2" />{imageOnly ? 'Upload Signature Image' : 'Choose File'}</>
        )}
      </Button>
      {imageOnly && (
        <p className="text-[11px] text-muted-foreground mt-1">PNG, JPG, JPEG, or WEBP. Max 5MB.</p>
      )}
    </div>
  );
}

/** Renders select/multi/radio fields backed by the generic master data system */
function MasterDataRegField({ field, value, onChange, disabled, allData, isMulti, isRadio }: {
  field: RegField;
  value: unknown;
  onChange: (val: unknown) => void;
  disabled?: boolean;
  allData: Record<string, unknown>;
  isMulti?: boolean;
  isRadio?: boolean;
}) {
  const parentValue = field.masterDataParentField ? String(allData[field.masterDataParentField] || '') : '';
  const parentMissing = !!field.masterDataParentField && !parentValue;
  const { data: items = [] } = useActiveMasterItems(
    field.masterDataTypeCode || '',
    field.masterDataParentField ? (parentValue || null) : undefined
  );

  const options = items.map(i => ({ value: i.id, label: i.name }));
  const isDisabled = disabled || parentMissing;
  const strValue = typeof value === 'string' ? value : '';

  if (isRadio) {
    return (
      <div className="space-y-1.5">
        {!parentMissing && options.length === 0 && <p className="text-xs text-muted-foreground">No options available</p>}
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name={field.fieldName} value={opt.value} checked={strValue === opt.value} onChange={() => onChange(opt.value)} disabled={!!isDisabled} className="accent-primary" />
            {opt.label}
          </label>
        ))}
      </div>
    );
  }

  if (isMulti) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1">
        {!parentMissing && options.length === 0 && <p className="text-xs text-muted-foreground">No options available</p>}
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={checked => {
                const next = checked ? [...selected, opt.value] : selected.filter((v: string) => v !== opt.value);
                onChange(next);
              }}
              disabled={!!isDisabled}
            />
            {opt.label}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div>
      <Select value={strValue} onValueChange={onChange} disabled={!!isDisabled}>
        <SelectTrigger>
          <SelectValue placeholder={parentMissing ? 'Select...' : (field.placeholder || 'Select...')} />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 && (
            <SelectItem value="__empty" disabled>
              {parentMissing ? '—' : 'No options available'}
            </SelectItem>
          )}
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
