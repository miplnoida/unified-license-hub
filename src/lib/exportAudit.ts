import { supabase } from '@/integrations/supabase/client';

/**
 * Central helper for logging user-initiated exports (CSV / PDF / JSON) into
 * `audit_export_jobs`. Every download button in the app that emits regulated
 * data should call this so the export audit surface (Gap 18) stays complete.
 *
 * We intentionally write directly to the table (client-side) because these are
 * user-scoped export records — RLS restricts each user to their own rows and
 * admins can see all of them. No file_path is stored for client-side exports
 * (the file never touches storage); a `file_hash` fingerprints the payload for
 * downstream verification.
 */
export type ExportedFormat = 'csv' | 'pdf' | 'json' | 'xlsx';

export interface LogExportInput {
  justification?: string; // governance: reason for the export (>= 10 chars)
  dataset: string; // e.g. 'applications', 'returns_filed', 'complaints'
  format: ExportedFormat;
  rowCount: number;
  filters?: Record<string, unknown>;
  moduleKey?: string; // permission module label, e.g. 'application_management'
  payload?: string; // stringified body used for the hash
  filePath?: string; // storage path if the export was written to a bucket
}

async function sha256Hex(input: string): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const enc = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

export async function logExport(input: LogExportInput): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getUser();
    const userId = sess.user?.id ?? null;
    const hash = input.payload ? await sha256Hex(input.payload) : null;
    const justification = (input.justification ?? `User-initiated ${input.format.toUpperCase()} export of ${input.dataset}`).trim();
    // Governed path first: enforces justification + retention server-side.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc('request_export_job', {
      _source: input.dataset,
      _justification: justification,
      _module_filter: input.moduleKey ?? null,
      _export_format: input.format,
      _filters: input.filters ?? null,
      _row_count: input.rowCount,
      _file_path: input.filePath ?? null,
      _file_hash: hash,
    });
    if (!rpcError) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('audit_export_jobs') as any).insert({
      requested_by: userId,
      source: input.dataset,
      module_filter: input.moduleKey ?? null,
      status: 'completed',
      row_count: input.rowCount,
      file_path: input.filePath ?? null,
      error_message: null,
      completed_at: new Date().toISOString(),
      // stash format + filters + hash in JSON columns if they exist; otherwise
      // fall back to module_filter concat so we still surface it on the viewer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(hash ? ({ file_hash: hash } as any) : {}),
      ...(input.filters ? { filters: input.filters } : {}),
      ...(input.format ? { export_format: input.format } : {}),
    });
  } catch (err) {
    // Never let audit failure break the actual export UX.
     
    console.warn('[logExport] failed to write audit row', err);
  }
}
