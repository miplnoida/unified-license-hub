import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───
export interface BrandingSettings {
  site_name: string;
  logo_url: string;
  favicon_url: string;
  tagline: string;
}

export interface HeaderMenuItem {
  label: string;
  href: string;
}

export interface FooterSettings {
  text: string;
  links: { label: string; href: string }[];
  helpdesk: { phone: string; email: string; address: string };
  social: { icon: string; href: string; label: string }[];
}

export interface SiteSettings {
  branding: BrandingSettings;
  header_menu: HeaderMenuItem[];
  footer: FooterSettings;
  loading: boolean;
}

// ─── Defaults (fallback if API fails) ───
const DEFAULT_BRANDING: BrandingSettings = {
  site_name: 'RegPortal',
  logo_url: '',
  favicon_url: '',
  tagline: 'Regulatory Licensing & Compliance Platform',
};

const DEFAULT_HEADER_MENU: HeaderMenuItem[] = [
  { label: 'Home', href: '#' },
  { label: 'Services', href: '#services' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'About', href: '#highlights' },
  { label: 'Contact', href: '#footer' },
];

const DEFAULT_FOOTER: FooterSettings = {
  text: 'Regulatory Licensing & Compliance Portal. All rights reserved.',
  links: [
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
    { label: 'Accessibility', href: '#' },
  ],
  helpdesk: { phone: '+1 (800) 555-0100', email: 'support@regportal.gov', address: 'Government Complex, Bldg A' },
  social: [],
};

const DEFAULTS: SiteSettings = {
  branding: DEFAULT_BRANDING,
  header_menu: DEFAULT_HEADER_MENU,
  footer: DEFAULT_FOOTER,
  loading: true,
};

// ─── Context ───
const SiteSettingsContext = createContext<SiteSettings>(DEFAULTS);

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}

// ─── Provider ───
const CACHE_KEY = 'site_settings_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(() => {
    // Try reading from sessionStorage cache first
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          return { ...data, loading: false };
        }
      }
    } catch { /* ignore */ }
    return DEFAULTS;
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchSettings() {
      try {
        const { data, error } = await (supabase.from('site_settings' as any).select('key, value') as any);
        if (error) throw error;

        const map: Record<string, any> = {};
        (data || []).forEach((row: any) => { map[row.key] = row.value; });

        const resolved: SiteSettings = {
          branding: { ...DEFAULT_BRANDING, ...(map.branding || {}) },
          header_menu: Array.isArray(map.header_menu) ? map.header_menu : DEFAULT_HEADER_MENU,
          footer: { ...DEFAULT_FOOTER, ...(map.footer || {}) },
          loading: false,
        };

        if (!cancelled) {
          setSettings(resolved);
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: resolved, ts: Date.now() }));
        }
      } catch (err) {
        console.error('[SiteSettings] fetch failed, using defaults:', err);
        if (!cancelled) setSettings(prev => ({ ...prev, loading: false }));
      }
    }

    fetchSettings();
    return () => { cancelled = true; };
  }, []);

  // Dynamic document title & favicon
  useEffect(() => {
    if (settings.loading) return;
    document.title = settings.branding.site_name || 'RegPortal';

    if (settings.branding.favicon_url) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = settings.branding.favicon_url;
    }
  }, [settings.branding.site_name, settings.branding.favicon_url, settings.loading]);

  return (
    <SiteSettingsContext.Provider value={settings}>
      {children}
    </SiteSettingsContext.Provider>
  );
}
