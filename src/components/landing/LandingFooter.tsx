import { Layers, Phone, Mail, MapPin, Facebook, Twitter, Instagram, Linkedin, Globe } from 'lucide-react';
import { useSiteSettings } from '@/contexts/SiteSettingsContext';

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  facebook: <Facebook className="h-3.5 w-3.5" />,
  twitter: <Twitter className="h-3.5 w-3.5" />,
  instagram: <Instagram className="h-3.5 w-3.5" />,
  linkedin: <Linkedin className="h-3.5 w-3.5" />,
  website: <Globe className="h-3.5 w-3.5" />,
};

export function LandingFooter() {
  const { branding, footer } = useSiteSettings();

  return (
    <footer id="footer" className="border-t bg-card py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt={branding.site_name} className="h-7 w-7 rounded-md object-contain" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                  <Layers className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
              )}
              <span className="font-bold text-foreground text-sm">{branding.site_name}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {branding.tagline}
            </p>
            {/* Social icons */}
            {footer.social?.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                {footer.social.map((s) => (
                  <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors" title={s.label}>
                    {SOCIAL_ICONS[s.icon] || <Globe className="h-3.5 w-3.5" />}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links from header menu */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li><a href="#services" className="hover:text-foreground transition-colors">Services</a></li>
              <li><a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a></li>
              <li><a href="#highlights" className="hover:text-foreground transition-colors">About</a></li>
            </ul>
          </div>

          {/* Legal / dynamic links */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Legal</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {footer.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="hover:text-foreground transition-colors">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Helpdesk</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {footer.helpdesk.phone}</li>
              <li className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {footer.helpdesk.email}</li>
              <li className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {footer.helpdesk.address}</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} {footer.text}
        </div>
      </div>
    </footer>
  );
}
