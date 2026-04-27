import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { SectorRow, SubSectorRow, CategoryRow, ServiceRow } from '@/hooks/useMasterConfig';

export type ImportEntity = 'sectors' | 'sub-sectors' | 'categories' | 'services';

interface ParsedRow {
  rowNumber: number;
  raw: Record<string, any>;
  name: string;
  status: string;
  sector_name?: string;
  sub_sector_name?: string;
  sector_id?: string;
  sub_sector_id?: string;
  errors: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entity: ImportEntity;
  sectors: SectorRow[];
  subSectors: SubSectorRow[];
  categories: CategoryRow[];
  services: ServiceRow[];
  onImport: (rows: ParsedRow[]) => Promise<{ success: number; failed: number; errors: string[] }>;
}

const ENTITY_LABEL: Record<ImportEntity, string> = {
  'sectors': 'Sectors',
  'sub-sectors': 'Sub-Sectors',
  'categories': 'Categories',
  'services': 'Services',
};

function getSampleData(entity: ImportEntity): { headers: string[]; rows: any[][] } {
  switch (entity) {
    case 'sectors':
      return {
        headers: ['name', 'status'],
        rows: [
          ['Banking', 'active'],
          ['Insurance', 'active'],
        ],
      };
    case 'sub-sectors':
      return {
        headers: ['sector_name', 'name', 'status'],
        rows: [
          ['Banking', 'Retail Banking', 'active'],
          ['Insurance', 'Life Insurance', 'active'],
        ],
      };
    case 'categories':
      return {
        headers: ['sector_name', 'sub_sector_name', 'name', 'status'],
        rows: [
          ['Banking', 'Retail Banking', 'Personal Loans', 'active'],
          ['Insurance', 'Life Insurance', 'Term Plans', 'active'],
        ],
      };
    case 'services':
      return {
        headers: ['sector_name', 'sub_sector_name', 'name', 'status'],
        rows: [
          ['Banking', 'Retail Banking', 'Account Opening', 'active'],
          ['Insurance', 'Life Insurance', 'Policy Issuance', 'active'],
        ],
      };
  }
}

export function downloadSampleExcel(entity: ImportEntity) {
  const { headers, rows } = getSampleData(entity);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ENTITY_LABEL[entity]);
  XLSX.writeFile(wb, `${entity}-sample.xlsx`);
}

export function MasterDataImportDialog({
  open, onOpenChange, entity, sectors, subSectors, categories, services, onImport,
}: Props) {
  const { toast } = useToast();
  const [fileName, setFileName] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setFileName(''); setParsed([]); if (inputRef.current) inputRef.current.value = ''; };

  const validateRow = (raw: Record<string, any>, rowNumber: number, allInBatch: ParsedRow[]): ParsedRow => {
    const errors: string[] = [];
    const name = String(raw.name ?? '').trim();
    const status = String(raw.status ?? 'active').trim().toLowerCase();
    const sectorName = raw.sector_name != null ? String(raw.sector_name).trim() : '';
    const subSectorName = raw.sub_sector_name != null ? String(raw.sub_sector_name).trim() : '';

    if (!name) errors.push('name is required');
    if (status && !['active', 'inactive'].includes(status)) errors.push('status must be "active" or "inactive"');

    let sector_id: string | undefined;
    let sub_sector_id: string | undefined;

    if (entity !== 'sectors') {
      if (!sectorName) errors.push('sector_name is required');
      else {
        const s = sectors.find(x => x.name.toLowerCase() === sectorName.toLowerCase());
        if (!s) errors.push(`Sector "${sectorName}" not found`);
        else sector_id = s.id;
      }
    }

    if (entity === 'categories' || entity === 'services') {
      if (!subSectorName) errors.push('sub_sector_name is required');
      else if (sector_id) {
        const ss = subSectors.find(x => x.sector_id === sector_id && x.name.toLowerCase() === subSectorName.toLowerCase());
        if (!ss) errors.push(`Sub-Sector "${subSectorName}" not found under sector "${sectorName}"`);
        else sub_sector_id = ss.id;
      }
    }

    // Duplicate check (existing data + within-batch)
    const lname = name.toLowerCase();
    const dupInBatch = allInBatch.some(r =>
      r.rowNumber !== rowNumber &&
      r.name.toLowerCase() === lname &&
      (r.sector_id || '') === (sector_id || '') &&
      (r.sub_sector_id || '') === (sub_sector_id || '')
    );
    if (dupInBatch) errors.push('Duplicate row in this file');

    let dupExisting = false;
    if (entity === 'sectors') {
      dupExisting = sectors.some(s => s.name.toLowerCase() === lname);
    } else if (entity === 'sub-sectors') {
      dupExisting = subSectors.some(s => s.sector_id === sector_id && s.name.toLowerCase() === lname);
    } else if (entity === 'categories') {
      dupExisting = categories.some(c => c.sector_id === sector_id && c.sub_sector_id === sub_sector_id && c.name.toLowerCase() === lname);
    } else {
      dupExisting = services.some(c => c.sector_id === sector_id && c.sub_sector_id === sub_sector_id && c.name.toLowerCase() === lname);
    }
    if (dupExisting) errors.push('Already exists in master data');

    return {
      rowNumber, raw,
      name, status: status || 'active',
      sector_name: sectorName || undefined,
      sub_sector_name: subSectorName || undefined,
      sector_id, sub_sector_id,
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
      // Two-pass to support within-batch duplicate detection
      const initial: ParsedRow[] = nonEmpty.map((raw, i) => validateRow(raw, i + 2, []));
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

  const sampleHeaders = getSampleData(entity).headers;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import {ENTITY_LABEL[entity]} from Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => downloadSampleExcel(entity)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />Download Sample Excel
            </Button>
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />Choose Excel File
            </Button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            {fileName && <span className="text-sm text-muted-foreground">Selected: <strong>{fileName}</strong></span>}
          </div>

          <div className="text-xs text-muted-foreground">
            Required columns: <code className="bg-muted px-1 rounded">{sampleHeaders.join(', ')}</code>
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
                      {sampleHeaders.map(h => <TableHead key={h}>{h}</TableHead>)}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.map(r => (
                      <TableRow key={r.rowNumber} className={r.errors.length ? 'bg-destructive/5' : ''}>
                        <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
                        {sampleHeaders.map(h => (
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

export type { ParsedRow };
