import { Layers, Phone, Mail, MapPin } from 'lucide-react';

export function LandingFooter() {
  return (
    <footer id="footer" className="border-t bg-card py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                <Layers className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground text-sm">RegPortal</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Regulatory Licensing &amp; Compliance Platform
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li><a href="#services" className="hover:text-foreground transition-colors">Services</a></li>
              <li><a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a></li>
              <li><a href="#highlights" className="hover:text-foreground transition-colors">About</a></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Legal</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Accessibility</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Helpdesk</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> +1 (800) 555-0100</li>
              <li className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> support@regportal.gov</li>
              <li className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Government Complex, Bldg A</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} Regulatory Licensing &amp; Compliance Portal. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
