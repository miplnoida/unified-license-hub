/**
 * Public process detail page for a single licensee service —
 * /licensee-services/:slug
 *
 * Renders the standard public information blocks: About / Who should use this /
 * Before you start / Process / After you submit / Need help / Action.
 * Purely informational: no entity data is fetched.
 */
import { Link, useParams, Navigate } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Info, ShieldAlert } from 'lucide-react';
import { PublicInfoBadge, SecureServiceBadge, SignInCta } from '@/components/public/AccessBadges';
import { getService, STATUS_LABEL } from '@/lib/publicServices/catalogue';

export default function LicenseeServiceDetail() {
  const { slug } = useParams();
  const service = getService(slug);

  if (!service) return <Navigate to="/licensee-services" replace />;

  const requiresSignIn = Boolean(service.authenticatedRoute);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <Link
          to="/licensee-services"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Licensee services
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <PublicInfoBadge />
          {requiresSignIn && <SecureServiceBadge />}
        </div>

        <h1 className="mt-3 text-3xl font-bold tracking-tight">{service.name}</h1>
        <p className="mt-2 text-muted-foreground">{service.summary}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="outline">{service.group}</Badge>
          <Badge variant="outline">{STATUS_LABEL[service.status]}</Badge>
          <Badge variant="secondary">Initiated by: {service.initiatedBy}</Badge>
        </div>

        {/* Primary actions */}
        <Card className="mt-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {requiresSignIn
                ? 'This service is delivered inside the secure entity portal. Sign in to continue.'
                : 'This service is available publicly.'}
            </div>
            <div className="flex flex-wrap gap-2">
              {service.publicCta && (
                <Button asChild variant="secondary" size="sm">
                  <Link to={service.publicCta.href}>{service.publicCta.label}</Link>
                </Button>
              )}
              {requiresSignIn && (
                <SignInCta label={service.ctaLabel} target={service.authenticatedRoute} size="sm" />
              )}
            </div>
          </CardContent>
        </Card>

        <Block title="About this service">
          <p className="text-sm text-muted-foreground">{service.about}</p>
        </Block>

        <Block title="Who should use this">
          <div className="flex flex-wrap gap-2">
            {service.audience.map((a) => (
              <Badge key={a} variant="outline">{a}</Badge>
            ))}
          </div>
          {service.authorityNote && (
            <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{service.authorityNote}</span>
            </div>
          )}
        </Block>

        <Block title="Before you start">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {service.beforeYouStart.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Exact information and document requirements are configured by the regulator for each
            licence type and are shown to you inside the form before submission.
          </p>
        </Block>

        <Block title="Process">
          <ol className="space-y-3">
            {service.process.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm">{step}</span>
              </li>
            ))}
          </ol>
        </Block>

        <Block title="After you submit">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {service.afterYouSubmit.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </Block>

        {requiresSignIn && (
          <Card className="mt-6 border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Confidential regulatory information — including submissions, correspondence,
                requests and supervisory records — is never shown on public pages. It is available
                only to authorised users of the entity concerned after sign-in.
              </span>
            </CardContent>
          </Card>
        )}

        <Block title="Need help?">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/guidance">Regulatory guidance</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/help">Help / Contact</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/register/entity">Connect to Existing Entity</Link></Button>
            <SignInCta label="Sign In" target={service.authenticatedRoute || '/dashboard'} size="sm" />
          </div>
        </Block>
      </main>

      <LandingFooter />
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-6">
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
