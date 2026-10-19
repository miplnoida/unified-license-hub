// Helpers for the applications list so applicants never silently lose rows.
// - The list RPC caps each page at 200 rows server-side, so filtered views must
//   page through the full result instead of asking for one large page.
// - Pre/Post classification uses the server-owned applications.request_kind.

export const LIST_RPC_MAX_PAGE_SIZE = 200;

export type ListPageFetcher = (page: number, pageSize: number) => Promise<{ data: any[] | null; error: any }>;

/** Fetch every page of the list RPC (bounded by `maxRows` as a safety stop). */
export async function fetchAllListPages(fetchPage: ListPageFetcher, maxRows = 10000): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 0; rows.length < maxRows; page++) {
    const { data, error } = await fetchPage(page, LIST_RPC_MAX_PAGE_SIZE);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    const total = batch[0]?.total_count != null ? Number(batch[0].total_count) : null;
    if (batch.length < LIST_RPC_MAX_PAGE_SIZE) break;
    if (total != null && rows.length >= total) break;
  }
  return rows;
}

/** Attach server request_kind values (by application id) onto list rows. */
export function attachRequestKinds<T extends { id: string }>(rows: T[], kinds: Record<string, string | null | undefined>): T[] {
  return rows.map((r) => (kinds[r.id] ? { ...r, request_kind: kinds[r.id] } : r));
}

/** External (applicant / licensee) users see all their own applications in every sector. */
export function sectorParamForAudience(isInternal: boolean, activeSectorId: string | null): string | null {
  return isInternal ? activeSectorId : null;
}
