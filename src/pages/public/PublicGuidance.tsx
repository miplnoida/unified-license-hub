/**
 * Public guidance index — /guidance
 * Signposts publicly available regulatory information and separates it from
 * secure entity services.
 */
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PublicInfoBadge, SecureServiceBadge, SignInCta } from '@/components/public/AccessBadges';
import { PUBLISHED_SERVICES } from '@/lib/publicServices/catalogue';

const PUBLIC_RESOURCES = [
  { title: 'Public register of licensees', body: 'Search regulated entities and licences that the regulator publishes.', href: '/registry/licensees' },
  { title: 'Regulated entity register', body: 'Browse published regulated entity records.', href: '/registry/entities' },
  { title: 'Published enforcement outcomes', body: 'Enforcement decisions the regulator has authorised for publication.', href: '/registry/enforcement' },
  { title: 'Applying for authorisation', body: 'What is involved in a new licence or authorisation application.', href: '/applicants' },
  { title: 'Services for regulated entities', body: 'What regulated entities can do through the secure portal.', href: '/licensee-services' },
];

const SECURE_ONLY = [
  'Regulatory returns and filing history',
  'Official correspondence issued to your entity',
  'Requests for information and remediation evidence',
  'Fit and proper submissions',
  'Application details and decisions',
  'Regulatory obligations and deadlines',
  'Private notices issued to your entity',
  'Entity portal user management',
];

export default function PublicGuidance() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />

      <main>
        <section className="border-b bg-muted/40">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
            <PublicInfoBadge />
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Guidance</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              General regulatory information available to everyone, and a clear statement of what is
              only available inside the secure entity portal.
            </p>
            <div className="mt-6">
              <SignInCta label="Sign In" target="/dashboard" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
          <h2 className="text-xl font-semibold">Publicly available information</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {PUBLIC_RESOURCES.map((r) => (
              <Card key={r.href}>
                <CardHeader className="pb-2"><CardTitle className="text-base">{r.title}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{r.body}</p>
                  <Button asChild variant="outline" size="sm"><Link to={r.href}>Open</Link></Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Available only after sign-in</h2>
            <SecureServiceBadge />
          </div>
          <Card className="mt-4">
            <CardContent className="p-5">
              <ul className="grid gap-2 sm:grid-cols-2">
                {SECURE_ONLY.map((s) => (
                  <li key={s} className="text-sm text-muted-foreground">• {s}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                {PUBLISHED_SERVICES.length} regulated-entity services are described publicly. The
                underlying records remain confidential to authorised users of the entity concerned.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
