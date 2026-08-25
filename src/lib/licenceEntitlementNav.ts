/**
 * Destinations that represent NEW regulated activity for an external portal
 * user (post-licence services and regulatory returns filing).
 *
 * These are only actionable once the entity holds an eligible (approved /
 * issued / in-grace) licence — the same canonical entitlement enforced by
 * `entity_license_entitlements` / `can_act_on_license` / `returns_entitlement_ok`
 * in the database. The menu uses this list to disable rather than hide the
 * entries so the applicant journey stays visible.
 *
 * Navigation is database-driven (`sec_navigation_items`), so the gate is keyed
 * on route rather than on a config flag.
 */
const ENTITLEMENT_GATED_PREFIXES = [
  '/entity/returns',
  '/post-license',
  '/post-licensee',
];

export function pathRequiresLicenceEntitlement(href?: string | null): boolean {
  if (!href) return false;
  const [path, query = ''] = href.split('?');
  if (ENTITLEMENT_GATED_PREFIXES.some(p => path === p || path.startsWith(p + '/'))) return true;
  // Post-licensing application listing is the same tab as pre-licensing.
  if (path === '/applications' && /type=post/i.test(query)) return true;
  return false;
}
