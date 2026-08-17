/**
 * Shared Loading / Error / Empty / Data states for the complaint workspace.
 *
 * Every asynchronous section in Complaint Detail must terminate in exactly one
 * of four states. `SectionState` renders the first three and lets the caller
 * render data; `supportingStatusText` gives a one-line truthful status for
 * summary rows so a failed query is never printed as "None".
 */
import { Loader2 } from 'lucide-react';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import { Button } from '@/components/ui/button';

interface SectionStateProps {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  /** e.g. "information requests" — used in all three messages. */
  noun: string;
  onRetry?: () => void;
  emptyText?: string;
  children: React.ReactNode;
}

export function SectionState({
  isLoading,
  isError,
  isEmpty,
  noun,
  onRetry,
  emptyText,
  children,
}: SectionStateProps) {
  if (isError) {
    return (
      <QueryErrorState
        title={`We couldn’t load ${noun}`}
        message={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} could not be loaded. This is a temporary problem — please try again.`}
        onRetry={onRetry}
        compact
      />
    );
  }
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading {noun}…
      </div>
    );
  }
  if (isEmpty) {
    return <p className="py-4 text-sm text-muted-foreground">{emptyText ?? `No ${noun} recorded yet.`}</p>;
  }
  return <>{children}</>;
}

/** Inline "unavailable" status with an optional retry link, for summary rows. */
export function UnavailableStatus({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      {label}
      {onRetry && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetry}>
          Retry
        </Button>
      )}
    </span>
  );
}

/**
 * Truthful text for a supporting data point:
 * loading → "Checking…", error → "<thing> status unavailable", else null.
 */
export function supportingStatusText(
  q: { isLoading: boolean; isError: boolean },
  thing: string,
): string | null {
  if (q.isError) return `${thing} status unavailable`;
  if (q.isLoading) return 'Checking…';
  return null;
}

export default SectionState;
