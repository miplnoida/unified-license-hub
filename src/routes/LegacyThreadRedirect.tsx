/**
 * P12 closure: legacy `/correspondence/thread/:id` deep links resolve into the
 * canonical thread workspace, preserving the thread id. No loops: the target
 * route (`/correspondence/:id`) never redirects back here.
 */
import { Navigate, useParams } from 'react-router-dom';

export default function LegacyThreadRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/correspondence/${id}` : '/correspondence/inbox'} replace />;
}
