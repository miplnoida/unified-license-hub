/**
 * Development-only navigation timing.
 *
 * Distinguishes bundle delay (chunk), render delay (component mount) and data
 * delay (page reports it) for a route change. Logs pathnames only — never query
 * strings, ids or business payloads.
 */
const isDev = typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV;

type NavMark = { from: string; to: string; start: number; chunkReady?: number; mounted?: number };

let current: NavMark | null = null;
let lastPath = typeof window !== 'undefined' ? window.location.pathname : '/';

function ms(from: number, to: number) {
  return `${Math.round(to - from)}ms`;
}

export function markNavigationStart(pathname: string): void {
  if (!isDev) return;
  if (current?.to === pathname) return;
  current = { from: lastPath, to: pathname, start: performance.now() };
  lastPath = pathname;
}

export function markChunkReady(pathname: string): void {
  if (!isDev || !current || current.to !== pathname) return;
  current.chunkReady = performance.now();
}

export function markRouteMounted(pathname: string): void {
  if (!isDev || !current || current.to !== pathname) return;
  current.mounted = performance.now();
  const { from, to, start, chunkReady, mounted } = current;
   
  console.info(
    `[NavigationPerf] ${from} -> ${to} | chunk: ${chunkReady ? ms(start, chunkReady) : 'cached'} | mount: ${ms(start, mounted!)}`,
  );
}

/** Pages may report when their critical data is ready. */
export function markCriticalDataReady(pathname: string): void {
  if (!isDev || !current || current.to !== pathname) return;
   
  console.info(`[NavigationPerf] ${pathname} | critical data: ${ms(current.start, performance.now())}`);
}
