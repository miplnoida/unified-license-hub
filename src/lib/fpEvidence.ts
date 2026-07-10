import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// fp_findings.evidence_urls has accumulated two incompatible shapes from two
// different upload flows: FpaManualTaskDetail.tsx writes plain storage-path
// strings, FpScreeningPanel.tsx wrote {path, name, uploaded_at, uploaded_by}
// objects to a DIFFERENT bucket entirely ('secure-documents', whose RLS only
// allows uploads under the uploader's own user-id folder — the F&P path
// convention 'fp/findings/:id/...' could never satisfy that policy, so every
// upload via the panel silently failed). Both now upload to 'fp-evidence'
// (the bucket actually provisioned for this — see
// 20260708090000_fp_manual_tasks_assignment_and_evidence_bucket.sql) in the
// richer object shape; reads are normalized so pre-existing plain-string
// entries keep rendering safely too.

export interface FpEvidenceItem {
  path: string;
  name?: string;
  uploaded_at?: string;
  uploaded_by?: string;
}

export function normalizeFpEvidence(raw: unknown): FpEvidenceItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FpEvidenceItem[] = [];
  for (const e of raw) {
    if (typeof e === 'string' && e) {
      out.push({ path: e });
    } else if (e && typeof e === 'object' && typeof (e as Record<string, unknown>).path === 'string') {
      const obj = e as Record<string, unknown>;
      out.push({
        path: obj.path as string,
        name: typeof obj.name === 'string' ? obj.name : undefined,
        uploaded_at: typeof obj.uploaded_at === 'string' ? obj.uploaded_at : undefined,
        uploaded_by: typeof obj.uploaded_by === 'string' ? obj.uploaded_by : undefined,
      });
    }
  }
  return out;
}

export function fpEvidenceDisplayName(item: FpEvidenceItem): string {
  if (item.name) return item.name;
  const base = item.path.split('/').pop() ?? item.path;
  // Strip the "<timestamp>-<index>-" prefix FpaManualTaskDetail.tsx adds at upload time, if present.
  return base.replace(/^\d+-\d+-/, '');
}

const CANONICAL_BUCKET = 'fp-evidence';
const LEGACY_BUCKET = 'secure-documents';

export async function uploadFpEvidence(
  findingId: string,
  file: File,
  uploadedBy: string | null,
): Promise<FpEvidenceItem> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${findingId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(CANONICAL_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return { path, name: file.name, uploaded_at: new Date().toISOString(), uploaded_by: uploadedBy ?? undefined };
}

// Old data may reference a path that only ever existed in the legacy bucket
// (or, per the RLS gap above, may not exist anywhere) — try the canonical
// bucket first, then fall back once, rather than assuming one or the other.
export async function openFpEvidenceFile(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from(CANONICAL_BUCKET).createSignedUrl(path, 300);
  if (data?.signedUrl) {
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  const fallback = await supabase.storage.from(LEGACY_BUCKET).createSignedUrl(path, 300);
  if (fallback.data?.signedUrl) {
    window.open(fallback.data.signedUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  toast.error(fallback.error?.message || error?.message || 'Failed to open file');
}

export async function removeFpEvidenceFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(CANONICAL_BUCKET).remove([path]);
  if (error) console.warn('[fpEvidence] failed to delete storage object', error);
}
