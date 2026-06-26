import { lazy, type ComponentType } from 'react';

/**
 * Wraps React.lazy with stale-chunk recovery.
 *
 * After a redeploy, an open tab may hold an `index.html` that references
 * hashed chunk filenames which no longer exist on the CDN. The dynamic
 * `import()` then rejects with a "Failed to fetch dynamically imported
 * module" / chunk load error and the route blanks out.
 *
 * Strategy:
 *   1. Retry the import once after a short delay (handles transient network).
 *   2. If still failing AND we haven't already reloaded in this session,
 *      mark a sessionStorage flag and hard-reload so the browser pulls the
 *      fresh index.html with up-to-date chunk hashes.
 *   3. If the flag is already set, rethrow so ErrorBoundary takes over
 *      instead of looping reloads.
 */
const RELOAD_FLAG = 'lovable:lazyChunkReloaded';

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (firstError) {
      if (!isChunkLoadError(firstError)) throw firstError;
      // Brief backoff, then one retry.
      await new Promise((r) => setTimeout(r, 400));
      try {
        return await factory();
      } catch (secondError) {
        if (!isChunkLoadError(secondError)) throw secondError;
        if (typeof window !== 'undefined') {
          try {
            const alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG);
            if (!alreadyReloaded) {
              window.sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
              window.location.reload();
              // Return a never-resolving promise so Suspense keeps the
              // fallback up while the reload happens.
              return await new Promise<{ default: T }>(() => {});
            }
          } catch {
            // sessionStorage may throw in privacy modes — fall through.
          }
        }
        throw secondError;
      }
    }
  });
}

/**
 * Call once after a successful render to clear the reload guard so a future
 * stale-chunk event can trigger a fresh reload.
 */
export function clearLazyReloadGuard(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
}
