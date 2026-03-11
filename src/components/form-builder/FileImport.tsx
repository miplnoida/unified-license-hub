import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, FileText, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { FormSection, FormField, FieldType } from '@/types/formBuilder';

function toFieldName(label: string): string {
  return label.replace(/[^a-z0-9]/gi, '_').toLowerCase().replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function inferFieldType(header: string, sampleValues: string[]): FieldType {
  const h = header.toLowerCase();
  if (h.includes('email') || h.includes('e-mail')) return 'email';
  if (h.includes('phone') || h.includes('tel') || h.includes('mobile') || h.includes('fax')) return 'phone';
  if (h.includes('date') || h.includes('dob') || h.includes('birth') || h.includes('expir')) return 'date';
  if (h.includes('description') || h.includes('comment') || h.includes('address') || h.includes('remarks') || h.includes('notes')) return 'textarea';
  if (h.includes('upload') || h.includes('attach') || h.includes('document') || h.includes('file')) return 'file';

  // Check sample values
  const nonEmpty = sampleValues.filter(v => v && v.trim());
  if (nonEmpty.length > 0) {
    const allNumbers = nonEmpty.every(v => !isNaN(Number(v)));
    if (allNumbers) {
      const hasDecimal = nonEmpty.some(v => v.includes('.'));
      return hasDecimal ? 'decimal' : 'number';
    }
    const datePattern = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/;
    if (nonEmpty.every(v => datePattern.test(v.trim()))) return 'date';
    // If few unique values, could be select
    const unique = [...new Set(nonEmpty)];
    if (unique.length <= 6 && unique.length < nonEmpty.length * 0.5) return 'select';
  }
  return 'text';
}

async function parseExcel(file: File): Promise<FormSection[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sections: FormSection[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (data.length === 0) continue;

    const headers = data[0].map(h => String(h).trim()).filter(Boolean);
    if (headers.length === 0) continue;

    const dataRows = data.slice(1).filter(row => row.some(cell => String(cell).trim()));
    
    // Check if this looks like a field definition template (columns: Label, Type, Required, Options)
    const headersLower = headers.map(h => h.toLowerCase());
    const isTemplate = headersLower.includes('label') || headersLower.includes('field name') || headersLower.includes('field label');
    
    if (isTemplate) {
      // Template mode: each row defines a field
      const labelIdx = headersLower.findIndex(h => h.includes('label') || h.includes('field name') || h.includes('field label'));
      const typeIdx = headersLower.findIndex(h => h === 'type' || h === 'field type');
      const reqIdx = headersLower.findIndex(h => h.includes('required') || h.includes('mandatory'));
      const optIdx = headersLower.findIndex(h => h.includes('option') || h.includes('choices'));
      const helpIdx = headersLower.findIndex(h => h.includes('help') || h.includes('hint') || h.includes('description'));
      const sectionIdx = headersLower.findIndex(h => h.includes('section') || h.includes('group'));

      const sectionMap = new Map<string, FormField[]>();

      for (const row of dataRows) {
        const label = String(row[labelIdx] || '').trim();
        if (!label) continue;

        const rawType = typeIdx >= 0 ? String(row[typeIdx] || '').trim().toLowerCase() : '';
        const required = reqIdx >= 0 ? ['yes', 'true', '1', 'y'].includes(String(row[reqIdx] || '').trim().toLowerCase()) : false;
        const options = optIdx >= 0 ? String(row[optIdx] || '').split(/[,;|]/).map(o => o.trim()).filter(Boolean) : undefined;
        const helpText = helpIdx >= 0 ? String(row[helpIdx] || '').trim() || undefined : undefined;
        const sectionName = sectionIdx >= 0 ? String(row[sectionIdx] || '').trim() || sheetName : sheetName;

        let fieldType: FieldType = 'text';
        const typeMap: Record<string, FieldType> = {
          text: 'text', number: 'number', decimal: 'decimal', email: 'email',
          phone: 'phone', date: 'date', textarea: 'textarea', 'text area': 'textarea',
          select: 'select', dropdown: 'select', 'multi-select': 'multi_select', 'multi select': 'multi_select',
          checkbox: 'checkbox', radio: 'radio', file: 'file', upload: 'file',
          paragraph: 'paragraph', table: 'table', calculated: 'calculated',
        };
        fieldType = typeMap[rawType] || 'text';

        const field: FormField = {
          id: crypto.randomUUID(),
          type: fieldType,
          label,
          fieldName: toFieldName(label),
          required,
          helpText,
          options: options && options.length > 0 ? options : (['radio', 'select', 'checkbox', 'multi_select'].includes(fieldType) ? ['Option 1', 'Option 2'] : undefined),
        };

        if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, []);
        sectionMap.get(sectionName)!.push(field);
      }

      let sortOrder = 0;
      for (const [title, fields] of sectionMap) {
        sections.push({ id: crypto.randomUUID(), title, sortOrder: sortOrder++, isRepeatable: false, fields });
      }
    } else {
      // Auto-detect mode: each column header becomes a field
      const fields: FormField[] = headers.map((header, colIdx) => {
        const samples = dataRows.slice(0, 10).map(row => String(row[colIdx] || ''));
        const fieldType = inferFieldType(header, samples);
        
        let options: string[] | undefined;
        if (fieldType === 'select') {
          const unique = [...new Set(dataRows.map(r => String(r[colIdx] || '').trim()).filter(Boolean))];
          options = unique.slice(0, 20);
        }

        return {
          id: crypto.randomUUID(),
          type: fieldType,
          label: header,
          fieldName: toFieldName(header),
          required: false,
          options,
        };
      });

      sections.push({
        id: crypto.randomUUID(),
        title: sheetName,
        sortOrder: sections.length,
        isRepeatable: false,
        fields,
      });
    }
  }

  return sections;
}

async function parseWord(file: File): Promise<FormSection[]> {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const html = result.value;

  // Parse HTML to extract structure
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const elements = Array.from(doc.body.children);

  const sections: FormSection[] = [];
  let currentSection: FormSection | null = null;

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim();
    if (!text) continue;

    // Headings become sections
    if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
      if (currentSection && currentSection.fields.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        id: crypto.randomUUID(),
        title: text,
        sortOrder: sections.length,
        isRepeatable: false,
        fields: [],
      };
      continue;
    }

    // Ensure we have a section
    if (!currentSection) {
      currentSection = {
        id: crypto.randomUUID(),
        title: 'Section 1',
        sortOrder: 0,
        isRepeatable: false,
        fields: [],
      };
    }

    // Tables: each row after header becomes a field definition or each column header becomes a field
    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'));
      if (rows.length >= 2) {
        const headerCells = Array.from(rows[0].querySelectorAll('th, td')).map(c => (c.textContent || '').trim());
        const headersLower = headerCells.map(h => h.toLowerCase());
        const hasLabelCol = headersLower.some(h => h.includes('label') || h.includes('field'));

        if (hasLabelCol) {
          const labelIdx = headersLower.findIndex(h => h.includes('label') || h.includes('field'));
          const typeIdx = headersLower.findIndex(h => h === 'type');
          const reqIdx = headersLower.findIndex(h => h.includes('required'));

          for (let r = 1; r < rows.length; r++) {
            const cells = Array.from(rows[r].querySelectorAll('td')).map(c => (c.textContent || '').trim());
            const label = cells[labelIdx] || '';
            if (!label) continue;
            const rawType = typeIdx >= 0 ? cells[typeIdx]?.toLowerCase() || 'text' : 'text';
            const typeMap: Record<string, FieldType> = { text: 'text', number: 'number', email: 'email', date: 'date', textarea: 'textarea', select: 'select', dropdown: 'select', checkbox: 'checkbox', radio: 'radio', file: 'file' };
            currentSection.fields.push({
              id: crypto.randomUUID(),
              type: typeMap[rawType] || 'text',
              label,
              fieldName: toFieldName(label),
              required: reqIdx >= 0 ? ['yes', 'y', 'true'].includes((cells[reqIdx] || '').toLowerCase()) : false,
            });
          }
        } else {
          // Treat column headers as fields
          for (const header of headerCells) {
            if (!header) continue;
            currentSection.fields.push({
              id: crypto.randomUUID(),
              type: inferFieldType(header, []),
              label: header,
              fieldName: toFieldName(header),
              required: false,
            });
          }
        }
      }
      continue;
    }

    // Lists: items could be field labels or select options
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.querySelectorAll('li')).map(li => (li.textContent || '').trim()).filter(Boolean);
      // If items look like "Label: description" pattern, create fields
      const colonPattern = items.filter(i => i.includes(':'));
      if (colonPattern.length > items.length * 0.5) {
        for (const item of items) {
          const [label] = item.split(':');
          if (!label.trim()) continue;
          currentSection.fields.push({
            id: crypto.randomUUID(),
            type: inferFieldType(label.trim(), []),
            label: label.trim(),
            fieldName: toFieldName(label.trim()),
            required: false,
          });
        }
      } else {
        // Treat as individual text fields
        for (const item of items) {
          currentSection.fields.push({
            id: crypto.randomUUID(),
            type: 'text',
            label: item,
            fieldName: toFieldName(item),
            required: false,
          });
        }
      }
      continue;
    }

    // Paragraphs: if short, could be a field label; if long, a paragraph field
    if (tag === 'p') {
      if (text.length > 200) {
        currentSection.fields.push({
          id: crypto.randomUUID(),
          type: 'paragraph',
          label: 'Information',
          fieldName: toFieldName('info_' + currentSection.fields.length),
          required: false,
          content: text,
        });
      } else if (text.endsWith(':') || text.endsWith('?') || text.length < 80) {
        const label = text.replace(/:$/, '').trim();
        currentSection.fields.push({
          id: crypto.randomUUID(),
          type: inferFieldType(label, []),
          label,
          fieldName: toFieldName(label),
          required: text.includes('*') || text.toLowerCase().includes('required'),
        });
      }
    }
  }

  if (currentSection && currentSection.fields.length > 0) {
    sections.push(currentSection);
  }

  // Fallback: if no sections parsed, create one with a note
  if (sections.length === 0) {
    sections.push({
      id: crypto.randomUUID(),
      title: 'Imported Content',
      sortOrder: 0,
      isRepeatable: false,
      fields: [{
        id: crypto.randomUUID(),
        type: 'paragraph',
        label: 'Imported Content',
        fieldName: 'imported_content',
        required: false,
        content: doc.body.textContent?.trim() || 'No parseable content found.',
      }],
    });
  }

  return sections;
}

interface FileImportProps {
  onImport: (sections: FormSection[]) => void;
}

export function FileImportDialog({ onImport }: FileImportProps) {
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<FormSection[] | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setPreview(null);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let sections: FormSection[];

      if (ext === 'xlsx' || ext === 'xls') {
        sections = await parseExcel(file);
      } else if (ext === 'docx') {
        sections = await parseWord(file);
      } else {
        toast.error('Unsupported file type. Please upload .xlsx or .docx files.');
        setParsing(false);
        return;
      }

      if (sections.length === 0 || sections.every(s => s.fields.length === 0)) {
        toast.error('No form fields could be detected in the uploaded file.');
        setParsing(false);
        return;
      }

      setPreview(sections);
    } catch (err) {
      console.error('File parse error:', err);
      toast.error('Failed to parse the uploaded file. Please check the format.');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    onImport(preview);
    toast.success(`Imported ${preview.reduce((a, s) => a + s.fields.length, 0)} fields from ${preview.length} section(s).`);
    setOpen(false);
    setPreview(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const totalFields = preview?.reduce((a, s) => a + s.fields.length, 0) || 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-1" /> Import File
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPreview(null); setFileName(''); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Form from File</DialogTitle>
            <DialogDescription>
              Upload an Excel (.xlsx) or Word (.docx) file to auto-generate form fields.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Upload area */}
            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.docx"
                className="hidden"
                onChange={handleFile}
              />
              {parsing ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Parsing {fileName}...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-green-600" />
                    <FileText className="h-8 w-8 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Click to upload or drag and drop</p>
                    <p className="text-xs text-muted-foreground mt-1">.xlsx or .docx files supported</p>
                  </div>
                </div>
              )}
            </div>

            {/* Format guide */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Supported formats:</p>
                  <p><strong>Excel (Template):</strong> Columns: Label, Type, Required (Yes/No), Options (comma-separated), Section, Help Text</p>
                  <p><strong>Excel (Auto-detect):</strong> Column headers become field labels, types inferred from data</p>
                  <p><strong>Word:</strong> Headings → sections, tables/lists → fields, paragraphs → text fields or content</p>
                </div>
              </div>
            </div>

            {/* Preview */}
            {preview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Preview</h4>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{preview.length} section(s)</Badge>
                    <Badge variant="secondary">{totalFields} field(s)</Badge>
                  </div>
                </div>

                <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                  {preview.map(section => (
                    <div key={section.id} className="p-3">
                      <p className="text-xs font-semibold mb-1.5">{section.title}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {section.fields.map(field => (
                          <Badge key={field.id} variant="outline" className="text-[10px] font-normal">
                            {field.label}
                            <span className="text-muted-foreground ml-1">({field.type})</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={!preview}>
              Import {totalFields} Field(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
