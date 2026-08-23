/**
 * Public help / contact page — /help
 * Contact details come from configured site settings, never hardcoded.
 */
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Phone, MapPin } from 'lucide-react';
import { useSiteSettings } from '@/contexts/SiteSettingsContext';
import { PublicInfoBadge, SignInCta } from '@/components/public/AccessBadges';

export default function PublicHelp() {
  const { footer, general } = useSiteSettings();
  const email = footer.helpdesk?.email || general.contact_email;
  const phone = footer.helpdesk?.phone || general.contact_phone;
  const address = footer.helpdesk?.address || general.address;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />

      <main>
        <section className="border-b bg-muted/40">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
            <PublicInfoBadge />
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Help and contact</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Support for applicants, regulated entities and members of the public.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <SignInCta label="Sign In" target="/dashboard" />
              <Button asChild variant="outline"><Link to="/licensee-services">Licensee Services</Link></Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" /> Email</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground break-words">{email || '—'}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4" /> Telephone</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{phone || '—'}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4" /> Address</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{address || '—'}</CardContent>
          </Card>
        </section>

        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Getting portal access</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                If your organisation is already regulated but you do not have portal access, identify
                your organisation and request access as an authorised representative.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link to="/register/entity">Connect to Existing Entity</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to="/register/applicant">Start a New Application</Link></Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Trouble signing in</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Reset your password, or contact support if your account is locked or your access has
                not yet been approved.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link to="/forgot-password">Forgot password</Link></Button>
                <SignInCta label="Sign In" target="/dashboard" size="sm" />
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
