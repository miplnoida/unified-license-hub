/**
 * `/register/authority-pending` — F2 (GAP-F2-03).
 *
 * `public.onboarding_request_membership_by_token` returns this route as the
 * resume route whenever membership authority has been requested but not yet
 * approved. It must therefore be a declared, first-class route rather than an
 * inline branch of `/register/entity`, otherwise applicants following the
 * server's own instruction land on NotFound.
 *
 * Routing decisions come from `onboarding_journey_context()` plus the governed
 * stage catalogue — never from hard-coded stage literals.
 */
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Info } from 'lucide-react';
import { LandingNav } from '@/components/landing/LandingNav';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useJourneyContext } from '@/hooks/useOnboardingTokens';
import { useResolvedStageKeys } from '@/hooks/useOnboardingVocabulary';
import { PendingAuthorityScreen } from '@/components/registration/PendingAuthorityScreen';
import { readIntentFromSearch, loadPersistedIntent, clearPersistedIntent } from '@/lib/applicationIntent';

export default function AuthorityPendingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const { data: journey, isFetching, refetch } = useJourneyContext();
  const resolvedStages = useResolvedStageKeys();

  const intent = readIntentFromSearch(location.search) || loadPersistedIntent();

  useEffect(() => {
    if (!journey) return;
    // Authority resolved while the applicant was waiting — continue the journey.
    if (resolvedStages.includes(journey.stage)) {
      clearPersistedIntent();
      navigate(intent?.path || journey.resume_route || '/applications/new', { replace: true });
      return;
    }
    // Authority was never requested — send the applicant back to identification.
    if (journey.stage && journey.stage !== 'AUTHORITY_PENDING' && resolvedStages.length > 0) {
      navigate(journey.resume_route || '/register/entity', { replace: true });
    }
  }, [journey, resolvedStages]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="inline h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <LandingNav />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Sign in required</AlertTitle>
            <AlertDescription>
              Sign in to see the status of your request for authority to act for an organisation.
            </AlertDescription>
          </Alert>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => navigate('/login?redirect=%2Fregister%2Fauthority-pending')}>Sign in</Button>
            <Button variant="outline" onClick={() => navigate('/register')}>Registration options</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <PendingAuthorityScreen
          entityDisplayName={journey?.entity_display_name}
          intent={intent}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
        />
      </main>
    </div>
  );
}
