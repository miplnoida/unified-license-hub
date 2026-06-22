// ─── Validation Rules ───
export interface ValidationRules {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
  // File validation
  allowedTypes?: string[];   // e.g. ['.pdf', '.jpg']
  minSizeKB?: number;
  maxSizeMB?: number;
}

// ─── Conditional Logic ───
export interface ConditionalRule {
  fieldId: string;           // The field to watch
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  value?: string;
  action: 'show' | 'hide' | 'require' | 'unrequire';
}

// ─── Form Field ───
export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  fieldName: string;         // system key e.g. "business_name"
  required: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  options?: string[];        // For radio, select, checkbox, multi-select
  content?: string;          // For paragraph/static text
  validation?: ValidationRules;
  conditionalLogic?: ConditionalRule[];
  // Table/grid columns
  tableColumns?: TableColumn[];
  // Calculated field
  calculatedExpression?: string; // e.g. "{field_a} + {field_b}"
  // Data source for options (select, multi_select, radio, checkbox)
  optionSource?: 'manual' | 'master_data';
  masterDataTypeCode?: string; // code from master_data_types table
  masterDataParentField?: string; // fieldName of the parent cascading field
  // Heading level for heading-type fields (1-6)
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  // Row layout: width of this field on a 4-column grid (1=quarter, 2=half, 3=three-quarters, 4=full).
  // Default behavior (undefined) = 2 (half width), preserving the legacy 2-column layout.
  colSpan?: 1 | 2 | 3 | 4;
  // When true, this field starts a new row regardless of remaining space in the previous row.
  newRow?: boolean;
  // File fields only: when true, the field accepts many files (bulk upload) and stores an array.
  // Each file becomes its own versioned document group. Default (undefined/false) keeps the
  // existing single-file behavior unchanged.
  allowMultiple?: boolean;
}

export type FieldType =
  | 'text'
  | 'number'
  | 'decimal'
  | 'email'
  | 'phone'
  | 'date'
  | 'textarea'
  | 'select'
  | 'multi_select'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'paragraph'
  | 'heading'
  | 'table'
  | 'calculated';

export interface TableColumn {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'file';
  options?: string[];        // For select columns
  validation?: ValidationRules; // Per-column validation
}

// ─── Form Section ───
export interface FormSection {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  isRepeatable: boolean;
  /**
   * Source of truth for layout. Each row holds `columns` slots (1..4) where
   * each slot is either a FormField or null (empty placeholder).
   */
  rows?: FormRow[];
  /**
   * Derived flat list of all fields in this section (in row order).
   * Kept in sync with `rows` via `syncSectionFields`. Used for validation,
   * conditional-logic resolution, progress, and normalized persistence.
   */
  fields: FormField[];
  conditionalLogic?: ConditionalRule[];
}

// ─── Legacy support ───
export interface FileValidation {
  allowedTypes?: string[];
  minSizeKB?: number;
  maxSizeMB?: number;
}

export interface FormRow {
  id: string;
  columns: 1 | 2 | 3 | 4;
  fields: (FormField | null)[];
}
