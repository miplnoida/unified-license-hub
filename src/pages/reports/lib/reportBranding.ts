/**
 * Official letterhead for every report export (PDF / Excel / print).
 * Logo and authority name come from Settings → Branding, so changing the
 * logo there updates every report without code changes.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ReportBranding {
  authorityName: string;
  tagline: string;
  logoUrl: string | null;
  logoDataUrl: string | null;
  logoWidth: number;
  logoHeight: number;
}

let cache: Promise<ReportBranding> | null = null;

async function toDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const data: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = data;
    });
    return { data, ...dims };
  } catch {
    return null;
  }
}

export function loadReportBranding(force = false): Promise<ReportBranding> {
  if (cache && !force) return cache;
  cache = (async () => {
    let authorityName = 'Financial Services Regulatory Authority';
    let tagline = '';
    let logoUrl: string | null = null;
    try {
      const { data } = await (supabase as any)
        .from('site_settings').select('key,value').in('key', ['branding']);
      const b = (data || []).find((r: any) => r.key === 'branding')?.value || {};
      authorityName = b.report_authority_name || b.site_name || authorityName;
      tagline = b.tagline || '';
      logoUrl = b.report_logo_url || b.logo_url || null;
    } catch { /* letterhead falls back to text only */ }
    const img = logoUrl ? await toDataUrl(logoUrl) : null;
    return {
      authorityName, tagline, logoUrl,
      logoDataUrl: img?.data ?? null,
      logoWidth: img?.w ?? 0,
      logoHeight: img?.h ?? 0,
    };
  })();
  return cache;
}

/** Fit a logo into a max box, preserving aspect ratio. */
export function fitLogo(w: number, h: number, maxW: number, maxH: number) {
  if (!w || !h) return { w: 0, h: 0 };
  const s = Math.min(maxW / w, maxH / h);
  return { w: w * s, h: h * s };
}
