function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Section labels used by the enterprise communication content standard. When a
 * block of copy opens with one of these, it is rendered as a bold sub-heading
 * rather than as an ordinary sentence.
 */
const SECTION_LABELS = new Set(
  [
    "action required",
    "no action required",
    "action taken",
    "deadline",
    "due date",
    "what happens next",
    "next steps",
    "reason",
    "reasons",
    "grounds",
    "remark",
    "remarks",
    "comments",
    "summary",
    "summary of the request",
    "information required",
    "documents required",
    "requirements",
    "outstanding items",
    "decision",
    "determination",
    "outcome",
    "conditions",
    "payment details",
    "amount payable",
    "right of review",
    "right of appeal",
    "review and appeal",
    "consequence of non-compliance",
    "consequences of non-compliance",
    "effective date",
    "period",
    "reporting period",
    "reference",
    "details",
    "your login details",
    "how to respond",
    "security",
    "important",
  ].map((s) => s),
);

const HEADING_STYLE =
  'style="color:#0f172a;margin:18px 0 6px;line-height:1.5;font-size:14px;font-weight:700;"';
const TEXT_STYLE =
  'style="color:#475569;margin:0 0 14px;line-height:1.65;font-size:14px;"';
const LIST_STYLE =
  'style="color:#475569;margin:0 0 14px;padding-left:20px;line-height:1.65;font-size:14px;"';

/** Inline formatting: **bold**, *italic*, `code` and bare URLs. */
function renderInline(line: string): string {
  let html = escapeHtml(line);
  html = html.replace(/`([^`]+)`/g, (_m, t) =>
    `<code style="font-family:'Courier New',Courier,monospace;background:#f1f5f9;padding:1px 4px;border-radius:4px;">${t}</code>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#0f172a;">$1</strong>');
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  html = html.replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
    '<a href="$1" style="color:#1E3A8A;text-decoration:underline;word-break:break-all;">$1</a>',
  );
  return html;
}

const BULLET = /^\s*(?:[-*•]|\u2022)\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

function isHeadingLine(line: string, nextLine: string | undefined): boolean {
  const trimmed = line.trim();
  const raw = trimmed.replace(/:$/, "");
  if (!raw || raw.length > 64) return false;
  if (/\{\{/.test(raw)) return false;
  if (SECTION_LABELS.has(raw.toLowerCase())) return true;
  if (!nextLine) return false;
  // Colon-terminated lead-ins ("Please sign in and:") and list introductions are
  // sentences, not labels.
  if (trimmed.endsWith(":")) return false;
  if (BULLET.test(nextLine) || NUMBERED.test(nextLine)) return false;
  // A short, un-punctuated opening line that introduces further lines in the
  // same block is a label (e.g. "Remark" above the remark text).
  return !/[.,;!?]$/.test(raw) && raw.split(/\s+/).length <= 5;
}


/**
 * Converts the plain-text body stored on a notification template into the
 * HTML used by the branded shell: bold section headings, bulleted and numbered
 * lists, inline emphasis and clickable links. Escaping happens before any
 * markup is introduced, so template content can never inject HTML.
 */
export function renderRichBody(text: string): string {
  const blocks = String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s+$/g, ""))
    .filter((b) => b.trim().length > 0);

  const out: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    let i = 0;
    const paragraph: string[] = [];

    const flush = () => {
      if (paragraph.length) {
        out.push(`<p ${TEXT_STYLE}>${paragraph.join("<br/>")}</p>`);
        paragraph.length = 0;
      }
    };

    while (i < lines.length) {
      const line = lines[i];
      const bullet = BULLET.exec(line);
      const numbered = !bullet ? NUMBERED.exec(line) : null;

      if (bullet || numbered) {
        flush();
        const ordered = Boolean(numbered);
        const items: string[] = [];
        while (i < lines.length) {
          const m = ordered ? NUMBERED.exec(lines[i]) : BULLET.exec(lines[i]);
          if (!m) break;
          items.push(`<li style="margin:0 0 6px;">${renderInline(m[1])}</li>`);
          i += 1;
        }
        const tag = ordered ? "ol" : "ul";
        out.push(`<${tag} ${LIST_STYLE}>${items.join("")}</${tag}>`);
        continue;
      }

      if (paragraph.length === 0 && isHeadingLine(line, lines[i + 1])) {
        flush();
        out.push(`<p ${HEADING_STYLE}>${renderInline(line.trim().replace(/:$/, ""))}</p>`);
        i += 1;
        continue;
      }

      paragraph.push(renderInline(line));
      i += 1;
    }

    flush();
  }

  return out.join("");
}



export interface EmailDetailRow {
  label: string;
  value: string;
}

export interface RenderBrandedEmailArgs {
  appName?: string;
  /** Optional logo URL rendered in the header (falls back to the app name). */
  logoUrl?: string;
  /** Optional strapline shown under the logo/app name. */
  tagline?: string;
  /** Primary brand colour used for the header band and CTA button. */
  brandColor?: string;
  /** Small uppercase label above the heading (e.g. "Email verification"). */
  eyebrow?: string;
  heading: string;
  intro?: string;
  paragraphs?: string[];
  bodyHtml?: string;
  /** Structured key/value rows rendered as a clean details table. */
  details?: EmailDetailRow[];
  /** Large monospaced code block (OTP codes, reference numbers). */
  code?: string;
  codeCaption?: string;
  /** Highlighted callout box (deadlines, warnings, next steps). */
  callout?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  /** Plain-text fallback URL rendered under the CTA for non-clickable clients. */
  showCtaFallbackUrl?: boolean;
  supportEmail?: string;
  supportPhone?: string;
  footerText?: string;
}

/**
 * Single source of truth for the transactional email shell.
 * 600px table-based, mobile-responsive, brandable via site settings.
 */
export function renderBrandedEmail({
  appName,
  logoUrl,
  tagline,
  brandColor,
  eyebrow,
  heading,
  intro,
  paragraphs = [],
  bodyHtml,
  details = [],
  code,
  codeCaption,
  callout,
  ctaUrl,
  ctaLabel,
  showCtaFallbackUrl = true,
  supportEmail,
  supportPhone,
  footerText,
}: RenderBrandedEmailArgs): string {
  const safeAppName = escapeHtml(appName || "Unified License Hub");
  const brand = /^#[0-9a-fA-F]{3,8}$/.test(String(brandColor || "")) ? String(brandColor) : "#1E3A8A";
  const safeHeading = escapeHtml(heading);

  const brandMark = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safeAppName}" width="150" style="display:block;max-width:180px;max-height:48px;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="color:#ffffff;font-weight:700;font-size:18px;letter-spacing:.3px;">${safeAppName}</span>`;

  const taglineHtml = tagline
    ? `<div style="margin-top:6px;color:rgba(255,255,255,0.82);font-size:12px;line-height:1.5;">${escapeHtml(tagline)}</div>`
    : "";

  const eyebrowHtml = eyebrow
    ? `<div style="text-transform:uppercase;letter-spacing:.08em;font-size:11px;font-weight:700;color:${brand};margin:0 0 8px;">${escapeHtml(eyebrow)}</div>`
    : "";

  const introHtml = intro
    ? `<p style="color:#475569;margin:0 0 16px;line-height:1.65;font-size:15px;">${renderInline(intro)}</p>`
    : "";


  const paragraphHtml = bodyHtml || renderRichBody(paragraphs.filter(Boolean).join("\n\n"));


  const codeHtml = code
    ? `<div style="margin:20px 0;text-align:center;">
        <div style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:14px 26px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:700;letter-spacing:.28em;color:#0f172a;">${escapeHtml(code)}</div>
        ${codeCaption ? `<div style="margin-top:8px;color:#94a3b8;font-size:12px;">${escapeHtml(codeCaption)}</div>` : ""}
      </div>`
    : "";

  const detailsHtml = details.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;margin:8px 0 18px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        ${details
          .filter((d) => d && d.label)
          .map((d, i) => `<tr style="background:${i % 2 === 0 ? "#f8fafc" : "#ffffff"};">
            <td style="padding:10px 14px;font-size:12px;color:#64748b;width:42%;border-bottom:1px solid #eef2f7;">${escapeHtml(d.label)}</td>
            <td style="padding:10px 14px;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #eef2f7;">${escapeHtml(d.value ?? "")}</td>
          </tr>`)
          .join("")}
      </table>`
    : "";

  const calloutHtml = callout
    ? `<div style="margin:0 0 18px;padding:12px 14px;border-left:4px solid ${brand};background:#f8fafc;border-radius:8px;color:#334155;font-size:13px;line-height:1.6;">${renderInline(callout).replace(/\n/g, "<br/>")}</div>`
    : "";


  const safeCtaUrl = ctaUrl ? escapeHtml(ctaUrl) : "";
  const safeCtaLabel = escapeHtml(ctaLabel || "Open Portal");
  const ctaBlock = safeCtaUrl
    ? `<div style="text-align:center;margin:24px 0 6px;">
        <a href="${safeCtaUrl}" style="display:inline-block;background:${brand};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 26px;border-radius:10px;font-family:Arial,Helvetica,sans-serif;">${safeCtaLabel}</a>
      </div>
      ${showCtaFallbackUrl ? `<p style="margin:0 0 4px;text-align:center;color:#94a3b8;font-size:11px;line-height:1.6;word-break:break-all;">If the button does not work, copy this link:<br/><span style="color:#64748b;">${safeCtaUrl}</span></p>` : ""}`
    : "";

  const supportLine = supportEmail || supportPhone
    ? `Need help? ${supportEmail ? `Email <a href="mailto:${escapeHtml(supportEmail)}" style="color:${brand};text-decoration:none;">${escapeHtml(supportEmail)}</a>` : ""}${supportEmail && supportPhone ? " or call " : ""}${supportPhone ? escapeHtml(supportPhone) : ""}.`
    : "";

  const resolvedFooter = escapeHtml(footerText || `This is an automated message from ${appName || "Unified License Hub"}. Please do not reply to this email.`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${safeHeading}</title>
<style>
  @media only screen and (max-width:620px) {
    .eml-shell { width:100% !important; }
    .eml-pad { padding:20px 18px !important; }
    .eml-code { font-size:24px !important; letter-spacing:.2em !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#eef2f7;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2f7;padding:24px 10px;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" class="eml-shell" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 10px 28px rgba(15,23,42,0.08);">
        <tr>
          <td class="eml-pad" style="background:${brand};padding:20px 26px;">
            ${brandMark}
            ${taglineHtml}
          </td>
        </tr>
        <tr>
          <td class="eml-pad" style="padding:26px;">
            ${eyebrowHtml}
            <h1 style="margin:0 0 12px;font-size:21px;line-height:1.35;color:#0f172a;font-weight:700;">${safeHeading}</h1>
            ${introHtml}
            ${codeHtml}
            ${paragraphHtml}
            ${detailsHtml}
            ${calloutHtml}
            ${ctaBlock}
          </td>
        </tr>
        <tr>
          <td class="eml-pad" style="background:#f8fafc;padding:16px 26px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.6;">
            ${supportLine ? `<div style="color:#64748b;">${supportLine}</div>` : ""}
            <div style="margin-top:${supportLine ? "8px" : "0"};">${resolvedFooter}</div>
          </td>
        </tr>
      </table>
      <div style="max-width:600px;margin:12px auto 0;color:#94a3b8;font-size:11px;line-height:1.6;text-align:center;">
        ${safeAppName}
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function stripUnresolvedTemplateTokens(input: string): string {
  return String(input || "").replace(/\{\{\s*[^}]+\s*\}\}/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
