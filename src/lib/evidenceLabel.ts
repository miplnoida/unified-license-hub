/**
 * UI-only formatter that converts raw evidence path strings produced by the
 * AI assessment (e.g. `application_data.forms_data.<uuid>.payment_receipt.url`)
 * into business-friendly labels for non-technical reviewers.
 *
 * Does NOT change the underlying evidence value — purely a presentation helper.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STRIP_PREFIX_SEGMENTS = new Set([
  'application_data',
  'forms_data',
  'form_data',
  'submission',
  'submissions',
  'data',
  'fields',
  'field',
  'values',
  'value',
]);

const FILE_SUFFIXES = new Set(['url', 'path', 'file', 'filename', 'files']);
const TRIVIAL_SUFFIXES = new Set(['value', 'id', 'name', 'label']);

const ACRONYMS = new Set([
  'AML', 'CFT', 'KYC', 'FATF', 'PEP', 'UBO', 'ID', 'PAN', 'GST', 'TIN',
  'NOC', 'MOA', 'AOA', 'CIN', 'GSTIN', 'IFSC', 'MICR', 'OTP', 'URL',
  'API', 'CEO', 'CFO', 'CTO', 'COO', 'HR', 'IT', 'KPI', 'SLA', 'SOP',
  'DOB', 'POA', 'POI', 'RBI', 'SEBI', 'IRDAI', 'FIU',
]);

const KNOWN_LABELS: Record<string, string> = {
  payment_receipt: 'Payment Receipt',
  payment_proof: 'Payment Proof',
  aml_cft_documents: 'AML/CFT Documents',
  aml_cft_document: 'AML/CFT Document',
  aml_policy: 'AML Policy',
  kyc_documents: 'KYC Documents',
  business_plan_documents: 'Business Plan',
  business_plan: 'Business Plan',
  premises_documents: 'Premises Documents',
  premises_proof: 'Premises Proof',
  paid_up_capital_evidence: 'Paid-up Capital Evidence',
  corporate_structure_documents: 'Corporate Structure Documents',
  board_resolution: 'Board Resolution',
  director_ids: 'Director IDs',
  pan_card: 'PAN Card',
  gst_certificate: 'GST Certificate',
  incorporation_certificate: 'Incorporation Certificate',
};

const UPLOAD_KEY_SUFFIXES = [
  '_document', '_documents', '_evidence', '_receipt', '_proof',
  '_certificate', '_attachment', '_attachments', '_upload', '_uploads', '_file', '_files',
];

function titleCaseWithAcronyms(key: string): string {
  return key
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((tok) => {
      const upper = tok.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      // Handle compound acronym tokens like "aml/cft"
      if (tok.includes('/')) {
        return tok
          .split('/')
          .map((p) => (ACRONYMS.has(p.toUpperCase()) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
          .join('/');
      }
      return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Convert a single raw evidence string into a business-friendly label.
 * If the input does not look like a dotted internal path, returns it unchanged
 * so AI free-text evidence is preserved.
 */
export function formatEvidence(raw: unknown): string {
  if (raw == null) return '';
  const str = String(raw).trim();
  if (!str) return '';

  // Only transform dotted-path-looking strings. Anything else is treated as
  // human-written evidence and passes through untouched.
  if (!str.includes('.') || /\s/.test(str)) {
    return str;
  }

  const segments = str.split('.').filter(Boolean);
  let isUpload = false;

  // Strip trailing technical suffixes (may be multiple, e.g. ".url" then nothing)
  while (segments.length > 1) {
    const last = segments[segments.length - 1].toLowerCase();
    if (FILE_SUFFIXES.has(last)) {
      isUpload = true;
      segments.pop();
    } else if (TRIVIAL_SUFFIXES.has(last)) {
      segments.pop();
    } else {
      break;
    }
  }

  // Strip leading container prefixes and UUID segments anywhere.
  const cleaned = segments.filter((seg) => {
    const low = seg.toLowerCase();
    if (STRIP_PREFIX_SEGMENTS.has(low)) return false;
    if (UUID_RE.test(seg)) return false;
    return true;
  });

  if (cleaned.length === 0) {
    return str; // nothing meaningful left — safer to show original
  }

  const keyRaw = cleaned[cleaned.length - 1];
  const keyLow = keyRaw.toLowerCase();

  let label = KNOWN_LABELS[keyLow] ?? titleCaseWithAcronyms(keyRaw);

  // Prefix with parent context if there are additional meaningful segments
  if (cleaned.length > 1) {
    const parents = cleaned.slice(0, -1).map((p) =>
      KNOWN_LABELS[p.toLowerCase()] ?? titleCaseWithAcronyms(p),
    );
    label = `${parents.join(' › ')} › ${label}`;
  }

  const looksLikeUploadKey = UPLOAD_KEY_SUFFIXES.some((s) => keyLow.endsWith(s));
  if ((isUpload || looksLikeUploadKey) && !/uploaded$/i.test(label)) {
    label = `${label} uploaded`;
  }

  return label;
}

export function formatEvidenceList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.map(formatEvidence).filter((v) => v.length > 0);
}
