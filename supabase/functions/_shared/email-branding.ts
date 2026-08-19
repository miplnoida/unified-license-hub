/**
 * Loads branding + contact details from site_settings for transactional email.
 * Cached for a short window so a burst of emails does not re-query per message.
 */
export interface EmailBranding {
  appName: string;
  tagline: string;
  logoUrl: string;
  supportEmail: string;
  supportPhone: string;
  footerText: string;
  brandColor: string;
  siteUrl: string;
}

const DEFAULTS: EmailBranding = {
  appName: "Unified License Hub",
  tagline: "",
  logoUrl: "",
  supportEmail: "",
  supportPhone: "",
  footerText: "",
  brandColor: "#1E3A8A",
  siteUrl: "",
};

let cache: { value: EmailBranding; at: number } | null = null;
const TTL_MS = 60_000;

export async function loadEmailBranding(supabase: any): Promise<EmailBranding> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["branding", "footer", "general"]);

    const byKey: Record<string, any> = {};
    for (const row of (data as Array<{ key: string; value: any }> | null) || []) {
      byKey[row.key] = row.value || {};
    }
    const branding = byKey.branding || {};
    const footer = byKey.footer || {};
    const general = byKey.general || {};

    const value: EmailBranding = {
      appName: branding.site_name || general.org_short_name || general.org_name || DEFAULTS.appName,
      tagline: branding.tagline || general.org_name || "",
      logoUrl: branding.logo_url || "",
      supportEmail: footer?.helpdesk?.email || general.contact_email || "",
      supportPhone: footer?.helpdesk?.phone || general.contact_phone || "",
      footerText: footer?.text || "",
      brandColor: DEFAULTS.brandColor,
      siteUrl: "",
    };
    cache = { value, at: Date.now() };
    return value;
  } catch (_err) {
    return DEFAULTS;
  }
}

export function defaultEmailBranding(): EmailBranding {
  return { ...DEFAULTS };
}
