/**
 * Safely transform a form field when its type changes.
 * Preserves common properties (id, label, name, required, helpText) and resets
 * properties that don't apply to the new type, so the form schema stays valid.
 */

const CHOICE_TYPES = new Set(['select', 'multi_select', 'checkbox', 'radio']);
const TEXTUAL_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'password']);
const NUMERIC_TYPES = new Set(['number', 'decimal']);
const PATTERN_TYPES = new Set(['text', 'email', 'phone', 'password']);
const PLACEHOLDER_TYPES = new Set([
  'text', 'textarea', 'email', 'phone', 'password', 'number', 'decimal', 'date', 'select', 'multi_select',
]);
const PLACEHOLDER_TYPES = new Set([
  'text', 'textarea', 'email', 'phone', 'number', 'decimal', 'date', 'select', 'multi_select',
]);

export interface AnyField {
  type: string;
  options?: string[];
  defaultValue?: string;
  placeholder?: string;
  validation?: Record<string, any>;
  content?: string;
  tableColumns?: any[];
  calculatedExpression?: string;
  optionSource?: string;
  masterDataTypeCode?: string;
  masterDataParentField?: string;
  dataSource?: string;
  dependsOn?: string;
  [key: string]: any;
}

/**
 * Returns true if a type change is "destructive" — i.e. config from the old
 * type cannot be carried over and the user should be warned.
 */
export function isDestructiveTypeChange(oldType: string, newType: string): boolean {
  if (oldType === newType) return false;
  const oldIsChoice = CHOICE_TYPES.has(oldType);
  const newIsChoice = CHOICE_TYPES.has(newType);
  if (oldIsChoice && !newIsChoice) return true;          // losing options
  if (oldType === 'file' && newType !== 'file') return true;
  if (oldType === 'table' && newType !== 'table') return true;
  if (oldType === 'paragraph' && newType !== 'paragraph') return true;
  if (NUMERIC_TYPES.has(oldType) && !NUMERIC_TYPES.has(newType)) return true;
  return false;
}

/**
 * Build a sanitized partial update reflecting a type change. Caller should
 * spread this into the existing field. All properties returned are explicitly
 * set (including `undefined`) so callers using `{ ...field, ...result }` will
 * clear stale values.
 */
export function buildTypeChangePatch(
  field: AnyField,
  newType: string,
): Record<string, any> {
  const patch: Record<string, any> = { type: newType };
  const oldType = field.type;
  if (oldType === newType) return patch;

  const newIsChoice = CHOICE_TYPES.has(newType);
  const oldIsChoice = CHOICE_TYPES.has(oldType);

  // Options: keep when going choice→choice; init when entering choice; drop otherwise
  if (newIsChoice) {
    if (!field.options || field.options.length === 0) {
      patch.options = ['Option 1'];
    }
  } else {
    if (oldIsChoice) {
      patch.options = undefined;
      patch.optionSource = undefined;
      patch.masterDataTypeCode = undefined;
      patch.masterDataParentField = undefined;
      patch.dataSource = undefined;
      patch.dependsOn = undefined;
    }
  }

  // Default value: preserve only when both old and new types accept the same shape
  if (field.defaultValue !== undefined && field.defaultValue !== '') {
    const defStillValid =
      (TEXTUAL_TYPES.has(oldType) && TEXTUAL_TYPES.has(newType)) ||
      (NUMERIC_TYPES.has(oldType) && NUMERIC_TYPES.has(newType)) ||
      (oldType === 'date' && newType === 'date');
    if (!defStillValid) patch.defaultValue = '';
  }

  // Placeholder: only meaningful for input-style types
  if (!PLACEHOLDER_TYPES.has(newType) && field.placeholder) {
    patch.placeholder = '';
  }

  // Validation: prune rules that no longer apply
  if (field.validation) {
    const v = { ...field.validation };
    if (!TEXTUAL_TYPES.has(newType)) {
      delete v.minLength; delete v.maxLength;
    }
    if (!NUMERIC_TYPES.has(newType)) {
      delete v.min; delete v.max;
    }
    if (!PATTERN_TYPES.has(newType)) {
      delete v.pattern; delete v.patternMessage;
    }
    if (newType !== 'file') {
      delete v.allowedTypes; delete v.minSizeKB; delete v.maxSizeMB;
    }
    patch.validation = v;
  }

  // Type-specific containers
  if (newType !== 'paragraph') patch.content = undefined;
  if (newType !== 'table') patch.tableColumns = undefined;
  if (newType !== 'calculated') patch.calculatedExpression = undefined;

  return patch;
}
