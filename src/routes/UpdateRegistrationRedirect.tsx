import { Navigate, useParams, useSearchParams } from 'react-router-dom';

/**
 * Friendly alias for resubmission email links.
 *
 * Accepts:
 *   /update-registration-form
 *   /update-registration-form/:registrationId
 *   /update-registration-form?registration=…&submission=…
 *
 * Canonicalizes legacy/path identifiers onto `/update-registration-form` while
 * preserving query identifiers. This route is the edit form owner.
 */
export default function UpdateRegistrationRedirect() {
  const { registrationId } = useParams<{ registrationId?: string }>();
  const [searchParams] = useSearchParams();

  const params = new URLSearchParams(searchParams);
  if (registrationId && !params.get('registration')) {
    params.set('registration', registrationId);
  }
  const qs = params.toString();
  const target = qs ? `/update-registration-form?${qs}` : '/update-registration-form';
  return <Navigate to={target} replace />;
}
