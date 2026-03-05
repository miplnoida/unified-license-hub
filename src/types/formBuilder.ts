export interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[]; // For radio, select, checkbox
  content?: string;   // For paragraph/text block
}

export interface FormRow {
  id: string;
  columns: 1 | 2 | 3 | 4;
  fields: (FormField | null)[]; // Length = columns, null = empty slot
}
