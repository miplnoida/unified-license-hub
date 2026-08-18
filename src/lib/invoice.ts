import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';

export interface InvoiceRecord {
  id: string;
  payment_id: string;
  invoice_number: string | null;
  receipt_number: string;
  issued_to_name: string;
  issued_to_email: string | null;
  amount: number;
  currency: string;
  subtotal: number | null;
  tax_amount: number;
  total_amount: number | null;
  fee_breakdown: unknown;
  payment_method: string | null;
  payment_reference: string | null;
  payment_channel: string | null;
  paid_at: string | null;
  issued_at: string;
  application_id: string | null;
}

interface FeeLine { label?: string; name?: string; amount?: number | string }

/**
 * Ensure the invoice exists for a confirmed payment (idempotent, server-side)
 * and return the stored invoice record. Applicants can only reach their own
 * payment; regulators can reach any.
 */
export async function fetchOrIssueInvoice(paymentId: string): Promise<InvoiceRecord | null> {
  const { data: issued, error: rpcError } = await supabase.rpc('issue_payment_invoice', {
    _payment_id: paymentId,
  });
  if (rpcError) {
    toast.error(rpcError.message || 'Could not prepare the invoice.');
    return null;
  }
  const result = issued as { ok?: boolean; message?: string } | null;
  if (!result?.ok) {
    toast.error(result?.message || 'Invoice is not available yet.');
    return null;
  }

  const { data, error } = await supabase
    .from('payment_receipts')
    .select(
      'id, payment_id, invoice_number, receipt_number, issued_to_name, issued_to_email, amount, currency, subtotal, tax_amount, total_amount, fee_breakdown, payment_method, payment_reference, payment_channel, paid_at, issued_at, application_id',
    )
    .eq('payment_id', paymentId)
    .maybeSingle();

  if (error || !data) {
    toast.error('Invoice could not be loaded.');
    return null;
  }
  return data as unknown as InvoiceRecord;
}

function normaliseLines(breakdown: unknown, fallbackAmount: number): { label: string; amount: number }[] {
  if (Array.isArray(breakdown) && breakdown.length) {
    return (breakdown as FeeLine[]).map((line, index) => ({
      label: String(line.label ?? line.name ?? `Item ${index + 1}`),
      amount: Number(line.amount ?? 0),
    }));
  }
  return [{ label: 'Application fee', amount: fallbackAmount }];
}

/** Render the stored invoice snapshot to a PDF and download it. */
export function downloadInvoicePdf(invoice: InvoiceRecord, opts?: {
  organisationName?: string;
  applicationNumber?: string | null;
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const currency = invoice.currency || 'USD';
  const money = (value: number) =>
    `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  let y = 56;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(opts?.organisationName || 'Regulatory Authority', 48, y);

  doc.setFontSize(20);
  doc.text('TAX INVOICE', pageWidth - 48, y, { align: 'right' });

  y += 34;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Invoice No: ${invoice.invoice_number ?? invoice.receipt_number}`, 48, y);
  doc.text(`Issued: ${formatDateTime(invoice.issued_at)}`, pageWidth - 48, y, { align: 'right' });

  y += 16;
  if (opts?.applicationNumber) {
    doc.text(`Application: ${opts.applicationNumber}`, 48, y);
  }
  doc.text(`Receipt No: ${invoice.receipt_number}`, pageWidth - 48, y, { align: 'right' });

  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.text('Billed to', 48, y);
  doc.setFont('helvetica', 'normal');
  y += 15;
  doc.text(invoice.issued_to_name, 48, y);
  if (invoice.issued_to_email) {
    y += 14;
    doc.text(invoice.issued_to_email, 48, y);
  }

  y += 30;
  doc.setFont('helvetica', 'bold');
  doc.text('Description', 48, y);
  doc.text('Amount', pageWidth - 48, y, { align: 'right' });
  y += 8;
  doc.line(48, y, pageWidth - 48, y);
  doc.setFont('helvetica', 'normal');

  const lines = normaliseLines(invoice.fee_breakdown, Number(invoice.amount));
  for (const line of lines) {
    y += 20;
    doc.text(line.label, 48, y);
    doc.text(money(line.amount), pageWidth - 48, y, { align: 'right' });
  }

  y += 12;
  doc.line(48, y, pageWidth - 48, y);

  const subtotal = Number(invoice.subtotal ?? invoice.amount);
  const tax = Number(invoice.tax_amount ?? 0);
  const total = Number(invoice.total_amount ?? invoice.amount);

  y += 20;
  doc.text('Subtotal', pageWidth - 180, y);
  doc.text(money(subtotal), pageWidth - 48, y, { align: 'right' });
  y += 16;
  doc.text('Tax', pageWidth - 180, y);
  doc.text(money(tax), pageWidth - 48, y, { align: 'right' });
  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.text('Total paid', pageWidth - 180, y);
  doc.text(money(total), pageWidth - 48, y, { align: 'right' });

  y += 34;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Payment method: ${(invoice.payment_method || 'online').replace(/_/g, ' ')}`, 48, y);
  y += 14;
  doc.text(`Payment channel: ${invoice.payment_channel || 'online'}`, 48, y);
  y += 14;
  doc.text(`Payment reference: ${invoice.payment_reference || '—'}`, 48, y);
  y += 14;
  doc.text(`Paid on: ${invoice.paid_at ? formatDateTime(invoice.paid_at) : '—'}`, 48, y);

  y += 30;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    'This invoice is generated from the recorded payment and reflects the fee breakdown at the time of payment.',
    48,
    y,
  );

  doc.save(`invoice-${invoice.invoice_number ?? invoice.receipt_number}.pdf`);
}

/** Convenience: issue (if needed) then download. */
export async function downloadInvoiceForPayment(paymentId: string, opts?: {
  organisationName?: string;
  applicationNumber?: string | null;
}): Promise<boolean> {
  const invoice = await fetchOrIssueInvoice(paymentId);
  if (!invoice) return false;
  downloadInvoicePdf(invoice, opts);
  return true;
}
