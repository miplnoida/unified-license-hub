import { Navigate } from 'react-router-dom';

/**
 * Public self-registration is exclusively for pre-license applicants.
 * Redirect to the detailed pre-licensee registration form.
 */
export default function Register() {
  return <Navigate to="/registration/pre-licensee" replace />;
}
