/**
 * Invalid page recovery.
 *
 * A register's page number can become invalid without the officer touching the
 * pager: a filter narrows the population, records are closed, or a colleague
 * removes work. When that happens the listing must actually move to the last
 * valid page (and persist that move through the owning state), not merely
 * display a different number while rendering an empty table.
 *
 * Works identically in client mode (bounded dataset) and server mode
 * (authoritative `totalCount` from the backend).
 */
import { useEffect } from 'react';
import { clampPage } from './sorting';

export interface InvalidPageRecoveryOptions {
  page: number;
  totalCount: number;
  pageSize: number;
  /** Owning state setter — the recovery is persisted through it. */
  onPageChange?: (page: number) => void;
  /** Skip while the count is not yet authoritative (e.g. first load). */
  enabled?: boolean;
}

/** Returns the page that must be rendered, and repairs the owning state. */
export function useInvalidPageRecovery({
  page,
  totalCount,
  pageSize,
  onPageChange,
  enabled = true,
}: InvalidPageRecoveryOptions): number {
  const valid = clampPage(page, totalCount, pageSize);
  useEffect(() => {
    if (!enabled) return;
    if (valid !== page) onPageChange?.(valid);
  }, [enabled, valid, page, onPageChange]);
  return enabled ? valid : page;
}
