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

/**
 * Surfaces that belong to a licensed institution's portal users (decided by
 * `canUsePostLicenceServices`). Superset of the entitlement-gated activity
 * above plus regulator-raised obligations, which licensees must still answer
 * even when no licence is currently eligible for new activity.
 */
const LICENSED_INSTITUTION_ONLY_PREFIXES = [
  '/entity/complaint-rfis',
  '/entity/supervisory-actions',
];

export function pathRequiresLicensedInstitution(href?: string | null): boolean {
  if (!href) return false;
  if (pathRequiresLicenceEntitlement(href)) return true;
  const [path] = href.split('?');
  return LICENSED_INSTITUTION_ONLY_PREFIXES.some(p => path === p || path.startsWith(p + '/'));
}
