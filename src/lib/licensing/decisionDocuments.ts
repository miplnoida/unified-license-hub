/**
 * Shared render helpers for issued decision documents (LIC-DEC-002).
 *
 * Both the on-screen preview and the immutable artefact recorded by
 * `issue_decision_artifact` must render from the SAME source, so what an
 * approver reviews is byte-identical to what is stored. The certificate has its
 * own layout and field set — it must never be persisted as decision-letter
 * markup.
 */

export interface CertificateRenderInput {
  regulatorName: string;
  regulatorAddress?: string | null;
  entityName: string;
  applicationNumber: string;
  licenseReference?: string | null;
  licenseType: string;
  decisionLabel?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  conditions: string[];
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  draft?: boolean;
}

export const escapeHtml = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const formatCertificateDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

/**
 * Certificate-specific rendered content. Deterministic for a given input so
 * that the preview and the issued artefact can be compared exactly.
 */
export function renderLicenseCertificateHtml(input: CertificateRenderInput): string {
  const e = escapeHtml;
  const rows: Array<[string, string]> = [
    ['Licensed entity', input.entityName || '—'],
    ['Licence reference', input.licenseReference || input.applicationNumber || '—'],
    ['Application reference', input.applicationNumber || '—'],
    ['Licence / service', input.licenseType || '—'],
    ['Issuing regulator', input.regulatorName || '—'],
    ['Effective date', formatCertificateDate(input.effectiveDate)],
    ['Expiry date', input.expiryDate ? formatCertificateDate(input.expiryDate) : 'Not applicable'],
  ];
  if (input.decisionLabel) rows.push(['Determination', input.decisionLabel]);

  const conditions = (input.conditions ?? []).map((c) => String(c).trim()).filter(Boolean);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(
    `Licence certificate — ${input.entityName || input.applicationNumber}`
  )}</title>
<style>
 body{font-family:Georgia,'Times New Roman',serif;max-width:820px;margin:40px auto;padding:0 36px;color:#111;line-height:1.55}
 .cert{border:6px double #1E3A8A;padding:32px 36px}
 .cert h1{font-size:20px;letter-spacing:1px;text-align:center;color:#1E3A8A;margin:0 0 4px}
 .cert h2{font-size:14px;text-align:center;text-transform:uppercase;letter-spacing:3px;margin:0 0 24px;color:#16A34A}
 .org{text-align:center;font-size:12px;color:#555;margin-bottom:24px}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th{text-align:left;width:34%;padding:7px 0;color:#555;font-weight:normal;vertical-align:top}
 td{padding:7px 0;font-weight:bold}
 .conditions{margin-top:24px;font-size:13px}
 .conditions h3{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#555;margin:0 0 6px}
 .sig{margin-top:40px;font-size:13px}
 .sig .line{border-top:1px solid #333;width:260px;margin-bottom:4px}
 .draft{margin-top:28px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:10px;text-align:center}
</style></head><body>
 <div class="cert" data-document-type="license_certificate">
  <h1>${e((input.regulatorName || 'REGULATORY AUTHORITY').toUpperCase())}</h1>
  <h2>Licence Certificate</h2>
  ${input.regulatorAddress ? `<p class="org">${e(input.regulatorAddress)}</p>` : ''}
  <table>
   ${rows.map(([k, v]) => `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>`).join('\n   ')}
  </table>
  <div class="conditions">
   <h3>Conditions of licence</h3>
   ${
     conditions.length
       ? `<ol>${conditions.map((c) => `<li>${e(c)}</li>`).join('')}</ol>`
       : '<p>No specific conditions attached to this licence.</p>'
   }
  </div>
  <div class="sig">
   <div class="line"></div>
   <div>${e(input.signatoryName || '[Authorised signatory not configured]')}</div>
   <div>${e(input.signatoryTitle || '')}</div>
  </div>
  ${
    input.draft
      ? `<div class="draft">DRAFT PREVIEW — certificate for application ${e(
          input.applicationNumber
        )}. Not an issued licence.</div>`
      : ''
  }
 </div>
</body></html>`;
}
