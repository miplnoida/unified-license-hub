import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Upload, FileSpreadsheet, FileText, Loader2, AlertCircle,
  Pencil, Trash2, Calculator, ShieldCheck, GripVertical,
  Layers, Link2, ArrowRight, ArrowLeft, CheckSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import type { FormSection, FormField, FieldType, ValidationRules } from '@/types/formBuilder';

// ─── Helpers ───

function toFieldName(label: string): string {
  return label.replace(/[^a-z0-9]/gi, '_').toLowerCase().replace(/_+/g, '_').replace(/^_|_$/g, '');
}

const FIELD_TYPES: FieldType[] = [
  'text', 'number', 'decimal', 'email', 'phone', 'date',
  'textarea', 'select', 'multi_select', 'checkbox', 'radio',
  'file', 'paragraph', 'table', 'calculated',
];

function inferFieldType(header: string, sampleValues: string[]): FieldType {
  const h = header.toLowerCase();
  if (h.includes('email') || h.includes('e-mail')) return 'email';
  if (h.includes('phone') || h.includes('tel') || h.includes('mobile') || h.includes('fax')) return 'phone';
  if (h.includes('date') || h.includes('dob') || h.includes('birth') || h.includes('expir')) return 'date';
  if (h.includes('description') || h.includes('comment') || h.includes('address') || h.includes('remarks') || h.includes('notes')) return 'textarea';
  if (h.includes('upload') || h.includes('attach') || h.includes('document') || h.includes('file')) return 'file';

  const nonEmpty = sampleValues.filter(v => v && v.trim());
  if (nonEmpty.length > 0) {
    const allNumbers = nonEmpty.every(v => !isNaN(Number(v)));
    if (allNumbers) {
      return nonEmpty.some(v => v.includes('.')) ? 'decimal' : 'number';
    }
    const datePattern = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/;
    if (nonEmpty.every(v => datePattern.test(v.trim()))) return 'date';
    const unique = [...new Set(nonEmpty)];
    if (unique.length <= 6 && unique.length < nonEmpty.length * 0.5) return 'select';
  }
  return 'text';
}

// ─── Formula Detection ───

interface FormulaInfo {
  raw: string;
  expression: string;
  referencedFields: string[];
  crossSheetRefs: CrossSheetRef[];
}

export interface CrossSheetRef {
  sourceSheet: string;
  sourceField: string;
  targetSheet: string;
  targetField: string;
  formula: string;
}

function convertFormula(
  rawFormula: string,
  colToFieldMap: Map<string, string>,
  currentSheet: string
): FormulaInfo {
  const referencedFields: string[] = [];
  const crossSheetRefs: CrossSheetRef[] = [];
  let expression = rawFormula.replace(/=?\s*/, '');

  // Detect cross-sheet references like Sheet2!A1, 'Sheet Name'!B2
  expression = expression.replace(/'?([^'!]+)'?!(\$?[A-Z]+\$?\d+)/gi, (match, sheet, cellRef) => {
    const colLetters = cellRef.replace(/[\$\d]/g, '').toUpperCase();
    const fieldName = colToFieldMap.get(colLetters) || `${toFieldName(sheet)}_${colLetters.toLowerCase()}`;
    const ref: CrossSheetRef = {
      sourceSheet: currentSheet,
      sourceField: '', // will be set by caller
      targetSheet: sheet.trim(),
      targetField: fieldName,
      formula: rawFormula,
    };
    crossSheetRefs.push(ref);
    return `{${toFieldName(sheet)}.${fieldName}}`;
  });

  // Same-sheet cell references
  expression = expression.replace(/\$?([A-Z]+)\$?\d+/gi, (match) => {
    const colLetters = match.replace(/[\$\d]/g, '').toUpperCase();
    const fieldName = colToFieldMap.get(colLetters);
    if (fieldName) {
      if (!referencedFields.includes(fieldName)) referencedFields.push(fieldName);
      return `{${fieldName}}`;
    }
    return match;
  });

  // Handle SUM(A1:B1)
  expression = expression.replace(/SUM\(([^)]+)\)/gi, (_, range: string) => {
    const parts = range.split(':');
    if (parts.length === 2) {
      const startCol = parts[0].replace(/[\$\d]/g, '').toUpperCase();
      const endCol = parts[1].replace(/[\$\d]/g, '').toUpperCase();
      const allCols = Array.from(colToFieldMap.keys()).sort();
      const startIdx = allCols.indexOf(startCol);
      const endIdx = allCols.indexOf(endCol);
      if (startIdx >= 0 && endIdx >= 0) {
        const sumFields = allCols.slice(startIdx, endIdx + 1)
          .map(c => colToFieldMap.get(c))
          .filter(Boolean);
        sumFields.forEach(f => { if (f && !referencedFields.includes(f)) referencedFields.push(f); });
        return sumFields.map(f => `{${f}}`).join(' + ');
      }
    }
    return range;
  });

  // Handle AVERAGE
  expression = expression.replace(/AVERAGE\(([^)]+)\)/gi, (_, range: string) => {
    const parts = range.split(':');
    if (parts.length === 2) {
      const startCol = parts[0].replace(/[\$\d]/g, '').toUpperCase();
      const endCol = parts[1].replace(/[\$\d]/g, '').toUpperCase();
      const allCols = Array.from(colToFieldMap.keys()).sort();
      const startIdx = allCols.indexOf(startCol);
      const endIdx = allCols.indexOf(endCol);
      if (startIdx >= 0 && endIdx >= 0) {
        const avgFields = allCols.slice(startIdx, endIdx + 1)
          .map(c => colToFieldMap.get(c))
          .filter(Boolean);
        avgFields.forEach(f => { if (f && !referencedFields.includes(f)) referencedFields.push(f); });
        const count = avgFields.length;
        return `(${avgFields.map(f => `{${f}}`).join(' + ')}) / ${count}`;
      }
    }
    return range;
  });

  return { raw: rawFormula, expression, referencedFields, crossSheetRefs };
}

function colLetterFromIndex(idx: number): string {
  let result = '';
  let n = idx;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

// ─── Validation Extraction ───

function extractValidation(header: string, sampleValues: string[], fieldType: FieldType): ValidationRules | undefined {
  const rules: ValidationRules = {};
  const h = header.toLowerCase();
  if (h.includes('required') || h.includes('*')) rules.required = true;
  if (fieldType === 'email') {
    rules.pattern = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
    rules.patternMessage = 'Enter a valid email address';
  }
  if (fieldType === 'phone') {
    rules.pattern = '^[+]?[\\d\\s()-]{7,20}$';
    rules.patternMessage = 'Enter a valid phone number';
  }
  const nonEmpty = sampleValues.filter(v => v && v.trim());
  if (fieldType === 'number' || fieldType === 'decimal') {
    const nums = nonEmpty.map(Number).filter(n => !isNaN(n));
    if (nums.length >= 3) {
      rules.min = Math.min(...nums);
      rules.max = Math.max(...nums);
    }
  }
  if (fieldType === 'text' || fieldType === 'textarea') {
    const lengths = nonEmpty.map(v => v.length);
    if (lengths.length >= 3) {
      const maxLen = Math.max(...lengths);
      if (maxLen > 0) rules.maxLength = Math.min(maxLen * 2, 5000);
    }
  }
  return Object.keys(rules).length > 0 ? rules : undefined;
}

// ─── Types for multi-sheet parsing ───

export interface SheetParseResult {
  sheetName: string;
  formName: string;
  sections: FormSection[];
  fieldCount: number;
  selected: boolean;
  crossSheetRefs: CrossSheetRef[];
}

export interface MultiSheetParseResult {
  fileName: string;
  sheets: SheetParseResult[];
  allCrossSheetRefs: CrossSheetRef[];
}

// ─── Excel Multi-Sheet Parser ───

// ─── Financial Statement Layout Detection ───

interface FinancialLayout {
  titleRow: number;       // Row with the form title (e.g., "STATEMENT OF FINANCIAL POSITION")
  formTitle: string;
  headerStartRow: number; // First row of column headers (e.g., row 13)
  headerEndRow: number;   // Last row of column headers (e.g., row 14)
  dataStartRow: number;   // First data row (e.g., row 16)
  labelCol: number;       // Column index for row labels (B=1 or C=2)
  numberCol: number;      // Column index for line numbers (A=0 or B=1)
  dataColStart: number;   // First data column index
  dataColEnd: number;     // Last data column index
  columnHeaders: string[];// Headers for each data column
}

function detectFinancialLayout(sheet: any, data: string[][], XLSX: any): FinancialLayout | null {
  if (data.length < 10) return null;

  // Check for "Go to TOC" or similar navigation in row 1
  const row1 = data[0]?.map(c => String(c || '').trim()) || [];
  const hasNavLink = row1.some(v => /go to toc|toc|table of content/i.test(v));
  // Also check for formula objects or cover references in early rows
  const hasMetadata = data.slice(0, 8).some(row =>
    row.some(c => {
      const v = String(c || '');
      return /Cover!|financial year|period end/i.test(v);
    })
  );

  if (!hasNavLink && !hasMetadata) return null;

  // Find form title (look for keywords in rows 8-12)
  let formTitle = '';
  let titleRow = -1;
  for (let r = 7; r < Math.min(15, data.length); r++) {
    for (let c = 0; c < Math.min(10, (data[r] || []).length); c++) {
      const val = String(data[r]?.[c] || '').trim();
      if (val.length > 10 && !/^=/.test(val) && !/Go to/i.test(val)) {
        if (/STATEMENT|FINANCIAL|INSURANCE|COMPUTATION|SOLVENCY|DEPOSIT|PROFIT|LOSS|CASH FLOW|COMPREHENSIVE|RECONCILIATION|DISCLOSURES|RESERVES|REINSURANCE|CLAIMS|ASSET|INVESTMENT|BUSINESS|SCHEDULE|CERTIFICATION/i.test(val)) {
          formTitle = val;
          titleRow = r;
          break;
        }
      }
    }
    if (formTitle) break;
  }

  if (!formTitle) {
    // Fallback: use any long text from rows 9-12
    for (let r = 8; r < Math.min(14, data.length); r++) {
      for (let c = 0; c < Math.min(10, (data[r] || []).length); c++) {
        const val = String(data[r]?.[c] || '').trim();
        if (val.length > 15 && !/^=/.test(val) && !/Go to|Cover!/i.test(val) && !/^\s+$/.test(val)) {
          formTitle = val;
          titleRow = r;
          break;
        }
      }
      if (formTitle) break;
    }
  }

  // Find the row with column numbers (1, 2, 3...) — this is typically row 15
  let colNumberRow = -1;
  for (let r = 12; r < Math.min(25, data.length); r++) {
    const row = data[r] || [];
    let numCount = 0;
    let consecutiveNums: number[] = [];
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      if (val !== '' && val !== null && val !== undefined) {
        const n = Number(val);
        if (!isNaN(n) && Number.isInteger(n) && n >= 1 && n <= 50) {
          numCount++;
          consecutiveNums.push(n);
        }
      }
    }
    // Must have at least 3 consecutive column numbers
    if (numCount >= 3 && consecutiveNums[0] === 1) {
      colNumberRow = r;
      break;
    }
  }

  if (colNumberRow < 0) {
    // Alternative: look for "Notes" label which typically precedes data columns
    for (let r = 12; r < Math.min(25, data.length); r++) {
      const row = data[r] || [];
      for (let c = 0; c < Math.min(10, row.length); c++) {
        if (/^Notes$/i.test(String(row[c] || '').trim())) {
          colNumberRow = r;
          break;
        }
      }
      if (colNumberRow >= 0) break;
    }
  }

  if (colNumberRow < 0) return null;

  // Determine label column and number column by scanning data rows
  let labelCol = 2; // Default: column C (index 2)
  let numberCol = 1; // Default: column B (index 1)

  // Check if numbers are in column A (index 0) and labels in column B (index 1)
  let numInA = 0, numInB = 0;
  for (let r = colNumberRow + 1; r < Math.min(colNumberRow + 20, data.length); r++) {
    const row = data[r] || [];
    const aVal = row[0];
    const bVal = row[1];
    if (aVal !== '' && aVal !== null && !isNaN(Number(aVal)) && Number.isInteger(Number(aVal))) numInA++;
    if (bVal !== '' && bVal !== null && !isNaN(Number(bVal)) && Number.isInteger(Number(bVal))) numInB++;
  }

  if (numInA > numInB) {
    numberCol = 0; // Column A
    labelCol = 1;  // Column B
  } else {
    numberCol = 1; // Column B
    labelCol = 2;  // Column C
  }

  // Find data columns (columns after label that have headers)
  const headerRow1 = data[colNumberRow - 2] || [];
  const headerRow2 = data[colNumberRow - 1] || [];
  const colNumRow = data[colNumberRow] || [];

  let dataColStart = labelCol + 1;
  let dataColEnd = 0;
  const columnHeaders: string[] = [];

  // Skip the "Notes" column if present
  if (/^Notes$/i.test(String(colNumRow[dataColStart] || '').trim()) ||
      /^Notes$/i.test(String(headerRow2[dataColStart] || '').trim())) {
    dataColStart++;
  }

  for (let c = dataColStart; c < Math.max(headerRow1.length, headerRow2.length, colNumRow.length); c++) {
    const h1 = String(headerRow1[c] || '').trim();
    const h2 = String(headerRow2[c] || '').trim();
    const cn = String(colNumRow[c] || '').trim();

    // A data column should have either a header or a column number
    if (h1 || h2 || (cn && !isNaN(Number(cn)))) {
      const header = h2 || h1 || `Column ${cn || c}`;
      // Shorten long repetitive headers
      const shortHeader = header.length > 60 ? header.substring(0, 60).trim() : header;
      columnHeaders.push(shortHeader);
      dataColEnd = c;
    } else if (columnHeaders.length > 0) {
      // Stop at first empty column after data started
      break;
    }
  }

  if (columnHeaders.length === 0) return null;

  return {
    titleRow,
    formTitle: formTitle.replace(/\(\$000\)/g, '').replace(/\s+/g, ' ').trim(),
    headerStartRow: colNumberRow - 2,
    headerEndRow: colNumberRow,
    dataStartRow: colNumberRow + 1,
    labelCol,
    numberCol,
    dataColStart,
    dataColEnd,
    columnHeaders,
  };
}

function parseFinancialSheet(
  sheetName: string,
  data: string[][],
  layout: FinancialLayout,
  sheet: any,
  XLSX: any,
): { sections: FormSection[]; crossSheetRefs: CrossSheetRef[] } {
  const sections: FormSection[] = [];
  const crossSheetRefs: CrossSheetRef[] = [];

  let currentSectionTitle = layout.formTitle || sheetName;
  let currentFields: FormField[] = [];
  let sortOrder = 0;

  // Build a GLOBAL field-name map: cellAddr -> fieldName (across ALL rows)
  const globalFieldMap = new Map<string, string>();
  // Also build colRow -> fieldName for formula resolution
  const colRowFieldMap = new Map<string, string>(); // "COL_ROW" -> fieldName

  const flushSection = () => {
    if (currentFields.length > 0) {
      sections.push({
        id: crypto.randomUUID(),
        title: currentSectionTitle,
        sortOrder: sortOrder++,
        isRepeatable: false,
        fields: [...currentFields],
      });
      currentFields = [];
    }
  };

  // First pass: assign field names to all data cells
  for (let r = layout.dataStartRow; r < data.length; r++) {
    const row = data[r] || [];
    const lineNum = String(row[layout.numberCol] || '').trim();
    const label = String(row[layout.labelCol] || '').trim();
    if (!label) continue;
    if (/^\(Input line item here\)$/i.test(label)) continue;

    for (let ci = 0; ci < layout.columnHeaders.length; ci++) {
      const colIdx = layout.dataColStart + ci;
      const cellAddr = XLSX.utils.encode_cell({ r, c: colIdx });
      const fieldName = toFieldName(`line_${lineNum || r}_col_${ci + 1}`);
      globalFieldMap.set(cellAddr, fieldName);
      const colLetter = XLSX.utils.encode_col(colIdx);
      colRowFieldMap.set(`${colLetter}${r + 1}`, fieldName);
    }
  }

  // Helper: convert cell ref like "B16" to a field name using globalFieldMap
  function cellRefToFieldName(cellRef: string): string | null {
    // Parse cell ref to row/col
    const match = cellRef.replace(/\$/g, '').match(/^([A-Z]+)(\d+)$/i);
    if (!match) return null;
    const col = match[1].toUpperCase();
    const row = parseInt(match[2], 10);
    const colIdx = XLSX.utils.decode_col(col);
    const addr = XLSX.utils.encode_cell({ r: row - 1, c: colIdx });
    return globalFieldMap.get(addr) || null;
  }

  // Enhanced formula converter that uses global field map
  function convertFormulaWithGlobalMap(rawFormula: string): FormulaInfo {
    const referencedFields: string[] = [];
    const sheetCrossRefs: CrossSheetRef[] = [];
    let expression = rawFormula.replace(/^=\s*/, '');

    // Cross-sheet references
    expression = expression.replace(/'?([^'!]+)'?!(\$?[A-Z]+\$?\d+)/gi, (match, refSheet, cellRef) => {
      const cleanRef = cellRef.replace(/\$/g, '');
      const colLetters = cleanRef.replace(/\d/g, '').toUpperCase();
      const fieldName = `${toFieldName(refSheet)}_${colLetters.toLowerCase()}`;
      sheetCrossRefs.push({
        sourceSheet: sheetName,
        sourceField: '',
        targetSheet: refSheet.trim(),
        targetField: fieldName,
        formula: rawFormula,
      });
      return `{${toFieldName(refSheet)}.${fieldName}}`;
    });

    // Handle SUM with ranges (vertical: same col different rows, or horizontal)
    expression = expression.replace(/SUM\(([^)]+)\)/gi, (_, range: string) => {
      const parts = range.split(':');
      if (parts.length === 2) {
        const startRef = parts[0].replace(/\$/g, '');
        const endRef = parts[1].replace(/\$/g, '');
        const startMatch = startRef.match(/^([A-Z]+)(\d+)$/i);
        const endMatch = endRef.match(/^([A-Z]+)(\d+)$/i);
        if (startMatch && endMatch) {
          const startCol = XLSX.utils.decode_col(startMatch[1]);
          const endCol = XLSX.utils.decode_col(endMatch[1]);
          const startRow = parseInt(startMatch[2], 10);
          const endRow = parseInt(endMatch[2], 10);
          const sumFields: string[] = [];
          for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
              const addr = XLSX.utils.encode_cell({ r: r - 1, c });
              const fn = globalFieldMap.get(addr);
              if (fn) {
                sumFields.push(fn);
                if (!referencedFields.includes(fn)) referencedFields.push(fn);
              }
            }
          }
          if (sumFields.length > 0) return sumFields.map(f => `{${f}}`).join(' + ');
        }
      }
      return range;
    });

    // Handle AVERAGE with ranges
    expression = expression.replace(/AVERAGE\(([^)]+)\)/gi, (_, range: string) => {
      const parts = range.split(':');
      if (parts.length === 2) {
        const startRef = parts[0].replace(/\$/g, '');
        const endRef = parts[1].replace(/\$/g, '');
        const startMatch = startRef.match(/^([A-Z]+)(\d+)$/i);
        const endMatch = endRef.match(/^([A-Z]+)(\d+)$/i);
        if (startMatch && endMatch) {
          const startCol = XLSX.utils.decode_col(startMatch[1]);
          const endCol = XLSX.utils.decode_col(endMatch[1]);
          const startRow = parseInt(startMatch[2], 10);
          const endRow = parseInt(endMatch[2], 10);
          const avgFields: string[] = [];
          for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
              const addr = XLSX.utils.encode_cell({ r: r - 1, c });
              const fn = globalFieldMap.get(addr);
              if (fn) {
                avgFields.push(fn);
                if (!referencedFields.includes(fn)) referencedFields.push(fn);
              }
            }
          }
          if (avgFields.length > 0) {
            return `(${avgFields.map(f => `{${f}}`).join(' + ')}) / ${avgFields.length}`;
          }
        }
      }
      return range;
    });

    // Same-sheet cell references (individual cells like B16, $C$20, etc.)
    expression = expression.replace(/\$?([A-Z]+)\$?(\d+)/gi, (match) => {
      const fn = cellRefToFieldName(match);
      if (fn) {
        if (!referencedFields.includes(fn)) referencedFields.push(fn);
        return `{${fn}}`;
      }
      return match;
    });

    return { raw: rawFormula, expression, referencedFields, crossSheetRefs: sheetCrossRefs };
  }

  // Second pass: create fields with properly resolved formulas
  for (let r = layout.dataStartRow; r < data.length; r++) {
    const row = data[r] || [];
    const lineNum = String(row[layout.numberCol] || '').trim();
    const label = String(row[layout.labelCol] || '').trim();

    if (!label) continue;
    if (/^\(Input line item here\)$/i.test(label)) continue;

    const hasNumber = lineNum !== '' && (/^\d+$/.test(lineNum) || /^S\d+$/i.test(lineNum));

    if (!hasNumber) {
      let hasData = false;
      for (let c = layout.dataColStart; c <= layout.dataColEnd; c++) {
        const val = String(row[c] || '').trim();
        if (val && val !== '0') { hasData = true; break; }
      }
      if (!hasData && label.length > 2) {
        flushSection();
        currentSectionTitle = label;
        continue;
      }
    }

    for (let ci = 0; ci < layout.columnHeaders.length; ci++) {
      const colIdx = layout.dataColStart + ci;
      const colHeader = layout.columnHeaders[ci];
      const cellAddr = XLSX.utils.encode_cell({ r, c: colIdx });
      const cell = sheet[cellAddr];
      const fieldName = globalFieldMap.get(cellAddr) || toFieldName(`line_${lineNum || r}_col_${ci + 1}`);

      const fieldLabel = layout.columnHeaders.length === 1
        ? label
        : `${label} - ${colHeader}`;

      let fieldType: FieldType = 'number';
      let calculatedExpression: string | undefined;

      if (cell && cell.f) {
        fieldType = 'calculated';
        const info = convertFormulaWithGlobalMap(cell.f);
        calculatedExpression = info.expression;
        if (info.crossSheetRefs.length > 0) {
          info.crossSheetRefs.forEach(ref => { ref.sourceField = fieldName; });
          crossSheetRefs.push(...info.crossSheetRefs);
        }
      }

      const field: FormField = {
        id: crypto.randomUUID(),
        type: fieldType,
        label: fieldLabel,
        fieldName,
        required: false,
        placeholder: fieldType === 'number' ? '0' : undefined,
        calculatedExpression,
      };
      currentFields.push(field);
    }
  }

  flushSection();
  return { sections, crossSheetRefs };
}

async function parseExcelMultiSheet(file: File): Promise<MultiSheetParseResult> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellFormula: true, cellNF: true });

  const sheets: SheetParseResult[] = [];
  const allCrossSheetRefs: CrossSheetRef[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (data.length === 0) continue;

    // ── Try financial statement layout first ──
    const financialLayout = detectFinancialLayout(sheet, data, XLSX);
    if (financialLayout) {
      const { sections, crossSheetRefs: sheetCrossRefs } = parseFinancialSheet(
        sheetName, data, financialLayout, sheet, XLSX
      );
      const fieldCount = sections.reduce((a, s) => a + s.fields.length, 0);
      if (fieldCount > 0) {
        sheets.push({
          sheetName,
          formName: `${sheetName} - ${financialLayout.formTitle}`,
          sections,
          fieldCount,
          selected: true,
          crossSheetRefs: sheetCrossRefs,
        });
        allCrossSheetRefs.push(...sheetCrossRefs);
      }
      continue;
    }

    // ── Original parsing logic ──
    const headers = data[0].map(h => String(h).trim()).filter(Boolean);
    if (headers.length === 0) continue;

    const dataRows = data.slice(1).filter(row => row.some(cell => String(cell).trim()));
    const headersLower = headers.map(h => h.toLowerCase());
    const isTemplate = headersLower.includes('label') || headersLower.includes('field name') || headersLower.includes('field label');

    const colToFieldMap = new Map<string, string>();
    headers.forEach((h, i) => {
      colToFieldMap.set(colLetterFromIndex(i), toFieldName(h));
    });

    // Collect formulas
    const formulaMap = new Map<string, string>();
    if (sheet['!ref']) {
      const range = XLSX.utils.decode_range(sheet['!ref']);
      for (let c = range.s.c; c <= range.e.c; c++) {
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
          const cellAddr = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[cellAddr];
          if (cell && cell.f) {
            const colLetter = colLetterFromIndex(c);
            if (!formulaMap.has(colLetter)) {
              formulaMap.set(colLetter, cell.f);
            }
          }
        }
      }
    }

    const sections: FormSection[] = [];
    const sheetCrossRefs: CrossSheetRef[] = [];

    if (isTemplate) {
      const labelIdx = headersLower.findIndex(h => h.includes('label') || h.includes('field name') || h.includes('field label'));
      const typeIdx = headersLower.findIndex(h => h === 'type' || h === 'field type');
      const reqIdx = headersLower.findIndex(h => h.includes('required') || h.includes('mandatory'));
      const optIdx = headersLower.findIndex(h => h.includes('option') || h.includes('choices'));
      const helpIdx = headersLower.findIndex(h => h.includes('help') || h.includes('hint') || h.includes('description'));
      const sectionIdx = headersLower.findIndex(h => h.includes('section') || h.includes('group'));
      const formulaIdx = headersLower.findIndex(h => h.includes('formula') || h.includes('expression') || h.includes('calculation'));
      const minIdx = headersLower.findIndex(h => h === 'min' || h.includes('minimum'));
      const maxIdx = headersLower.findIndex(h => h === 'max' || h.includes('maximum'));
      const patternIdx = headersLower.findIndex(h => h.includes('pattern') || h.includes('regex'));

      const sectionMap = new Map<string, FormField[]>();

      for (const row of dataRows) {
        const label = String(row[labelIdx] || '').trim();
        if (!label) continue;
        const rawType = typeIdx >= 0 ? String(row[typeIdx] || '').trim().toLowerCase() : '';
        const required = reqIdx >= 0 ? ['yes', 'true', '1', 'y'].includes(String(row[reqIdx] || '').trim().toLowerCase()) : false;
        const options = optIdx >= 0 ? String(row[optIdx] || '').split(/[,;|]/).map(o => o.trim()).filter(Boolean) : undefined;
        const helpText = helpIdx >= 0 ? String(row[helpIdx] || '').trim() || undefined : undefined;
        const sectionName = sectionIdx >= 0 ? String(row[sectionIdx] || '').trim() || sheetName : sheetName;
        const formulaStr = formulaIdx >= 0 ? String(row[formulaIdx] || '').trim() : '';

        const typeMap: Record<string, FieldType> = {
          text: 'text', number: 'number', decimal: 'decimal', email: 'email',
          phone: 'phone', date: 'date', textarea: 'textarea', 'text area': 'textarea',
          select: 'select', dropdown: 'select', 'multi-select': 'multi_select', 'multi select': 'multi_select',
          checkbox: 'checkbox', radio: 'radio', file: 'file', upload: 'file',
          paragraph: 'paragraph', table: 'table', calculated: 'calculated',
        };
        let fieldType: FieldType = typeMap[rawType] || 'text';

        let calculatedExpression: string | undefined;
        if (formulaStr) {
          fieldType = 'calculated';
          const info = convertFormula(formulaStr, colToFieldMap, sheetName);
          calculatedExpression = info.expression;
          if (info.crossSheetRefs.length > 0) {
            info.crossSheetRefs.forEach(r => { r.sourceField = toFieldName(label); });
            sheetCrossRefs.push(...info.crossSheetRefs);
          }
        }

        const validation: ValidationRules = {};
        if (required) validation.required = true;
        if (minIdx >= 0 && row[minIdx]) validation.min = Number(row[minIdx]);
        if (maxIdx >= 0 && row[maxIdx]) validation.max = Number(row[maxIdx]);
        if (patternIdx >= 0 && row[patternIdx]) validation.pattern = String(row[patternIdx]);

        const field: FormField = {
          id: crypto.randomUUID(), type: fieldType, label, fieldName: toFieldName(label), required,
          helpText,
          options: options && options.length > 0 ? options : (['radio', 'select', 'checkbox', 'multi_select'].includes(fieldType) ? ['Option 1', 'Option 2'] : undefined),
          calculatedExpression,
          validation: Object.keys(validation).length > 0 ? validation : undefined,
        };

        if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, []);
        sectionMap.get(sectionName)!.push(field);
      }

      let sortOrder = 0;
      for (const [title, fields] of sectionMap) {
        sections.push({ id: crypto.randomUUID(), title, sortOrder: sortOrder++, isRepeatable: false, fields });
      }
    } else {
      // Auto-detect mode
      const fields: FormField[] = headers.map((header, colIdx) => {
        const samples = dataRows.slice(0, 10).map(row => String(row[colIdx] || ''));
        const colLetter = colLetterFromIndex(colIdx);
        const formula = formulaMap.get(colLetter);

        let fieldType = inferFieldType(header, samples);
        let calculatedExpression: string | undefined;

        if (formula) {
          fieldType = 'calculated';
          const info = convertFormula(formula, colToFieldMap, sheetName);
          calculatedExpression = info.expression;
          if (info.crossSheetRefs.length > 0) {
            info.crossSheetRefs.forEach(r => { r.sourceField = toFieldName(header); });
            sheetCrossRefs.push(...info.crossSheetRefs);
          }
        }

        let options: string[] | undefined;
        if (fieldType === 'select') {
          const unique = [...new Set(dataRows.map(r => String(r[colIdx] || '').trim()).filter(Boolean))];
          options = unique.slice(0, 20);
        }

        const validation = extractValidation(header, samples, fieldType);

        return {
          id: crypto.randomUUID(), type: fieldType, label: header, fieldName: toFieldName(header),
          required: false, options, calculatedExpression, validation,
        };
      });

      sections.push({
        id: crypto.randomUUID(), title: sheetName, sortOrder: 0, isRepeatable: false, fields,
      });
    }

    const fieldCount = sections.reduce((a, s) => a + s.fields.length, 0);
    if (fieldCount > 0) {
      sheets.push({
        sheetName,
        formName: sheetName,
        sections,
        fieldCount,
        selected: true,
        crossSheetRefs: sheetCrossRefs,
      });
      allCrossSheetRefs.push(...sheetCrossRefs);
    }
  }

  return { fileName: file.name, sheets, allCrossSheetRefs };
}

// ─── Checkbox Detection Helpers ───

const KNOWN_CHECKBOX_SYMBOLS = '☐☑☒✓✔✗✘⬜⬛▢▣◻◼○●❏❑❒□■';
const CHECKBOX_SYMBOL_RE = new RegExp(`[${KNOWN_CHECKBOX_SYMBOLS}]`, 'u');
const CHECKBOX_SYMBOL_GLOBAL_RE = new RegExp(`[${KNOWN_CHECKBOX_SYMBOLS}]`, 'gu');

function isPrivateUseChar(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return cp >= 0xE000 && cp <= 0xF8FF;
}

function isLikelyCheckboxMarker(char: string): boolean {
  if (!char) return false;
  if (CHECKBOX_SYMBOL_RE.test(char)) return true;
  if (isPrivateUseChar(char)) return true;
  return /\p{So}/u.test(char);
}

function countCheckboxMarkers(text: string): number {
  return Array.from(text).reduce((acc, char) => acc + (isLikelyCheckboxMarker(char) ? 1 : 0), 0);
}

function removeCheckboxMarkers(text: string): string {
  return Array.from(text)
    .filter(char => !isLikelyCheckboxMarker(char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCheckboxOption(option: string): string {
  return option.replace(/^[\s,;]+|[\s,;]+$/g, '').replace(/\s+/g, ' ').trim();
}

function extractInlineCheckboxOptions(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const direct = normalized
    .split(CHECKBOX_SYMBOL_GLOBAL_RE)
    .map(cleanCheckboxOption)
    .filter(Boolean);
  if (direct.length >= 2) return [...new Set(direct)];

  const markerCounts = new Map<string, number>();
  for (const char of Array.from(normalized)) {
    if (!isLikelyCheckboxMarker(char)) continue;
    markerCounts.set(char, (markerCounts.get(char) ?? 0) + 1);
  }

  const candidate = Array.from(markerCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (!candidate || candidate[1] < 2) return [];

  const [marker] = candidate;
  const fallback = normalized
    .split(marker)
    .map(cleanCheckboxOption)
    .filter(Boolean);

  if (fallback.length < 2 || fallback.some(option => option.length > 100)) return [];
  return [...new Set(fallback)];
}

function extractCheckboxFieldData(text: string): { label?: string; options: string[] } | null {
  const options = extractInlineCheckboxOptions(text);
  if (options.length < 2) return null;

  const first = options[0];
  const questionMatch = first.match(/^(.{3,120}?)[?:]\s+(.+)$/);
  if (questionMatch) {
    const [, question, firstOption] = questionMatch;
    const normalizedOptions = [cleanCheckboxOption(firstOption), ...options.slice(1)].filter(Boolean);
    if (normalizedOptions.length >= 2) {
      return { label: question.trim(), options: normalizedOptions };
    }
  }

  return { options };
}

/** Returns true if a text line starts with a checkbox symbol */
function isCheckboxLine(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed) return false;
  const [firstChar] = Array.from(trimmed);
  return isLikelyCheckboxMarker(firstChar || '');
}

/** Strip checkbox symbol prefix and return the option label */
function stripCheckboxSymbol(text: string): string {
  const trimmed = text.trimStart();
  const chars = Array.from(trimmed);
  if (chars.length > 0 && isLikelyCheckboxMarker(chars[0])) {
    return chars.slice(1).join('').trim();
  }
  return trimmed.trim();
}

/**
 * Given a sequence of elements starting at `startIdx`, look backward for a
 * preceding label (a <p> that ends with ":" or "?" or is short text without
 * checkbox symbols). Returns the label text or null.
 */
function findPrecedingLabel(elements: Element[], startIdx: number): string | null {
  for (let i = startIdx - 1; i >= 0; i--) {
    const el = elements[i];
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim();
    if (!text) continue;
    // Stop at headings — they are section separators
    if (['h1', 'h2', 'h3', 'h4'].includes(tag)) return null;
    if (tag === 'p' && !isCheckboxLine(text)) {
      // Likely a question/label for the checkbox group
      return text.replace(/[:?*]$/g, '').trim();
    }
    break; // only look at the immediately preceding non-empty element
  }
  return null;
}

/**
 * Detect consecutive checkbox paragraphs starting at `startIdx` and return
 * the collected option labels and how many elements were consumed.
 */
function collectCheckboxParagraphs(elements: Element[], startIdx: number): { options: string[]; consumed: number } {
  const options: string[] = [];
  let i = startIdx;
  while (i < elements.length) {
    const el = elements[i];
    const text = (el.textContent || '').trim();
    if (!text) { i++; continue; }
    const tag = el.tagName.toLowerCase();
    if (tag === 'p' && isCheckboxLine(text)) {
      options.push(stripCheckboxSymbol(text));
      i++;
    } else {
      break;
    }
  }
  return { options, consumed: i - startIdx };
}

/**
 * Detect checkbox items inside a <ul>/<ol>. Returns options if the majority
 * of list items contain checkbox symbols.
 */
function extractCheckboxOptionsFromList(el: Element): string[] | null {
  const items = Array.from(el.querySelectorAll('li')).map(li => (li.textContent || '').trim()).filter(Boolean);
  if (items.length === 0) return null;
  const cbCount = items.filter(i => isCheckboxLine(i)).length;
  // Also detect if the items contain checkbox symbols anywhere in the text
  const symbolCount = items.filter(i => countCheckboxMarkers(i) > 0).length;
  if (cbCount >= items.length * 0.5 || symbolCount >= items.length * 0.5) {
    return items.map(i => cleanCheckboxOption(removeCheckboxMarkers(i))).filter(Boolean);
  }
  return null;
}

// ─── Word Parser ───

async function parseWord(file: File): Promise<FormSection[]> {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const html = result.value;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const elements = Array.from(doc.body.children);

  const sections: FormSection[] = [];
  let currentSection: FormSection | null = null;
  let elIdx = 0;

  while (elIdx < elements.length) {
    const el = elements[elIdx];
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim();

    if (!text) { elIdx++; continue; }

    // ── Section headings ──
    if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
      if (currentSection && currentSection.fields.length > 0) sections.push(currentSection);
      currentSection = { id: crypto.randomUUID(), title: text, sortOrder: sections.length, isRepeatable: false, fields: [] };
      elIdx++;
      continue;
    }

    if (!currentSection) {
      currentSection = { id: crypto.randomUUID(), title: 'Section 1', sortOrder: 0, isRepeatable: false, fields: [] };
    }

    // ── Tables (existing logic) ──
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
            const inlineCheckbox = extractCheckboxFieldData(label);
            let parsedType: FieldType = typeMap[rawType] || 'text';
            let parsedLabel = label;
            let parsedOptions: string[] | undefined;

            if (inlineCheckbox && (parsedType === 'checkbox' || parsedType === 'text')) {
              parsedType = 'checkbox';
              parsedLabel = inlineCheckbox.label || 'Selection';
              parsedOptions = inlineCheckbox.options;
            }

            currentSection.fields.push({
              id: crypto.randomUUID(), type: parsedType, label: parsedLabel, fieldName: toFieldName(parsedLabel),
              required: reqIdx >= 0 ? ['yes', 'y', 'true'].includes((cells[reqIdx] || '').toLowerCase()) : false,
              options: parsedOptions,
            });
          }
        } else {
          for (const header of headerCells) {
            if (!header) continue;
            const inlineCheckbox = extractCheckboxFieldData(header);
            if (inlineCheckbox) {
              const checkboxLabel = inlineCheckbox.label || 'Selection';
              currentSection.fields.push({
                id: crypto.randomUUID(),
                type: 'checkbox',
                label: checkboxLabel,
                fieldName: toFieldName(checkboxLabel),
                required: false,
                options: inlineCheckbox.options,
              });
              continue;
            }
            currentSection.fields.push({ id: crypto.randomUUID(), type: inferFieldType(header, []), label: header, fieldName: toFieldName(header), required: false });
          }
        }
      }
      elIdx++;
      continue;
    }

    // ── Checkbox detection: consecutive <p> with checkbox symbols ──
    if (tag === 'p' && isCheckboxLine(text)) {
      const { options, consumed } = collectCheckboxParagraphs(elements, elIdx);
      if (options.length > 0) {
        // Try to find a label from the preceding element
        const precedingLabel = findPrecedingLabel(elements, elIdx);
        const label = precedingLabel || options[0];
        const fieldOptions = precedingLabel ? options : options.slice(1);

        // If there's only one checkbox item with no preceding label, treat as single checkbox
        if (fieldOptions.length === 0) {
          currentSection.fields.push({
            id: crypto.randomUUID(), type: 'checkbox', label,
            fieldName: toFieldName(label), required: false, options: ['Yes', 'No'],
          });
        } else {
          // If the preceding label was already added as a text field, remove it
          if (precedingLabel && currentSection.fields.length > 0) {
            const lastField = currentSection.fields[currentSection.fields.length - 1];
            if (lastField.label === precedingLabel && lastField.type !== 'checkbox') {
              currentSection.fields.pop();
            }
          }
          currentSection.fields.push({
            id: crypto.randomUUID(), type: 'checkbox', label,
            fieldName: toFieldName(label), required: false, options: fieldOptions,
          });
        }
        elIdx += consumed;
        continue;
      }
    }

    // ── Lists: detect checkbox items inside <ul>/<ol> ──
    if (tag === 'ul' || tag === 'ol') {
      const checkboxOptions = extractCheckboxOptionsFromList(el);
      if (checkboxOptions && checkboxOptions.length > 0) {
        const precedingLabel = findPrecedingLabel(elements, elIdx);
        const label = precedingLabel || checkboxOptions[0];
        const fieldOptions = precedingLabel ? checkboxOptions : checkboxOptions.slice(1);

        if (precedingLabel && currentSection.fields.length > 0) {
          const lastField = currentSection.fields[currentSection.fields.length - 1];
          if (lastField.label === precedingLabel && lastField.type !== 'checkbox') {
            currentSection.fields.pop();
          }
        }

        currentSection.fields.push({
          id: crypto.randomUUID(), type: 'checkbox',
          label: label,
          fieldName: toFieldName(label), required: false,
          options: fieldOptions.length > 0 ? fieldOptions : ['Option 1', 'Option 2'],
        });
        elIdx++;
        continue;
      }

      // Non-checkbox list (existing logic)
      const items = Array.from(el.querySelectorAll('li')).map(li => (li.textContent || '').trim()).filter(Boolean);
      const colonPattern = items.filter(i => i.includes(':'));
      if (colonPattern.length > items.length * 0.5) {
        for (const item of items) {
          const [label] = item.split(':');
          if (!label.trim()) continue;
          currentSection.fields.push({ id: crypto.randomUUID(), type: inferFieldType(label.trim(), []), label: label.trim(), fieldName: toFieldName(label.trim()), required: false });
        }
      } else {
        for (const item of items) {
          currentSection.fields.push({ id: crypto.randomUUID(), type: 'text', label: item, fieldName: toFieldName(item), required: false });
        }
      }
      elIdx++;
      continue;
    }

    // ── Paragraphs: check for inline checkbox symbols ──
    if (tag === 'p') {
      const inlineCheckbox = extractCheckboxFieldData(text);
      if (inlineCheckbox) {
        const precedingLabel = findPrecedingLabel(elements, elIdx);
        const label = precedingLabel || inlineCheckbox.label || 'Selection';

        if (precedingLabel && currentSection.fields.length > 0) {
          const lastField = currentSection.fields[currentSection.fields.length - 1];
          if (lastField.label === precedingLabel && lastField.type !== 'checkbox') {
            currentSection.fields.pop();
          }
        }

        currentSection.fields.push({
          id: crypto.randomUUID(), type: 'checkbox', label,
          fieldName: toFieldName(label), required: false, options: inlineCheckbox.options,
        });
        elIdx++;
        continue;
      } else if (countCheckboxMarkers(text) === 1) {
        // Single checkbox symbol — check if it's part of a label like "I agree ☐"
        const stripped = removeCheckboxMarkers(text);
        if (stripped) {
          currentSection.fields.push({
            id: crypto.randomUUID(), type: 'checkbox', label: stripped,
            fieldName: toFieldName(stripped), required: false, options: ['Yes', 'No'],
          });
          elIdx++;
          continue;
        }
      }

      if (text.length > 200) {
        currentSection.fields.push({ id: crypto.randomUUID(), type: 'paragraph', label: 'Information', fieldName: toFieldName('info_' + currentSection.fields.length), required: false, content: text });
      } else if (text.endsWith(':') || text.endsWith('?') || text.length < 80) {
        const label = text.replace(/:$/, '').trim();
        currentSection.fields.push({ id: crypto.randomUUID(), type: inferFieldType(label, []), label, fieldName: toFieldName(label), required: text.includes('*') || text.toLowerCase().includes('required') });
      }
    }

    elIdx++;
  }

  if (currentSection && currentSection.fields.length > 0) sections.push(currentSection);
  if (sections.length === 0) {
    sections.push({
      id: crypto.randomUUID(), title: 'Imported Content', sortOrder: 0, isRepeatable: false,
      fields: [{ id: crypto.randomUUID(), type: 'paragraph', label: 'Imported Content', fieldName: 'imported_content', required: false, content: doc.body.textContent?.trim() || 'No parseable content found.' }],
    });
  }
  return sections;
}

// ─── Editable Field Row ───

interface EditableFieldProps {
  field: FormField;
  onChange: (id: string, updates: Partial<FormField>) => void;
  onDelete: (id: string) => void;
}

function EditableFieldRow({ field, onChange, onDelete }: EditableFieldProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border rounded-md bg-background">
      <div className="flex items-center gap-2 px-3 py-2">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input className="h-7 text-xs flex-1" value={field.label}
          onChange={e => onChange(field.id, { label: e.target.value, fieldName: toFieldName(e.target.value) })} />
        <Select value={field.type} onValueChange={(v: FieldType) => onChange(field.id, { type: v })}>
          <SelectTrigger className="h-7 text-xs w-28 shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>{FIELD_TYPES.map(t => (<SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>))}</SelectContent>
        </Select>
        <div className="flex items-center gap-1 shrink-0">
          <Checkbox checked={field.required} onCheckedChange={v => onChange(field.id, { required: !!v })} className="h-3.5 w-3.5" />
          <span className="text-[10px] text-muted-foreground">Req</span>
        </div>
        {field.calculatedExpression && (
          <Badge variant="outline" className="text-[10px] gap-0.5 shrink-0"><Calculator className="h-3 w-3" /> calc</Badge>
        )}
        {field.validation && Object.keys(field.validation).filter(k => k !== 'required').length > 0 && (
          <Badge variant="outline" className="text-[10px] gap-0.5 shrink-0"><ShieldCheck className="h-3 w-3" /> rules</Badge>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)}><Pencil className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(field.id)}><Trash2 className="h-3 w-3" /></Button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Field Name (key)</label>
              <Input className="h-7 text-xs" value={field.fieldName} onChange={e => onChange(field.id, { fieldName: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Placeholder</label>
              <Input className="h-7 text-xs" value={field.placeholder || ''} onChange={e => onChange(field.id, { placeholder: e.target.value })} />
            </div>
          </div>
          {field.calculatedExpression !== undefined && (
            <div>
              <label className="text-[10px] text-muted-foreground flex items-center gap-1"><Calculator className="h-3 w-3" /> Formula Expression</label>
              <Input className="h-7 text-xs font-mono" value={field.calculatedExpression}
                onChange={e => onChange(field.id, { calculatedExpression: e.target.value })} />
              <p className="text-[9px] text-muted-foreground mt-0.5">Use {'{field_name}'} to reference other fields. Use {'{sheet.field}'} for cross-sheet refs.</p>
            </div>
          )}
          {field.options && (
            <div>
              <label className="text-[10px] text-muted-foreground">Options (comma-separated)</label>
              <Input className="h-7 text-xs" value={field.options.join(', ')}
                onChange={e => onChange(field.id, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })} />
            </div>
          )}
          {field.validation && (
            <div className="bg-muted/50 rounded p-2 space-y-1">
              <p className="text-[10px] font-medium flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Detected Validation Rules</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {field.validation.min !== undefined && <span>Min: {field.validation.min}</span>}
                {field.validation.max !== undefined && <span>Max: {field.validation.max}</span>}
                {field.validation.maxLength !== undefined && <span>Max Length: {field.validation.maxLength}</span>}
                {field.validation.pattern && <span className="col-span-2 font-mono truncate">Pattern: {field.validation.pattern}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Import Step Enum ───

type ImportStep = 'upload' | 'select_sheets' | 'preview';

// ─── Main Component ───

interface FileImportProps {
  /** Legacy: single-form import (adds sections to current form) */
  onImport: (sections: FormSection[]) => void;
  /** Multi-sheet import: creates multiple forms under a return template */
  onMultiSheetImport?: (result: MultiSheetParseResult) => void;
}

export function FileImportDialog({ onImport, onMultiSheetImport }: FileImportProps) {
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [step, setStep] = useState<ImportStep>('upload');
  const [multiResult, setMultiResult] = useState<MultiSheetParseResult | null>(null);
  const [templateName, setTemplateName] = useState('');
  // Word files use legacy single-form import
  const [legacyPreview, setLegacyPreview] = useState<FormSection[] | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep('upload');
    setMultiResult(null);
    setLegacyPreview(null);
    setFileName('');
    setTemplateName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setMultiResult(null);
    setLegacyPreview(null);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'xlsx' || ext === 'xls') {
        const result = await parseExcelMultiSheet(file);
        if (result.sheets.length === 0) {
          toast.error('No form fields could be detected in the uploaded file.');
          setParsing(false);
          return;
        }
        setMultiResult(result);
        setTemplateName(file.name.replace(/\.[^.]+$/, ''));

        // If single sheet, go to legacy flow (for backward compat on non-returns forms)
        if (result.sheets.length === 1 && !onMultiSheetImport) {
          setLegacyPreview(result.sheets[0].sections);
          setStep('preview');
        } else {
          setStep('select_sheets');
        }

        const totalFields = result.sheets.reduce((a, s) => a + s.fieldCount, 0);
        const crossRefs = result.allCrossSheetRefs.length;
        toast.success(
          `Detected ${result.sheets.length} sheet(s) with ${totalFields} total fields${crossRefs > 0 ? ` and ${crossRefs} cross-sheet reference(s)` : ''}.`
        );
      } else if (ext === 'docx') {
        const sections = await parseWord(file);
        if (sections.length === 0 || sections.every(s => s.fields.length === 0)) {
          toast.error('No form fields could be detected in the uploaded file.');
          setParsing(false);
          return;
        }
        setLegacyPreview(sections);
        setStep('preview');
        toast.success(`Detected ${sections.reduce((a, s) => a + s.fields.length, 0)} fields from ${sections.length} section(s).`);
      } else {
        toast.error('Unsupported file type. Please upload .xlsx or .docx files.');
        setParsing(false);
        return;
      }
    } catch (err) {
      console.error('File parse error:', err);
      toast.error('Failed to parse the uploaded file. Please check the format.');
    } finally {
      setParsing(false);
    }
  };

  // Sheet selection toggling
  const toggleSheet = useCallback((sheetName: string) => {
    setMultiResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sheets: prev.sheets.map(s => s.sheetName === sheetName ? { ...s, selected: !s.selected } : s),
      };
    });
  }, []);

  const toggleAllSheets = useCallback((selected: boolean) => {
    setMultiResult(prev => {
      if (!prev) return prev;
      return { ...prev, sheets: prev.sheets.map(s => ({ ...s, selected })) };
    });
  }, []);

  const renameSheet = useCallback((sheetName: string, formName: string) => {
    setMultiResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sheets: prev.sheets.map(s => s.sheetName === sheetName ? { ...s, formName } : s),
      };
    });
  }, []);

  // Field editing (for legacy preview)
  const handleFieldChange = useCallback((fieldId: string, updates: Partial<FormField>) => {
    setLegacyPreview(prev => {
      if (!prev) return prev;
      return prev.map(s => ({ ...s, fields: s.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f) }));
    });
  }, []);

  const handleFieldDelete = useCallback((fieldId: string) => {
    setLegacyPreview(prev => {
      if (!prev) return prev;
      return prev.map(s => ({ ...s, fields: s.fields.filter(f => f.id !== fieldId) })).filter(s => s.fields.length > 0);
    });
  }, []);

  const handleSectionTitleChange = useCallback((sectionId: string, title: string) => {
    setLegacyPreview(prev => {
      if (!prev) return prev;
      return prev.map(s => s.id === sectionId ? { ...s, title } : s);
    });
  }, []);

  // Multi-sheet field editing
  const handleMultiFieldChange = useCallback((sheetName: string, fieldId: string, updates: Partial<FormField>) => {
    setMultiResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sheets: prev.sheets.map(s => s.sheetName !== sheetName ? s : {
          ...s,
          sections: s.sections.map(sec => ({
            ...sec,
            fields: sec.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f),
          })),
        }),
      };
    });
  }, []);

  const handleMultiFieldDelete = useCallback((sheetName: string, fieldId: string) => {
    setMultiResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sheets: prev.sheets.map(s => {
          if (s.sheetName !== sheetName) return s;
          const newSections = s.sections.map(sec => ({
            ...sec,
            fields: sec.fields.filter(f => f.id !== fieldId),
          })).filter(sec => sec.fields.length > 0);
          return { ...s, sections: newSections, fieldCount: newSections.reduce((a, sec) => a + sec.fields.length, 0) };
        }),
      };
    });
  }, []);

  // Confirm handlers
  const handleLegacyConfirm = () => {
    if (!legacyPreview) return;
    onImport(legacyPreview);
    const totalFields = legacyPreview.reduce((a, s) => a + s.fields.length, 0);
    toast.success(`Imported ${totalFields} fields from ${legacyPreview.length} section(s).`);
    setOpen(false);
    resetState();
  };

  const handleMultiSheetConfirm = () => {
    if (!multiResult || !onMultiSheetImport) return;
    const filtered = { ...multiResult, sheets: multiResult.sheets.filter(s => s.selected) };
    if (filtered.sheets.length === 0) {
      toast.error('Please select at least one sheet.');
      return;
    }
    // Attach template name
    filtered.fileName = templateName || filtered.fileName;
    onMultiSheetImport(filtered);
    toast.success(`Creating ${filtered.sheets.length} form(s) under "${filtered.fileName}" template.`);
    setOpen(false);
    resetState();
  };

  const selectedSheets = multiResult?.sheets.filter(s => s.selected) || [];
  const totalSelectedFields = selectedSheets.reduce((a, s) => a + s.fieldCount, 0);
  const crossRefCount = multiResult?.allCrossSheetRefs.length || 0;

  // Get dependencies for selected sheets only
  const selectedSheetNames = new Set(selectedSheets.map(s => s.sheetName));
  const relevantDeps = multiResult?.allCrossSheetRefs.filter(
    r => selectedSheetNames.has(r.sourceSheet) || selectedSheetNames.has(r.targetSheet)
  ) || [];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-1" /> Import File
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Import Form from File
              {step !== 'upload' && (
                <Badge variant="secondary" className="text-[10px]">
                  {step === 'select_sheets' ? 'Step 2: Select Sheets' : 'Step 3: Preview & Edit'}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {step === 'upload' && 'Upload an Excel (.xlsx) or Word (.docx) file. Each Excel sheet becomes a separate form.'}
              {step === 'select_sheets' && `Found ${multiResult?.sheets.length} sheets. Select which ones to import as forms.`}
              {step === 'preview' && (legacyPreview ? 'Review and edit detected fields before importing.' : 'Review fields per sheet before creating forms.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Step 1: Upload */}
            {step === 'upload' && (
              <>
                <div
                  className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.docx" className="hidden" onChange={handleFile} />
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

                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Multi-Sheet Excel Support:</p>
                      <p>• Each worksheet is treated as a <strong>separate form</strong></p>
                      <p>• All forms are grouped under one <strong>Return Template</strong></p>
                      <p>• Cross-sheet formulas (e.g. <code className="bg-muted rounded px-1">=Sheet2!A1</code>) are detected and preserved as dependencies</p>
                      <p>• Supports 50+ sheets per workbook</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Step 2: Select Sheets */}
            {step === 'select_sheets' && multiResult && (
              <>
                {/* Template name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Return Template Name</label>
                  <Input
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="Enter template name"
                    className="h-9"
                  />
                </div>

                {/* Stats */}
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary"><Layers className="h-3 w-3 mr-1" /> {multiResult.sheets.length} sheets</Badge>
                  <Badge variant="secondary"><CheckSquare className="h-3 w-3 mr-1" /> {selectedSheets.length} selected</Badge>
                  <Badge variant="secondary">{totalSelectedFields} fields</Badge>
                  {crossRefCount > 0 && (
                    <Badge variant="outline" className="gap-1"><Link2 className="h-3 w-3" /> {crossRefCount} cross-sheet refs</Badge>
                  )}
                </div>

                {/* Select all / none */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleAllSheets(true)}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAllSheets(false)}>Deselect All</Button>
                </div>

                {/* Sheet list */}
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                  {multiResult.sheets.map(sheet => {
                    const hasRefs = multiResult.allCrossSheetRefs.some(
                      r => r.sourceSheet === sheet.sheetName || r.targetSheet === sheet.sheetName
                    );
                    return (
                      <div
                        key={sheet.sheetName}
                        className={`border rounded-lg p-3 flex items-center gap-3 transition-colors ${sheet.selected ? 'border-primary/50 bg-primary/5' : 'opacity-60'}`}
                      >
                        <Checkbox
                          checked={sheet.selected}
                          onCheckedChange={() => toggleSheet(sheet.sheetName)}
                          className="shrink-0"
                        />
                        <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-7 text-xs font-medium flex-1"
                              value={sheet.formName}
                              onChange={e => renameSheet(sheet.sheetName, e.target.value)}
                              placeholder="Form name"
                            />
                            {sheet.sheetName !== sheet.formName && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                (Sheet: {sheet.sheetName})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="text-[10px]">{sheet.fieldCount} fields</Badge>
                          {sheet.sections.length > 1 && (
                            <Badge variant="secondary" className="text-[10px]">{sheet.sections.length} sections</Badge>
                          )}
                          {hasRefs && (
                            <Badge variant="outline" className="text-[10px] gap-0.5">
                              <Link2 className="h-3 w-3" /> linked
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Cross-sheet dependencies */}
                {relevantDeps.length > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium flex items-center gap-1">
                      <Link2 className="h-3.5 w-3.5" /> Detected Cross-Sheet Dependencies
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {relevantDeps.slice(0, 20).map((dep, i) => (
                        <div key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Badge variant="outline" className="text-[9px]">{dep.sourceSheet}</Badge>
                          <span>.{dep.sourceField}</span>
                          <ArrowRight className="h-3 w-3" />
                          <Badge variant="outline" className="text-[9px]">{dep.targetSheet}</Badge>
                          <span>.{dep.targetField}</span>
                        </div>
                      ))}
                      {relevantDeps.length > 20 && (
                        <p className="text-[10px] text-muted-foreground">...and {relevantDeps.length - 20} more</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 3: Preview (multi-sheet) */}
            {step === 'preview' && multiResult && !legacyPreview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Edit Fields per Sheet</h4>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{selectedSheets.length} form(s)</Badge>
                    <Badge variant="secondary">{totalSelectedFields} field(s)</Badge>
                  </div>
                </div>

                <Accordion type="multiple" defaultValue={selectedSheets.slice(0, 3).map(s => s.sheetName)} className="space-y-2">
                  {selectedSheets.map(sheet => (
                    <AccordionItem key={sheet.sheetName} value={sheet.sheetName} className="border rounded-lg">
                      <AccordionTrigger className="px-4 py-2 hover:no-underline">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium">{sheet.formName}</span>
                          <Badge variant="secondary" className="text-[10px]">{sheet.fieldCount} fields</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-3">
                        {sheet.sections.map(section => (
                          <div key={section.id} className="space-y-1.5 mb-3">
                            {sheet.sections.length > 1 && (
                              <p className="text-xs font-medium text-muted-foreground">{section.title}</p>
                            )}
                            {section.fields.map(field => (
                              <EditableFieldRow
                                key={field.id}
                                field={field}
                                onChange={(id, updates) => handleMultiFieldChange(sheet.sheetName, id, updates)}
                                onDelete={(id) => handleMultiFieldDelete(sheet.sheetName, id)}
                              />
                            ))}
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

            {/* Step 3: Preview (legacy single-form) */}
            {step === 'preview' && legacyPreview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Edit & Preview</h4>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{legacyPreview.length} section(s)</Badge>
                    <Badge variant="secondary">{legacyPreview.reduce((a, s) => a + s.fields.length, 0)} field(s)</Badge>
                  </div>
                </div>
                <Accordion type="multiple" defaultValue={legacyPreview.map(s => s.id)} className="space-y-2">
                  {legacyPreview.map(section => (
                    <AccordionItem key={section.id} value={section.id} className="border rounded-lg">
                      <AccordionTrigger className="px-4 py-2 hover:no-underline">
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <Input className="h-7 text-xs font-semibold w-48" value={section.title}
                            onChange={e => handleSectionTitleChange(section.id, e.target.value)}
                            onClick={e => e.stopPropagation()} />
                          <Badge variant="secondary" className="text-[10px]">{section.fields.length} fields</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-3">
                        <div className="space-y-1.5">
                          {section.fields.map(field => (
                            <EditableFieldRow key={field.id} field={field} onChange={handleFieldChange} onDelete={handleFieldDelete} />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between">
            <div className="flex gap-2">
              {step !== 'upload' && (
                <Button variant="outline" onClick={() => {
                  if (step === 'preview' && multiResult && !legacyPreview) setStep('select_sheets');
                  else { resetState(); setStep('upload'); }
                }}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setOpen(false); resetState(); }}>Cancel</Button>

              {/* Step 2 → Step 3 */}
              {step === 'select_sheets' && multiResult && onMultiSheetImport && (
                <Button
                  onClick={() => setStep('preview')}
                  disabled={selectedSheets.length === 0}
                >
                  Preview {selectedSheets.length} Sheet(s) <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}

              {/* Step 2 → direct confirm if no multi-sheet handler, treat as legacy merge */}
              {step === 'select_sheets' && multiResult && !onMultiSheetImport && (
                <Button
                  onClick={() => {
                    const allSections = selectedSheets.flatMap(s => s.sections);
                    onImport(allSections);
                    toast.success(`Imported ${totalSelectedFields} fields from ${selectedSheets.length} sheet(s).`);
                    setOpen(false);
                    resetState();
                  }}
                  disabled={selectedSheets.length === 0}
                >
                  Import {totalSelectedFields} Field(s)
                </Button>
              )}

              {/* Step 3 → confirm multi-sheet */}
              {step === 'preview' && multiResult && !legacyPreview && onMultiSheetImport && (
                <Button onClick={handleMultiSheetConfirm} disabled={selectedSheets.length === 0}>
                  <Layers className="h-4 w-4 mr-1" /> Create {selectedSheets.length} Form(s)
                </Button>
              )}

              {/* Step 3 → confirm legacy */}
              {step === 'preview' && legacyPreview && (
                <Button onClick={handleLegacyConfirm} disabled={legacyPreview.reduce((a, s) => a + s.fields.length, 0) === 0}>
                  Import {legacyPreview.reduce((a, s) => a + s.fields.length, 0)} Field(s)
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
