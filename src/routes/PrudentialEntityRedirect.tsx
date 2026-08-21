/**
 * EPR-02 — `/prudential/entities/:id` is no longer an entity profile.
 *
 * The regulated entity has exactly one canonical profile: Entity 360. This
 * legacy prudential-shaped profile route now redirects there, opening the
 * prudential section, so entity identity and supervisory state have a single
 * home. The specialist analytics (ratio trends, peer comparison, heatmaps)
 * remain available at `/prudential/analysis/:id`.
 */
import { Navigate, useParams, useSearchParams } from 'react-router-dom';

export default function PrudentialEntityRedirect() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const view = params.get('view') ?? 'prudential';
  return <Navigate to={`/entities/${id ?? ''}?view=${view}`} replace />;
}
