import { useSiteSettings } from '@/contexts/SiteSettingsContext';

/** Official authority letterhead shown on report previews and printouts. */
export function ReportLetterhead({ title }: { title?: string }) {
  const { branding } = useSiteSettings();
  return (
    <div className="flex items-center gap-4 border-b-2 border-primary pb-3 mb-3">
      {branding.logo_url && (
        <img src={branding.logo_url} alt={branding.site_name} className="h-12 w-auto max-w-[160px] object-contain" />
      )}
      <div className="min-w-0">
        <div className="text-base font-semibold text-primary">{branding.site_name}</div>
        {branding.tagline && <div className="text-xs text-muted-foreground">{branding.tagline}</div>}
        {title && <div className="text-sm font-medium mt-1">{title}</div>}
      </div>
    </div>
  );
}
