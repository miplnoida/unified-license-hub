function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderBrandedEmailArgs {
  appName?: string;
  heading: string;
  intro?: string;
  paragraphs?: string[];
  bodyHtml?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  supportEmail?: string;
  footerText?: string;
}

export function renderBrandedEmail({
  appName,
  heading,
  intro,
  paragraphs = [],
  bodyHtml,
  ctaUrl,
  ctaLabel,
  supportEmail,
  footerText,
}: RenderBrandedEmailArgs): string {
  const safeAppName = escapeHtml(appName || "Unified License Hub");
  const safeHeading = escapeHtml(heading);
  const safeIntro = intro ? `<p style="color:#475569;margin:0 0 16px;line-height:1.6;font-size:14px;">${escapeHtml(intro)}</p>` : "";
  const paragraphHtml = bodyHtml || paragraphs
    .filter(Boolean)
    .map((p) => `<p style="color:#475569;margin:0 0 14px;line-height:1.6;font-size:14px;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const safeCtaUrl = ctaUrl ? escapeHtml(ctaUrl) : "";
  const safeCtaLabel = escapeHtml(ctaLabel || "Open Portal");
  const ctaBlock = safeCtaUrl
    ? `<div style="text-align:center;margin:24px 0 8px;"><a href="${safeCtaUrl}" style="display:inline-block;background:#1E3A8A;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;font-family:Arial,sans-serif;">${safeCtaLabel}</a></div>`
    : "";
  const supportLine = supportEmail
    ? `Need help? Contact <a href="mailto:${escapeHtml(supportEmail)}" style="color:#1E3A8A;text-decoration:none;">${escapeHtml(supportEmail)}</a>.`
    : "";
  const resolvedFooter = escapeHtml(footerText || `This is an automated message from ${safeAppName}. Please do not reply to this email.`);

  return `<div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);border:1px solid #e2e8f0;">
      <div style="background:#1E3A8A;padding:18px 24px;color:#ffffff;font-weight:700;font-size:16px;letter-spacing:.3px;">${safeAppName}</div>
      <div style="padding:24px;">
        <h2 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f172a;">${safeHeading}</h2>
        ${safeIntro}
        ${paragraphHtml}
        ${ctaBlock}
      </div>
      <div style="background:#f8fafc;padding:14px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.6;">
        ${supportLine ? `<div>${supportLine}</div>` : ""}
        <div style="margin-top:${supportLine ? "6px" : "0"};">${resolvedFooter}</div>
      </div>
    </div>
  </div>`;
}

export function stripUnresolvedTemplateTokens(input: string): string {
  return String(input || "").replace(/\{\{\s*[^}]+\s*\}\}/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
