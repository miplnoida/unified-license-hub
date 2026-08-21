/**
 * `/register` — public registration decision page.
 *
 * `/register` is NOT itself a registration journey. It presents the governed
 * public journeys held in `registration_journey_types`:
 *
 *   FORM_FIRST   → /register/applicant  (New Applicant Registration)
 *   ENTITY_FIRST → /register/entity     (Connect to an Existing Entity)
 *
 * Both journeys converge on the same canonical entity resolution/binding and
 * the same regulator-side onboarding controls. Continuing or updating an
 * existing registration is account/workflow continuation — not a journey type —
 * and stays on the registration portal.
 */
import { Link, useNavigate } from 'react-router-dom';
import { LandingNav } from '@/components/landing/LandingNav';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Building2, FilePlus2, Info, Loader2 } from 'lucide-react';
import { useRegistrationJourneys, type RegistrationJourneyType } from '@/hooks/useRegistrationJourneys';
import { readIntentFromSearch, withIntentParam } from '@/lib/applicationIntent';
import { useLocation } from 'react-router-dom';

const JOURNEY_CTA: Record<string, string> = {
  FORM_FIRST: 'Start New Registration',
  ENTITY_FIRST: 'Connect to Existing Entity',
};

const JOURNEY_WHEN: Record<string, string[]> = {
  FORM_FIRST: [
    'you are registering with the regulator for the first time',
    'you do not already have a regulatory account or entity relationship',
    'you are not sure whether the organisation is already known to the regulator',
  ],
  ENTITY_FIRST: [
    'the organisation is already registered, regulated or licensed',
    'you know or believe it already exists in the regulator’s records',
    'you need permission to access, file or act for it',
  ],
};

function JourneyIcon({ journeyKey }: { journeyKey: string }) {
  const Icon = journeyKey === 'ENTITY_FIRST' ? Building2 : FilePlus2;
  return <Icon className="h-5 w-5 text-primary" aria-hidden="true" />;
}

export default function RegistrationJourneyChoice() {
  const navigate = useNavigate();
  const location = useLocation();
  const intent = readIntentFromSearch(location.search);
  const { data: journeys, isLoading, isError, refetch, isFetching } = useRegistrationJourneys();

  const start = (j: RegistrationJourneyType) => {
    // Keep the selected journey and any intended application across the
    // shared account-creation prerequisite.
    const target = `${j.entry_route}${j.entry_route.includes('?') ? '&' : '?'}journey=${encodeURIComponent(j.key)}`;
    navigate(withIntentParam(target, intent));
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold sm:text-3xl">Register with the regulator</h1>
          <p className="text-sm text-muted-foreground">
            Choose the option that describes your situation. If you are unsure whether the organisation is already
            known to the regulator, choose the first option — we will check the records for you.
          </p>
        </header>

        {isLoading && (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="inline h-6 w-6 animate-spin" />
            <p className="mt-2 text-sm">Loading registration options…</p>
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <Info className="h-4 w-4" />
            <AlertTitle>Registration options are unavailable</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                We could not load the available registration options right now. Please try again in a moment, or sign in
                if you already have an account.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                  Try again
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !isError && (journeys?.length ?? 0) === 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Registration is currently closed</AlertTitle>
            <AlertDescription>
              No registration options are open at the moment. Please check back later or{' '}
              <Link className="underline" to="/login">
                sign in
              </Link>{' '}
              if you already have an account.
            </AlertDescription>
          </Alert>
        )}

        {!isError && (journeys?.length ?? 0) > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {journeys!.map((j) => (
              <Card
                key={j.id}
                className={
                  j.key === 'ENTITY_FIRST'
                    ? 'flex flex-col border-border/70 bg-muted/30'
                    : 'flex flex-col border-primary/40 shadow-sm'
                }
              >
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <JourneyIcon journeyKey={j.key} />
                      <CardTitle className="text-lg">{j.public_title}</CardTitle>
                    </div>
                    {j.is_default && <Badge variant="secondary">Most people start here</Badge>}
                  </div>
                  <CardDescription>{j.public_description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between space-y-4">
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">Choose this when:</p>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {(JOURNEY_WHEN[j.key] ?? []).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {j.help_text && <p className="text-xs text-muted-foreground">{j.help_text}</p>}
                  </div>
                  <Button
                    className="w-full"
                    variant={j.key === 'ENTITY_FIRST' ? 'outline' : 'default'}
                    onClick={() => start(j)}
                  >
                    {JOURNEY_CTA[j.key] ?? `Continue — ${j.public_title}`}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Already started, or already have an account?</AlertTitle>
          <AlertDescription className="space-x-3">
            <Link className="underline" to="/login">
              Sign in
            </Link>
            <Link className="underline" to="/registration/portal">
              Continue or update an existing registration
            </Link>
          </AlertDescription>
        </Alert>
      </main>
    </div>
  );
}
