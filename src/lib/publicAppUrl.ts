import { supabase } from '@/integrations/supabase/client';

/**
 * Resolves the public application base URL used inside outbound content
 * (emails, SMS, portal links).
 *
 * Preview/staging origins must never leak into recipient-facing content, so the
 * configured `site_config.app_base_url` setting always wins over the browser
 * origin. The browser origin remains the last-resort fallback so links are
 * never emitted empty.
 */

let cached: { value: string; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

const strip = (v: string) => v.trim().replace(/\/+$/, '');

export async function publicAppBaseUrl(): Promise<string> {
  const fallback = typeof window !== 'undefined' ? strip(window.location.origin) : '';
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value || fallback;

  try {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'site_config')
      .maybeSingle();
    const configured = (data?.value as Record<string, unknown> | null)?.app_base_url;
    const value = typeof configured === 'string' && configured.trim() ? strip(configured) : '';
    cached = { value, at: Date.now() };
    return value || fallback;
  } catch {
    return fallback;
  }
}

/** Builds an absolute public link for a path such as `/declaration/abc`. */
export async function publicAppUrl(path: string): Promise<string> {
  const base = await publicAppBaseUrl();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
