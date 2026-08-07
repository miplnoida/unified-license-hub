/**
 * Bulk complaint intake.
 *
 * The client only parses the file into rows; every validation, duplicate
 * check and insert happens server-side in `complaint_bulk_import`, which
 * records a batch header plus one row-level outcome per input row. Invalid
 * rows are never imported as complaints.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ImportBatchSummary {
  batch_id: string;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  imported: number;
}

export interface ImportRow {
  id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  outcome: string;
  validation_errors: Array<{ field: string; message: string }>;
  duplicate_of_complaint_id: string | null;
  complaint_id: string | null;
  complaint_number: string | null;
  rejection_reason: string | null;
}

/** Minimal, quote-aware CSV parser (no dependency). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

export function useComplaintImportBatches() {
  return useQuery({
    queryKey: ['complaint_import_batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_import_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useComplaintImportRows(batchId?: string) {
  return useQuery({
    queryKey: ['complaint_import_rows', batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_import_rows')
        .select('*')
        .eq('batch_id', batchId!)
        .order('row_number');
      if (error) throw error;
      return (data ?? []) as unknown as ImportRow[];
    },
  });
}

export function useComplaintBulkImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      source: string;
      fileName: string;
      rows: Record<string, unknown>[];
      regulatorId?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('complaint_bulk_import', {
        _source: input.source,
        _file_name: input.fileName,
        _rows: input.rows as never,
        _regulator_id: input.regulatorId ?? null,
      });
      if (error) throw error;
      return data as unknown as ImportBatchSummary;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint_import_batches'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
    },
  });
}
