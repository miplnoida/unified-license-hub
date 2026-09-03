/**
 * EPIC 4 / W6 — route convergence.
 *
 * `/prudential/examinations/:id` was a second destination for the same
 * regulated object. The canonical examination workspace is
 * `/supervision/examinations/:id` (domain-derived authorization). This route is
 * retained as a documented compatibility alias so historical references,
 * notifications and bookmarks continue to resolve; it stores no state and only
 * redirects.
 */
import { Navigate, useParams, useLocation } from 'react-router-dom';

export default function LegacyExaminationRedirect() {
  const { id } = useParams<{ id: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={`/supervision/examinations/${id ?? ''}${search}${hash}`} replace />;
}
