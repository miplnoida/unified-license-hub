// ─── Registration Form Builder Types ───

export type RegFieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'phone'
  | 'password'
  | 'confirm_password'
  | 'date'
  | 'textarea'
  | 'select'
  | 'multi_select'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'signature'
  | 'paragraph'
  | 'heading'
  | 'static_text'
  | 'section_title'
  | 'divider'
  | 'info';

export interface RegFieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
  /** When true, this field's value must be unique across registration applicant names. */
  uniqueApplicantName?: boolean;
  // File validation
  allowedTypes?: string[];
  minSizeKB?: number;
  maxSizeMB?: number;
}

export interface RegConditionalRule {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty';
  value?: string;
  action: 'show' | 'hide';
}

export type RegDataSource = 'sector' | 'sub_sector' | 'category' | 'country' | 'state';

export interface RegField {
  id: string;
  type: RegFieldType;
  label: string;
  fieldName: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  options?: string[];
  dataSource?: RegDataSource;
  dependsOn?: string; // fieldName of the parent cascading field
  // Generic master data support (shared with main form builder)
  optionSource?: 'manual' | 'legacy_data_source' | 'master_data';
  masterDataTypeCode?: string;
  masterDataParentField?: string;
  validation?: RegFieldValidation;
  conditionalLogic?: RegConditionalRule[];
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  content?: string;
  /** For 'confirm_password' fields: the fieldName of the password field to match. */
  matchField?: string;
}

export interface RegColumn {
  span: number; // out of 12
  field: RegField | null;
}

export interface RegRow {
  id: string;
  label?: string;
  columns: RegColumn[];
}

export interface RegStep {
  id: string;
  title: string;
  description?: string;
  rows: RegRow[];
  /** When true, the step renders as multiple repeatable entries with "Add another" / "Remove" controls. */
  isRepeatable?: boolean;
  /** Label shown above each repeated entry (e.g. "Qualification"). Defaults to the step title. */
  repeatLabel?: string;
}


export type RegFormSchema = RegStep[];

// Preset column layouts
export const COLUMN_PRESETS = [
  { label: '1 Column', spans: [12] },
  { label: '2 Columns', spans: [6, 6] },
  { label: '3 Columns', spans: [4, 4, 4] },
  { label: '4 Columns', spans: [3, 3, 3, 3] },
  { label: '1/3 + 2/3', spans: [4, 8] },
  { label: '2/3 + 1/3', spans: [8, 4] },
] as const;

export const REG_FIELD_TYPES: { type: RegFieldType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone' },
  { type: 'password', label: 'Password' },
  { type: 'confirm_password', label: 'Confirm Password' },
  { type: 'date', label: 'Date' },
  { type: 'textarea', label: 'Text Area' },
  { type: 'select', label: 'Dropdown' },
  { type: 'multi_select', label: 'Multi Select' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'radio', label: 'Radio' },
  { type: 'file', label: 'File Upload' },
  { type: 'signature', label: 'Signature (Image)' },
  { type: 'paragraph', label: 'Static Text' },
  { type: 'heading', label: 'Heading' },
  { type: 'static_text', label: 'Static Text Block' },
  { type: 'section_title', label: 'Section Title' },
  { type: 'divider', label: 'Divider' },
  { type: 'info', label: 'Info Text' },
];
