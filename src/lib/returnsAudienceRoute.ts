/**
 * Where an internal staff user lands when they open an external returns
 * filing URL (`/entity/returns*`). Returns null for non-returns paths.
 */
export function resolvePortalReturnsRedirect(pathname: string): string | null {
  if (!pathname.startsWith('/entity/returns')) return null;
  const m = pathname.match(/^\/entity\/returns\/filings\/([^/]+)/);
  if (m) return `/returns/filings/${m[1]}`;
  return '/returns/queue';
}
