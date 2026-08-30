/**
 * Safe helpers for building PostgREST `.in()` / `.eq()` UUID filters.
 *
 * Two runtime defects found by the system runtime integrity gate came from ad-hoc
 * handling of empty or dirty id lists:
 *
 *   RF-04  /admin/ppoc-mappings  `.in('id', ['__none__'])`  -> HTTP 400 / 22P02
 *   RF-10  /documents            `.in('id', [null, ...])`   -> HTTP 400 / 22P02
 *
 * `__none__` is not a UUID, so Postgres rejects the whole request with
 * "invalid input syntax for type uuid" and the screen shows an error instead of an
 * empty list. The nil UUID is a *valid* UUID that no real record uses, so it keeps
 * the query shape (and the surrounding Promise.all) intact while matching nothing.
 */

export const NO_MATCH_UUID = '00000000-0000-0000-0000-000000000000';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Normalises a list of ids for use with `.in()`: drops null/undefined/non-UUID
 * entries and never returns an empty array (which PostgREST also mishandles).
 */
export function uuidList(ids: ReadonlyArray<string | null | undefined>): string[] {
  const clean = Array.from(new Set(ids.filter(isUuid)));
  return clean.length ? clean : [NO_MATCH_UUID];
}
