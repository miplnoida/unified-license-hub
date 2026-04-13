import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { RegStep, RegField } from '@/types/registrationForm';

interface Props {
  step: RegStep;
  data: Record<string, any>;
  errors: Record<string, string>;
  onChange: (fieldName: string, value: any) => void;
  readOnly?: boolean;
}

/**
 * Renders a single registration step using the builder's row → column → field
 * grid layout. Each column's `span` (out of 12) maps to CSS grid column spans.
 */
export function RegistrationStepRenderer({ step, data, errors, onChange, readOnly }: Props) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {step.description && (
          <p className="text-sm text-muted-foreground mb-4">{step.description}</p>
        )}

        {step.rows.map(row => (
          <div
            key={row.id}
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(12, minmax(0, 1fr))`,
            }}
          >
            {row.columns.map((col, colIdx) => (
              <div key={colIdx} style={{ gridColumn: `span ${col.span}` }}>
                {col.field ? (
                  <InteractiveField
                    field={col.field}
                    value={data[col.field.fieldName] ?? col.field.defaultValue ?? ''}
                    error={errors[col.field.fieldName]}
                    onChange={onChange}
                    readOnly={readOnly}
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
  value: any;
  error?: string;
  onChange: (fieldName: string, value: any) => void;
  readOnly?: boolean;
}

function InteractiveField({ field, value, error, onChange, readOnly }: FieldProps) {
  const handleChange = (val: any) => onChange(field.fieldName, val);

  const labelEl = field.type !== 'paragraph' && field.type !== 'checkbox' ? (
    <Label className="text-sm">
      {field.label}
      {field.required && <span className="text-destructive ml-1">*</span>}
    </Label>
  ) : null;

  let input: React.ReactNode;

  switch (field.type) {
    case 'text':
    case 'email':
      input = (
        <Input
          type={field.type === 'email' ? 'email' : 'text'}
          value={value}
          onChange={e => handleChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
          className={error ? 'border-destructive' : ''}
        />
      );
      break;
    case 'phone':
      input = (
        <Input
          type="tel"
          value={value}
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
          value={value}
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
          value={value}
          onChange={e => handleChange(e.target.value)}
          disabled={readOnly}
          className={error ? 'border-destructive' : ''}
        />
      );
      break;
    case 'textarea':
      input = (
        <Textarea
          value={value}
          onChange={e => handleChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          disabled={readOnly}
          className={error ? 'border-destructive' : ''}
        />
      );
      break;
    case 'select':
      input = (
        <Select value={value} onValueChange={handleChange} disabled={readOnly}>
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
      break;
    case 'multi_select':
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
      input = (
        <div className="space-y-1.5">
          {(field.options || []).map(opt => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={field.fieldName}
                value={opt}
                checked={value === opt}
                onChange={() => handleChange(opt)}
                disabled={readOnly}
                className="accent-primary"
              />
              {opt}
            </label>
          ))}
        </div>
      );
      break;
    case 'file':
      input = (
        <Input
          type="file"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleChange(file.name);
          }}
          disabled={readOnly}
          className={error ? 'border-destructive' : ''}
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
          value={value}
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
