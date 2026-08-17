import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, X, Eye } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { logAudit } from '@/hooks/useAuditLog';
import { logExport } from '@/lib/exportAudit';
import { supabase } from '@/integrations/supabase/client';
import { getSignedUrl } from '@/lib/secureFileUpload';
import { toast } from 'sonner';

export interface ComplaintAckAttachment {
  name: string;
  size?: number;
  filePath?: string;
  fileUploadId?: string;
}

export interface ComplaintAckInput {
  id: string;
  complaint_number: string;
  subject: string;
  submitted_at: string;
  complainant_name?: string | null;
  complainant_email?: string | null;
  channel?: string | null;
  regulator_name?: string | null;
  sla_days?: number | null;
  description?: string | null;
  attachments?: ComplaintAckAttachment[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaint: ComplaintAckInput;
  variant?: 'applicant' | 'internal';
}

/** Turns intake/channel codes such as `consumer_portal` into readable text. */
function channelLabel(code: string) {
  const map: Record<string, string> = {
    consumer_portal: 'Consumer portal',
    licensee_portal: 'Licensee portal',
    internal: 'Regulator staff intake',
    staff_intake: 'Regulator staff intake',
    referral: 'Referral',
    email: 'Email',
    phone: 'Telephone',
    walk_in: 'Walk-in',
    letter: 'Letter',
    bulk_import: 'Bulk import',
  };
  return map[code] ?? code.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function formatSize(size?: number) {

  if (!size) return '';
  return size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function resolveFilePath(att: ComplaintAckAttachment): Promise<string | null> {
  if (att.filePath) return att.filePath;
  if (!att.fileUploadId) return null;
  const { data } = await supabase
    .from('file_uploads' as any)
    .select('file_path')
    .eq('id', att.fileUploadId)
    .maybeSingle();
  return (data as any)?.file_path ?? null;
}

async function previewAttachment(att: ComplaintAckAttachment) {
  const path = await resolveFilePath(att);
  if (!path) { toast.error('Attachment not available'); return; }
  const { url, error } = await getSignedUrl(path, 300);
  if (!url) { toast.error(error || 'Unable to open attachment'); return; }
  window.open(url, '_blank', 'noopener');
}

/**
 * Printable / downloadable complaint acknowledgement artifact.
 * Applicant variant shows only essential fields with an aligned label/value grid.
 */
export function ComplaintAcknowledgement({ open, onOpenChange, complaint, variant = 'internal' }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const isApplicant = variant === 'applicant';

  const handlePrint = async () => {
    const contents = printRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank', 'width=800,height=1000');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Complaint Acknowledgement ${complaint.complaint_number}</title>
      <style>
        body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; padding: 40px; color: #0f172a; }
        h1 { font-size: 22px; margin: 0 0 20px; color: #1E3A8A; }
        h2 { font-size: 14px; margin: 24px 0 8px; color: #1E3A8A; text-transform: uppercase; letter-spacing: 0.5px; }
        .meta { display: grid; grid-template-columns: 180px 1fr; column-gap: 24px; row-gap: 12px; font-size: 14px; align-items: start; }
        .meta dt { font-weight: 600; color: #475569; margin: 0; }
        .meta dd { margin: 0; white-space: pre-wrap; word-break: break-word; color: #0f172a; }
        .ref { font-family: 'JetBrains Mono', monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
        ul.att { margin: 0; padding: 0; list-style: none; }
        ul.att li { padding: 2px 0; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; background: #16A34A; color: white; font-size: 12px; letter-spacing: 0.5px; }
      </style></head><body>${contents}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 250);

    await logAudit({
      action: 'ACK_GENERATED',
      entityType: 'complaint',
      entityId: complaint.id,
      newValue: { format: 'pdf', complaint_number: complaint.complaint_number },
    });
    await logExport({
      dataset: 'complaint_acknowledgement',
      format: 'pdf',
      rowCount: 1,
      moduleKey: 'complaint_management',
      filters: { complaint_id: complaint.id, complaint_number: complaint.complaint_number },
      payload: contents,
    });
  };

  const submittedDate = complaint.submitted_at ? new Date(complaint.submitted_at) : null;
  const submittedFmt =
    submittedDate && !Number.isNaN(submittedDate.getTime())
      ? submittedDate.toLocaleString()
      : '—';

  const attachments = complaint.attachments ?? [];

  // ---------- APPLICANT VARIANT ----------
  if (isApplicant) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Complaint acknowledgement</DialogTitle>
          </DialogHeader>

          <div ref={printRef} className="border rounded-md p-6 bg-card">
            <h1 className="text-xl font-semibold text-primary mb-5" style={{ color: '#1E3A8A' }}>
              Complaint Acknowledgement
            </h1>

            <dl
              className="meta"
              style={{
                display: 'grid',
                gridTemplateColumns: '180px 1fr',
                columnGap: '24px',
                rowGap: '12px',
                fontSize: '14px',
                alignItems: 'start',
              }}
            >
              <dt style={{ fontWeight: 600, color: 'hsl(var(--muted-foreground))', margin: 0 }}>
                Acknowledgement no.
              </dt>
              <dd style={{ margin: 0 }}>
                <span className="ref font-mono" style={{ background: 'hsl(var(--muted))', padding: '2px 6px', borderRadius: 4 }}>
                  {complaint.complaint_number}
                </span>
              </dd>

              <dt style={{ fontWeight: 600, color: 'hsl(var(--muted-foreground))', margin: 0 }}>Submitted on</dt>
              <dd style={{ margin: 0 }}>{submittedFmt}</dd>

              <dt style={{ fontWeight: 600, color: 'hsl(var(--muted-foreground))', margin: 0 }}>Title</dt>
              <dd style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{complaint.subject}</dd>

              {complaint.description && (
                <>
                  <dt style={{ fontWeight: 600, color: 'hsl(var(--muted-foreground))', margin: 0 }}>Description</dt>
                  <dd style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {complaint.description}
                  </dd>
                </>
              )}

              {attachments.length > 0 && (
                <>
                  <dt style={{ fontWeight: 600, color: 'hsl(var(--muted-foreground))', margin: 0 }}>Attachments</dt>
                  <dd style={{ margin: 0 }}>
                    <ul className="att" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {attachments.map((a, i) => {
                        const canPreview = !!(a.filePath || a.fileUploadId);
                        return (
                          <li key={i} style={{ padding: '2px 0' }}>
                            {canPreview ? (
                              <button
                                type="button"
                                onClick={() => previewAttachment(a)}
                                className="inline-flex items-center gap-1.5 text-primary hover:underline"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>{a.name}</span>
                                {a.size ? <span className="text-muted-foreground">({formatSize(a.size)})</span> : null}
                              </button>
                            ) : (
                              <span>
                                {a.name}
                                {a.size ? ` (${formatSize(a.size)})` : ''}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </dd>
                </>
              )}
            </dl>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-2" />Close
            </Button>
            <Button data-rbac="complaint_management.view" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />Print / Save as PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ---------- INTERNAL VARIANT (unchanged behavior) ----------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Complaint acknowledgement</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="border rounded-md p-6 bg-white">
          <div className="header" style={{ borderBottom: '2px solid #1E3A8A', paddingBottom: 16, marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, margin: '0 0 8px', color: '#1E3A8A' }}>
              {complaint.regulator_name ?? 'Regulator'} — Complaint Acknowledgement
            </h1>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              This document confirms receipt of your complaint. Retain this reference for your records.
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <span className="badge">Acknowledged</span>
          </div>

          <dl className="meta" style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '8px 16px', fontSize: 14 }}>
            <dt style={{ fontWeight: 600, color: '#475569' }}>Acknowledgement no.</dt>
            <dd style={{ margin: 0 }}><span className="ref">{complaint.complaint_number}</span></dd>

            <dt style={{ fontWeight: 600, color: '#475569' }}>Submitted on</dt>
            <dd style={{ margin: 0 }}>{submittedFmt}</dd>

            <dt style={{ fontWeight: 600, color: '#475569' }}>Title</dt>
            <dd style={{ margin: 0 }}>{complaint.subject}</dd>

            {complaint.description && (<><dt style={{ fontWeight: 600, color: '#475569' }}>Description</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{complaint.description}</dd></>)}

            {attachments.length > 0 && (
              <>
                <dt style={{ fontWeight: 600, color: '#475569' }}>Attachments</dt>
                <dd style={{ margin: 0 }}>
                  <ul className="att" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {attachments.map((a, i) => (
                      <li key={i}>{a.name}{a.size ? ` (${formatSize(a.size)})` : ''}</li>
                    ))}
                  </ul>
                </dd>
              </>
            )}

            {complaint.complainant_name && (<><dt style={{ fontWeight: 600, color: '#475569' }}>Complainant</dt><dd style={{ margin: 0 }}>{complaint.complainant_name}</dd></>)}
            {complaint.complainant_email && (<><dt style={{ fontWeight: 600, color: '#475569' }}>Contact email</dt><dd style={{ margin: 0 }}>{complaint.complainant_email}</dd></>)}
            {complaint.channel && (<><dt style={{ fontWeight: 600, color: '#475569' }}>Received via</dt><dd style={{ margin: 0 }}>{channelLabel(complaint.channel)}</dd></>)}
            {complaint.sla_days && (
              <>
                <dt style={{ fontWeight: 600, color: '#475569' }}>Target response</dt>
                <dd style={{ margin: 0 }}>Within {complaint.sla_days} business days of the receipt date above.</dd>
              </>
            )}
          </dl>

          <h2 style={{ fontSize: 14, margin: '24px 0 8px', color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>What happens next</h2>
          <ol style={{ fontSize: 13, paddingLeft: 20, marginTop: 4 }}>
            <li>Your complaint enters the triage queue and is classified against our conduct risk taxonomy.</li>
            <li>A case officer will contact you if further information is required.</li>
            <li>You will receive a written outcome once the investigation concludes.</li>
          </ol>

          <div className="footer" style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#64748b' }}>
            Generated {new Date().toLocaleString()} · Any questions? Quote reference{' '}
            <span className="ref">{complaint.complaint_number}</span> when contacting us.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />Close
          </Button>
          <Button data-rbac="complaint_management.view" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />Print / Save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ComplaintAcknowledgement;
