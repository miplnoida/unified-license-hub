import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Content-only Suspense fallback for lazy route chunks.
 *
 * Unlike `AuthLoadingScreen` (initial auth bootstrap, full page) this renders
 * INSIDE the persistent shell: sidebar, header and logo stay untouched. It also
 * stays invisible for the first ~140ms so quick, cached transitions never flash
 * a skeleton.
 */
export function RouteContentSkeleton({ delayMs = 140 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);

  if (!visible) return <div aria-busy="true" aria-live="polite" className="min-h-[40vh]" />;

  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4 animate-in fade-in duration-150">
      {/* Route progress line — content region only, never blocking */}
      <div className="h-0.5 w-full overflow-hidden rounded bg-muted">
        <div className="h-full w-1/3 animate-[nav-progress_1s_ease-in-out_infinite] rounded bg-primary/70" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
