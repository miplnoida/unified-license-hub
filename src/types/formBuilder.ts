export interface FileValidation {
  allowedTypes?: string[];   // e.g. ['.pdf', '.jpg', '.png']
  minSizeKB?: number;
  maxSizeMB?: number;
}

export interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[]; // For radio, select, checkbox
  content?: string;   // For paragraph/text block
  fileValidation?: FileValidation; // For file upload fields
}

export interface FormRow {
  id: string;
  columns: 1 | 2 | 3 | 4;
  fields: (FormField | null)[]; // Length = columns, null = empty slot
}
