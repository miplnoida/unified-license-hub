import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { RegStep, RegField } from '@/types/registrationForm';
import { useSectors, useSubSectors, useCategories } from '@/hooks/useMasterConfig';
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveMasterItems } from '@/hooks/useMasterData';
import { Upload, FileText, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { validateFile, ACCEPT_STRING } from '@/lib/secureFileUpload';

interface Props {
  step: RegStep;
  data: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (fieldName: string, value: unknown) => void;
  readOnly?: boolean;
}

/**
 * Renders a single registration step using the builder's row → column → field
 * grid layout. Responsive: columns collapse on mobile.
 */
export function RegistrationStepRenderer({ step, data, errors, onChange, readOnly }: Props) {
  const allFields = useMemo(() => {
    return step.rows.flatMap(r => r.columns.map(c => c.field).filter(Boolean)) as RegField[];
  }, [step]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {step.description && (
          <p className="text-sm text-muted-foreground mb-4">{step.description}</p>
        )}

        {step.rows.map(row => (
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
                    readOnly={readOnly}
                    allData={data}
                    allFields={allFields}
                  />
                ) : (
                  <div className="h-10" />
                )}
              </div>
            ))}
          </div>
        ))}

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
  readOnly?: boolean;
  allData: Record<string, unknown>;
  allFields: RegField[];
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

function InteractiveField({ field, value, error, onChange, readOnly, allData, allFields }: FieldProps) {
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

  const dynamicOptions = useDynamicOptions(field, allData);

  const isMasterData = field.optionSource === 'master_data' && field.masterDataTypeCode;

  const labelEl = field.type !== 'paragraph' && field.type !== 'heading' && field.type !== 'checkbox' ? (
    <Label className="text-sm">
      {field.label}
      {field.required && <span className="text-destructive ml-1">*</span>}
    </Label>
  ) : null;

  let input: React.ReactNode;
  const strValue = typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));

  switch (field.type) {
    case 'text':
    case 'email':
    case 'password':
      input = (
        <Input
          type={field.type === 'email' ? 'email' : field.type === 'password' ? 'password' : 'text'}
          value={strValue}
          onChange={e => handleChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
          autoComplete={field.type === 'password' ? 'new-password' : undefined}
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
              <SelectTrigger className={error ? 'border-destructive' : ''}>
                <SelectValue placeholder={parentMissing ? 'Select parent field first' : (field.placeholder || 'Select...')} />
              </SelectTrigger>
              <SelectContent>
                {dynamicOptions.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    {parentMissing ? 'Select parent field first' : 'No options available'}
                  </SelectItem>
                ) : (
                  dynamicOptions.map((o: { value: string; label: string }) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {parentMissing && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Please select the parent field first
              </p>
            )}
          </div>
        );
      } else {
        input = (
          <Select value={strValue} onValueChange={handleChange} disabled={readOnly}>
            <SelectTrigger className={error ? 'border-destructive' : ''}>
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
        />
      );
      break;
    case 'paragraph':
      return (
        <div className="p-3 rounded bg-muted/30 text-sm text-muted-foreground">
          {field.defaultValue || 'Static text block'}
        </div>
      );
    default:
      input = (
        <Input
          type="text"
          value={strValue}
          onChange={e => handleChange(e.target.value)}
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
function FileUploadField({ field, value, onChange, readOnly, error }: {
  field: RegField;
  value: unknown;
  onChange: (val: unknown) => void;
  readOnly?: boolean;
  error?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fileData = value && typeof value === 'object' && 'name' in (value as Record<string, unknown>)
    ? value as { name: string; path: string; size: number }
    : null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error || 'Invalid file');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const filePath = `registrations/${crypto.randomUUID()}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('secure-documents')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        toast.error('Upload failed: ' + uploadError.message);
        return;
      }

      onChange({
        name: file.name,
        path: filePath,
        size: file.size,
        type: file.type,
      });
      toast.success(`${file.name} uploaded`);
    } catch (err) {
      console.error('File upload error:', err);
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (fileData?.path) {
      try {
        await supabase.storage.from('secure-documents').remove([fileData.path]);
      } catch {}
    }
    onChange('');
  };

  if (fileData) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border p-2 bg-muted/30">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm truncate flex-1">{fileData.name}</span>
        {!readOnly && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handleRemove}>
            <X className="h-3 w-3" />
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
        accept={ACCEPT_STRING}
        onChange={handleFileSelect}
        className="hidden"
        id={`file-${field.fieldName}`}
        disabled={readOnly || uploading}
      />
      <Button
        type="button"
        variant="outline"
        className={`w-full ${error ? 'border-destructive' : ''}`}
        onClick={() => inputRef.current?.click()}
        disabled={readOnly || uploading}
      >
        {uploading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
        ) : (
          <><Upload className="h-4 w-4 mr-2" />Choose File</>
        )}
      </Button>
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
        {parentMissing && <p className="text-xs text-muted-foreground">Select parent field first</p>}
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
        {parentMissing && <p className="text-xs text-muted-foreground">Select parent field first</p>}
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
          <SelectValue placeholder={parentMissing ? 'Select parent field first' : (field.placeholder || 'Select...')} />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 && (
            <SelectItem value="__empty" disabled>
              {parentMissing ? 'Select parent field first' : 'No options available'}
            </SelectItem>
          )}
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {parentMissing && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Please select the parent field first
        </p>
      )}
    </div>
  );
}
