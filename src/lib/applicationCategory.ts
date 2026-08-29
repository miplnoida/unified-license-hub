// Determines whether an application is a Pre-Licensee (initial licensing, F4)
// or a Post-Licensee (post-licensing service, F5) filing.
//
// AUTHORITY: `applications.request_kind` is server-owned (derived by the
// database from a genuine bound licence or an applicable post-licensing /
// renewal service). The client MUST NOT re-derive regulatory classification
// from submitted JSON such as `data.type`. The legacy `service_id` shape is
// only used as a display fallback for rows read without `request_kind`.

export type ApplicationCategory = 'pre_license' | 'post_license';

type MaybeRow = Record<string, any> | null | undefined;

/**
 * Accepts either an application row (preferred — carries `request_kind`) or a
 * bare `data` object (legacy call sites), plus an optional explicit
 * server-provided request_kind.
 */
export function getApplicationCategory(dataOrRow: MaybeRow, requestKind?: string | null): ApplicationCategory {
  const row = (dataOrRow || {}) as Record<string, any>;
  const kind = requestKind ?? row.request_kind ?? null;
  if (kind) return kind === 'POST_LICENSE' ? 'post_license' : 'pre_license';
  // Display-only fallback for rows fetched without the server classification.
  const data = (row.data ?? row) as Record<string, any>;
  if (row.service_id || data?.service_id) return 'post_license';
  return 'pre_license';
}

/** Row-level helper for lists, queues and reporting filters. */
export function isPostLicenseApplicationRow(row: MaybeRow): boolean {
  return getApplicationCategory(row) === 'post_license';
}

export function getApplicationCategoryLabel(data: MaybeRow, requestKind?: string | null): string {
  return getApplicationCategory(data, requestKind) === 'post_license' ? 'Post-Licensee' : 'Pre-Licensee';
}
