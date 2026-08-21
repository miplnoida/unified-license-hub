/**
 * P04 A.22 — compatibility-only redirect.
 *
 * `/admin/licensees/:id` is retired as a workspace. Identity and master
 * information lives in Entity 360 (`/entities/:entityId`); licence-specific
 * work lives in the licence workspace (`/licenses/:licenseId`). This redirect
 * exists purely so historical links, bookmarks and notification payloads keep
 * resolving.
 */
import { Navigate, useParams } from 'react-router-dom';

export default function LegacyLicenseeRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/entities/${id}` : '/admin/licensees'} replace />;
}
