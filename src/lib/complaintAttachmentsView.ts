/**
 * Read-side helper for complaint attachments.
 *
 * Attachments are normally discovered through the `complaint_evidence` link
 * table, written atomically by `finalize_complaint_with_attachments`. If that
 * link step ever fails (e.g. an authorisation gate rejected the caller), the
 * file still exists in `file_uploads` tagged with
 * `entity_type='complaint'` / `entity_id=<complaint id>`. Reading both sources
 * and merging by file id means a link failure degrades to "attachment still
 * visible" instead of "attachment silently disappears".
 */
import { supabase } from '@/integrations/supabase/client';

export interface ComplaintAttachmentView {
  id: string;
  name: string;
  size?: number;
  filePath?: string;
}

export async function loadComplaintAttachments(
  complaintId: string,
): Promise<ComplaintAttachmentView[]> {
  const [evRes, fuRes] = await Promise.all([
    supabase
      .from('complaint_evidence' as any)
      .select('label, file_upload_id')
      .eq('complaint_id', complaintId),
    supabase
      .from('file_uploads' as any)
      .select('id, file_name, file_path, file_size')
      .eq('entity_type', 'complaint')
      .eq('entity_id', complaintId),
  ]);

  const evRows = ((evRes.data as any[]) ?? []).filter(r => r.file_upload_id);
  const directFiles = ((fuRes.data as any[]) ?? []);

  const byId = new Map<string, any>(directFiles.map(f => [f.id, f]));

  // Fill in details for evidence rows whose file wasn't in the direct query.
  const missingIds = evRows.map(r => r.file_upload_id).filter(id => !byId.has(id));
  if (missingIds.length) {
    const { data: extra } = await supabase
      .from('file_uploads' as any)
      .select('id, file_name, file_path, file_size')
      .in('id', missingIds);
    for (const f of ((extra as any[]) ?? [])) byId.set(f.id, f);
  }

  const out = new Map<string, ComplaintAttachmentView>();

  for (const r of evRows) {
    const f = byId.get(r.file_upload_id);
    out.set(r.file_upload_id, {
      id: r.file_upload_id,
      name: r.label || f?.file_name || 'Attachment',
      size: f?.file_size,
      filePath: f?.file_path,
    });
  }

  // Merge unlinked uploads (fallback path).
  for (const f of directFiles) {
    if (out.has(f.id)) continue;
    out.set(f.id, {
      id: f.id,
      name: f.file_name || 'Attachment',
      size: f.file_size,
      filePath: f.file_path,
    });
  }

  return Array.from(out.values());
}
