import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';

/**
 * Friendly alias for resubmission email links.
 *
 * Accepts:
 *   /update-registration-form
 *   /update-registration-form/:registrationId
 *   /update-registration-form?registration=…&submission=…
 *
 * Forwards to `/registration/portal` while PRESERVING any identifiers so the
 * portal can load the exact record the email was about. A plain
 * `<Navigate to="/registration/portal" replace />` would silently drop the
 * query string and put the user back on a guess-the-registration code path.
 */
export default function UpdateRegistrationRedirect() {
  const { registrationId } = useParams<{ registrationId?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const params = new URLSearchParams(searchParams);
  if (registrationId && !params.get('registration')) {
    params.set('registration', registrationId);
  }
  const qs = params.toString();
  const target = qs ? `/registration/portal?${qs}` : '/registration/portal';
  return <Navigate to={target} replace state={location.state} />;
}
