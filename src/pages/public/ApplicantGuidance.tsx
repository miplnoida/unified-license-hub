/**
 * Public applicant guidance — /applicants
 * Explains the authorisation journey before an applicant creates an account.
 */
import { Link } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PublicInfoBadge, SignInCta } from '@/components/public/AccessBadges';

const STAGES: { title: string; body: string }[] = [
  { title: 'Create your account', body: 'Register a portal account with a work email address and verify it.' },
  { title: 'Provide organisation information', body: 'Give your legal name, registration details, addresses and contact people.' },
  { title: 'Select the application type', body: 'Choose the sector, sub-sector and licence or authorisation you require.' },
  { title: 'Complete required information and evidence', body: 'Fill each configured form section and upload the supporting documents requested.' },
  { title: 'Complete declarations', body: 'Confirm the accuracy of your submission and complete the required declarations.' },
  { title: 'Submit the application', body: 'Pay any applicable fee and submit. You receive an acknowledgement and reference.' },
  { title: 'Respond to regulator requests', body: 'The regulator may request further information, documents or clarification.' },
  { title: 'Assessment and review', body: 'Your application is assessed and routed through the configured approval workflow.' },
  { title: 'Decision', body: 'The decision is issued to your portal account and by official correspondence.' },
];

export default function ApplicantGuidance() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />

      <main>
        <section className="border-b bg-muted/40">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
            <PublicInfoBadge />
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Applying for regulatory authorisation
            </h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Understand what is involved before you begin. You can save your progress and return at
              any time, and the exact information and documents required are shown to you inside the
              application form.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild><Link to="/register/applicant">Start New Application</Link></Button>
              <SignInCta label="Sign In to Continue Application" target="/applications" variant="outline" />
              <Button asChild variant="outline"><Link to="/licensee-services">Licensee Services</Link></Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
          <h2 className="text-xl font-semibold">The application journey</h2>
          <div className="mt-5 space-y-4">
            {STAGES.map((s, i) => (
              <Card key={s.title}>
                <CardContent className="flex gap-4 p-5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-medium">{s.title}</div>
                    <p className="text-sm text-muted-foreground">{s.body}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-12">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Already regulated?</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  If your organisation already holds a licence, use the regulated-entity portal
                  instead of starting a new application.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm"><Link to="/licensee-services">View Licensee Services</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link to="/register/entity">Connect to Existing Entity</Link></Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Need help?</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Read the published guidance or contact the regulator’s support team.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm"><Link to="/guidance">Guidance</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link to="/help">Help / Contact</Link></Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
