/**
 * P08 closure: the conduct-only entity profile is retired. Entity truth lives in
 * the canonical regulated-entity profile, so `/conduct/entities/:id` redirects there.
 */
import { Navigate, useParams } from 'react-router-dom';

export default function ConductEntityRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/entities/${id ?? ''}`} replace />;
}
