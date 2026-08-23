/**
 * Public "For Licensees" hub — /licensee-services
 *
 * Informational only. No confidential or entity-specific data is fetched here.
 * Every secure destination is reached through a sign-in redirect.
 */
import { Link, useNavigate } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Building2, FilePlus2, Lock, LifeBuoy } from 'lucide-react';
import { PublicInfoBadge, SecureServiceBadge, SignInCta } from '@/components/public/AccessBadges';
import { servicesByGroup, STATUS_LABEL } from '@/lib/publicServices/catalogue';

export default function LicenseeServices() {
  const navigate = useNavigate();
  const groups = servicesByGroup();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />

      <main>
        {/* Hero */}
        <section className="border-b bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
            <PublicInfoBadge />
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Services for regulated entities
            </h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Access regulatory submissions, licence services, supervisory requests and ongoing
              compliance services through the secure regulated-entity portal.
            </p>
          </div>
        </section>

        {/* Entry choices */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
          <div className="grid gap-4 md:grid-cols-3">
            <EntryCard
              icon={<Lock className="h-5 w-5" />}
              question="Already have portal access?"
              body="Sign in to manage licences, file returns, respond to requests and view correspondence."
              action={<SignInCta label="Sign In to Entity Portal" target="/dashboard" className="w-full" />}
            />
            <EntryCard
              icon={<Building2 className="h-5 w-5" />}
              question="Your organisation is already regulated but you do not have portal access?"
              body="Identify your organisation and request access as an authorised representative."
              action={
                <Button variant="outline" className="w-full" onClick={() => navigate('/register/entity')}>
                  Connect to an Existing Entity
                </Button>
              }
            />
            <EntryCard
              icon={<FilePlus2 className="h-5 w-5" />}
              question="Applying for a new licence?"
              body="Create an account and start a new licence or authorisation application."
              action={
                <Button variant="secondary" className="w-full" onClick={() => navigate('/register/applicant')}>
                  Start a New Application
                </Button>
              }
            />
          </div>
        </section>

        {/* Catalogue */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Service catalogue</h2>
            <SecureServiceBadge />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Select a service to understand who should use it, what you need before you start, the
            process and what happens after you submit. Confidential regulatory information is only
            available after sign-in.
          </p>

          <div className="mt-6 space-y-10">
            {groups.map((g) => (
              <div key={g.group}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.group}
                </h3>
                <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {g.services.map((s) => (
                    <Card key={s.slug} className="flex flex-col">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{s.name}</CardTitle>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {STATUS_LABEL[s.status]}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            Initiated by: {s.initiatedBy}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-1 flex-col justify-between gap-4">
                        <p className="text-sm text-muted-foreground">{s.summary}</p>
                        <div className="space-y-2">
                          <Button asChild variant="outline" size="sm" className="w-full">
                            <Link to={`/licensee-services/${s.slug}`}>
                              View process <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          {s.publicCta ? (
                            <Button asChild size="sm" variant="secondary" className="w-full">
                              <Link to={s.publicCta.href}>{s.publicCta.label}</Link>
                            </Button>
                          ) : (
                            <SignInCta
                              label={s.ctaLabel}
                              target={s.authenticatedRoute}
                              size="sm"
                              className="w-full"
                            />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Help */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
          <Card className="bg-muted/40">
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <LifeBuoy className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <div className="font-semibold">Need help?</div>
                  <p className="text-sm text-muted-foreground">
                    Contact the regulator’s support team or read the published guidance before you
                    start a submission.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link to="/guidance">Guidance</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to="/help">Help / Contact</Link></Button>
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

function EntryCard({
  icon,
  question,
  body,
  action,
}: {
  icon: React.ReactNode;
  question: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
        <CardTitle className="pt-2 text-base leading-snug">{question}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <p className="text-sm text-muted-foreground">{body}</p>
        {action}
      </CardContent>
    </Card>
  );
}
