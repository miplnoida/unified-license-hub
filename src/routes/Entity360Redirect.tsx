/**
 * Compatibility redirect: the legacy `/entities/:entityId/360` bookmark now
 * resolves to the canonical regulated-entity profile at `/entities/:entityId`.
 */
import { Navigate, useParams } from 'react-router-dom';

export default function Entity360Redirect() {
  const { entityId } = useParams<{ entityId: string }>();
  return <Navigate to={`/entities/${entityId ?? ''}`} replace />;
}
