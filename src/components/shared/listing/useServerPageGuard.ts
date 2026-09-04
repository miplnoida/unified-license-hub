/**
 * Owner-level server page guard.
 *
 * A server-paged screen — not the table component — owns the authoritative
 * query result, so it must be the thing that repairs an invalid page. Screens
 * routinely branch on `rows.length === 0` and render an empty state instead of
 * the register, which means a table-level recovery hook never mounts when the
 * requested page is out of range (`?page=99`).
 *
 * This hook takes the authoritative `totalCount` from the query, persists the
 * corrected page through the owning listing state, and tells the screen that a
 * repair is in flight so it does not claim "no records match" while the valid
 * page is still loading.
 */
import { useEffect } from 'react';
import { clampPage } from './sorting';

export interface ServerPageGuardOptions {
  page: number;
  pageSize: number;
  /** Authoritative record count for the current filtered population. */
  totalCount: number;
  /** Owning listing-state setter (URL-backed for operational registers). */
  setPage: (page: number) => void;
  /** False while the count is not yet authoritative (initial load / error). */
  ready?: boolean;
}

export interface ServerPageGuard {
  /** The page the screen should be showing. */
  validPage: number;
  /**
   * True when the requested page was invalid and the corrected page has not
   * loaded yet — suppress the empty state while this is true.
   */
  repairing: boolean;
}

export function useServerPageGuard({
  page,
  pageSize,
  totalCount,
  setPage,
  ready = true,
}: ServerPageGuardOptions): ServerPageGuard {
  const validPage = ready ? clampPage(page, totalCount, pageSize) : page;
  const repairing = ready && validPage !== page;

  useEffect(() => {
    if (repairing) setPage(validPage);
  }, [repairing, validPage, setPage]);

  return { validPage, repairing };
}
