import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { MasterDataItem } from '@/hooks/useMasterData';

export interface ParsedItemRow {
  rowNumber: number;
  raw: Record<string, any>;
  name: string;
  code: string | null;
  status: string;
  parent_name?: string;
  parent_item_id: string | null;
  sort_order: number;
  errors: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  typeName: string;
  existingItems: MasterDataItem[];
  onImport: (rows: ParsedItemRow[]) => Promise<{ success: number; failed: number; errors: string[] }>;
}

const HEADERS = ['name', 'code', 'parent_name', 'status', 'sort_order'];

export function downloadItemSampleExcel(typeName: string) {
  const rows = [
    ['India', 'IN', '', 'active', 1],
    ['United States', 'US', '', 'active', 2],
  ];
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, typeName.slice(0, 28) || 'Items');
  XLSX.writeFile(wb, `${typeName.toLowerCase().replace(/\s+/g, '-')}-sample.xlsx`);
}

export function MasterDataItemsImportDialog({ open, onOpenChange, typeName, existingItems, onImport }: Props) {
  const { toast } = useToast();
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedItemRow[]>([]);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setFileName(''); setParsed([]); if (inputRef.current) inputRef.current.value = ''; };

  const validateRow = (raw: Record<string, any>, rowNumber: number, batch: ParsedItemRow[]): ParsedItemRow => {
    const errors: string[] = [];
    const name = String(raw.name ?? '').trim();
    const code = String(raw.code ?? '').trim();
    const status = (String(raw.status ?? 'active').trim().toLowerCase()) || 'active';
    const parentName = String(raw.parent_name ?? '').trim();
    const sortOrderRaw = raw.sort_order;
    const sortOrder = sortOrderRaw === '' || sortOrderRaw == null ? 0 : Number(sortOrderRaw);

    if (!name) errors.push('name is required');
    if (!['active', 'inactive'].includes(status)) errors.push('status must be "active" or "inactive"');
    if (Number.isNaN(sortOrder)) errors.push('sort_order must be a number');

    let parent_item_id: string | null = null;
    if (parentName) {
      const parent = existingItems.find(i => !i.parent_item_id && i.name.toLowerCase() === parentName.toLowerCase());
      if (!parent) errors.push(`Parent "${parentName}" not found in this type`);
      else parent_item_id = parent.id;
    }

    const lname = name.toLowerCase();
    const dupInBatch = batch.some(r =>
      r.rowNumber !== rowNumber &&
      r.name.toLowerCase() === lname &&
      (r.parent_item_id || '') === (parent_item_id || '')
    );
    if (dupInBatch) errors.push('Duplicate row in this file');

    const dupExisting = existingItems.some(i =>
      i.name.toLowerCase() === lname && (i.parent_item_id || '') === (parent_item_id || '')
    );
    if (dupExisting) errors.push('Already exists in master data');

    return {
      rowNumber, raw, name,
      code: code || null,
      status, parent_name: parentName || undefined,
      parent_item_id, sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
      errors,
    };
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(ext || '')) {
      toast({ title: 'Invalid file', description: 'Only .xlsx and .xls files are allowed.', variant: 'destructive' });
      reset();
      return;
    }
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      const nonEmpty = json.filter(r => Object.values(r).some(v => String(v ?? '').trim() !== ''));
      const initial = nonEmpty.map((raw, i) => validateRow(raw, i + 2, []));
      const final = initial.map(r => validateRow(r.raw, r.rowNumber, initial));
      setParsed(final);
    } catch (err: any) {
      toast({ title: 'Failed to parse file', description: err.message, variant: 'destructive' });
      reset();
    }
  };

  const validRows = useMemo(() => parsed.filter(r => r.errors.length === 0), [parsed]);
  const invalidCount = parsed.length - validRows.length;
  const canImport = parsed.length > 0 && invalidCount === 0;

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await onImport(validRows);
      if (result.failed === 0) {
        toast({ title: 'Import successful', description: `${result.success} rows imported.` });
        reset();
        onOpenChange(false);
      } else {
        toast({
          title: 'Partial import',
          description: `${result.success} succeeded, ${result.failed} failed. ${result.errors.slice(0, 2).join('; ')}`,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import {typeName} from Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => downloadItemSampleExcel(typeName)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />Download Sample Excel
            </Button>
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />Choose Excel File
            </Button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            {fileName && <span className="text-sm text-muted-foreground">Selected: <strong>{fileName}</strong></span>}
          </div>

          <div className="text-xs text-muted-foreground">
            Required columns: <code className="bg-muted px-1 rounded">{HEADERS.join(', ')}</code>.
            Leave <code className="bg-muted px-1 rounded">parent_name</code> empty for root items (e.g., countries).
            Set it to a parent item's name for dependent items (e.g., a state under a country).
          </div>

          {parsed.length > 0 && (
            <>
              <div className="flex gap-2">
                <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />{validRows.length} valid</Badge>
                {invalidCount > 0 && <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />{invalidCount} invalid</Badge>}
              </div>
              <div className="border rounded-md max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Row</TableHead>
                      {HEADERS.map(h => <TableHead key={h}>{h}</TableHead>)}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.map(r => (
                      <TableRow key={r.rowNumber} className={r.errors.length ? 'bg-destructive/5' : ''}>
                        <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
                        {HEADERS.map(h => (
                          <TableCell key={h} className="text-sm">{String(r.raw[h] ?? '')}</TableCell>
                        ))}
                        <TableCell>
                          {r.errors.length === 0 ? (
                            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Valid</Badge>
                          ) : (
                            <div className="space-y-1">
                              {r.errors.map((e, i) => (
                                <div key={i} className="text-xs text-destructive flex items-start gap-1">
                                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />{e}
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button onClick={handleImport} disabled={!canImport || importing}>
            {importing ? 'Importing...' : `Import ${validRows.length} row(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
