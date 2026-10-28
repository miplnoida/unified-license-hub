import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Layers, Menu, X, HelpCircle, Lock } from 'lucide-react';
import { useSiteSettings } from '@/contexts/SiteSettingsContext';
import { PublicBreadcrumbBar } from '@/components/layout/ApplicationBreadcrumbs';

/**
 * Canonical logged-out navigation. These entries are fixed platform
 * destinations (not editable branding links) so that public licensee-facing
 * routes and Sign In are always reachable.
 */
const PUBLIC_NAV = [
  { label: 'Home', to: '/' },
  { label: 'Applicants', to: '/applicants' },
  { label: 'For Licensees', to: '/licensee-services' },
  { label: 'Public Register', to: '/registry' },
  { label: 'Guidance', to: '/guidance' },
  { label: 'File a Complaint', to: '/complaints/file' },
  { label: 'Track a Complaint', to: '/track/complaint' },
  { label: 'Help / Contact', to: '/help' },

];

export function LandingNav() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { branding } = useSiteSettings();


  return (
    <nav className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={branding.site_name} className="h-12 w-auto max-w-[240px] rounded-md object-contain" />
          ) : (
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                <Layers className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-base font-bold tracking-tight text-foreground">{branding.site_name}</span>
            </>
          )}
        </Link>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-5">
          {PUBLIC_NAV.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Desktop auth — Sign In must remain visible on every public page */}
        <div className="hidden md:flex items-center gap-2">
          <Link to="/help" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mr-1">
            <HelpCircle className="h-3.5 w-3.5" /> Help
          </Link>
          <Button variant="outline" size="sm" onClick={() => navigate('/login')}>
            <Lock className="mr-1.5 h-3.5 w-3.5" /> Sign In
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/register')}>
            Apply / Register
          </Button>
        </div>

        {/* Mobile toggle */}
        <div className="flex items-center gap-2 lg:hidden">
          <Button variant="outline" size="sm" className="md:hidden" onClick={() => navigate('/login')}>
            <Lock className="mr-1.5 h-3.5 w-3.5" /> Sign In
          </Button>
          <button aria-label="Toggle menu" className="p-2" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t bg-card px-4 pb-4 pt-2 space-y-1 animate-fade-in">
          {PUBLIC_NAV.map((l) => (
            <Link key={l.label} to={l.to} onClick={() => setOpen(false)}
              className="block py-2 text-sm text-muted-foreground hover:text-foreground">
              {l.label}
            </Link>
          ))}
          <div className="flex gap-2 pt-3">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { setOpen(false); navigate('/login'); }}>
              Sign In
            </Button>
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => { setOpen(false); navigate('/register'); }}>
              Apply / Register
            </Button>
          </div>
        </div>
      )}


      {/*
        Public breadcrumb bar. Single integration point for every unauthenticated
        surface (registry, registration, tracking). Renders nothing on the
        landing page, where the trail is a single crumb.
      */}
      <PublicBreadcrumbBar />
    </nav>
  );
}

