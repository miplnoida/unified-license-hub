/**
 * `/register/legacy` is no longer a business journey — the original
 * new-registration form now lives at the canonical FORM_FIRST route
 * `/register/applicant`. This alias preserves old links (and their query
 * parameters) without advertising a second active new-registration workflow.
 */
import { Navigate, useLocation } from 'react-router-dom';

export default function LegacyRegisterRedirect() {
  const location = useLocation();
  return <Navigate to={`/register/applicant${location.search}${location.hash}`} replace />;
}
