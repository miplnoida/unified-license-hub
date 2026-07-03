import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { logAudit } from '@/lib/audit';
import { logExport } from '@/lib/exportAudit';

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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaint: ComplaintAckInput;
}

/**
 * Printable / downloadable complaint acknowledgement artifact (S4 DEMO-MCS-003).
 * Uses `window.print()` with a print-only stylesheet so the browser's built-in
 * "Save as PDF" produces a clean single-page acknowledgement.
 */
export function ComplaintAcknowledgement({ open, onOpenChange, complaint }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = async () => {
    const contents = printRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank', 'width=800,height=1000');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Complaint Acknowledgement ${complaint.complaint_number}</title>
      <style>
        body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; padding: 40px; color: #0f172a; }
        h1 { font-size: 22px; margin: 0 0 8px; color: #1E3A8A; }
        h2 { font-size: 14px; margin: 24px 0 8px; color: #1E3A8A; text-transform: uppercase; letter-spacing: 0.5px; }
        .header { border-bottom: 2px solid #1E3A8A; padding-bottom: 16px; margin-bottom: 24px; }
        .meta { display: grid; grid-template-columns: 200px 1fr; gap: 8px 16px; font-size: 14px; }
        .meta dt { font-weight: 600; color: #475569; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; background: #16A34A; color: white; font-size: 12px; letter-spacing: 0.5px; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
        .ref { font-family: 'JetBrains Mono', monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
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

  const submittedFmt = new Date(complaint.submitted_at).toLocaleString();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Complaint acknowledgement</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="border rounded-md p-6 bg-white">
          <div className="header">
            <h1>{complaint.regulator_name ?? 'Regulator'} — Complaint Acknowledgement</h1>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              This document confirms receipt of your complaint. Retain this reference for your records.
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <span className="badge">Acknowledged</span>
          </div>

          <dl className="meta">
            <dt>Reference number</dt>
            <dd><span className="ref">{complaint.complaint_number}</span></dd>

            <dt>Received at</dt>
            <dd>{submittedFmt}</dd>

            <dt>Subject</dt>
            <dd>{complaint.subject}</dd>

            {complaint.complainant_name && (<><dt>Complainant</dt><dd>{complaint.complainant_name}</dd></>)}
            {complaint.complainant_email && (<><dt>Contact email</dt><dd>{complaint.complainant_email}</dd></>)}
            {complaint.channel && (<><dt>Channel</dt><dd>{complaint.channel}</dd></>)}
            {complaint.sla_days && (
              <>
                <dt>Target response</dt>
                <dd>Within {complaint.sla_days} business days of the receipt date above.</dd>
              </>
            )}
          </dl>

          <h2>What happens next</h2>
          <ol style={{ fontSize: 13, paddingLeft: 20, marginTop: 4 }}>
            <li>Your complaint enters the triage queue and is classified against our conduct risk taxonomy.</li>
            <li>A case officer will contact you if further information is required.</li>
            <li>You will receive a written outcome once the investigation concludes.</li>
          </ol>

          <div className="footer">
            Generated {new Date().toLocaleString()} · Any questions? Quote reference{' '}
            <span className="ref">{complaint.complaint_number}</span> when contacting us.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />Close
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />Print / Save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ComplaintAcknowledgement;
