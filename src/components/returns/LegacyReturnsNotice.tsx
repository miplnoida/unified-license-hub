import { Link } from 'react-router-dom';
import { ArrowRight, Archive } from 'lucide-react';

/**
 * A4 legacy returns retirement notice.
 *
 * The pre-canonical returns-management screens remain available for historical
 * records only. All supervisory return work now happens on the canonical
 * filing queue backed by the reporting-obligation model.
 */
export function LegacyReturnsNotice({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex items-start gap-2">
        <Archive className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Legacy view — historical records only.</span>{' '}
          Supervisory return review, assignment and follow-up have moved to the canonical filing queue.
        </p>
      </div>
      <Link
        to="/returns/queue"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-background px-2.5 py-1.5 font-medium text-primary hover:bg-primary/5"
      >
        Open filing queue
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}
