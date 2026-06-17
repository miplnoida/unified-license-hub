import type { PortalArea, PortalCapability } from './portalAccess';

/** The capability that represents "submit" for each portal area. */
export const SUBMIT_CAPABILITY_BY_AREA: Record<PortalArea, PortalCapability> = {
  licensing: 'can_submit',
  returns: 'can_submit_returns',
  complaints: 'can_submit_complaints',
  fp_declarations: 'can_submit_fp_declarations',
};

export function submitCapabilityFor(area: PortalArea): PortalCapability {
  return SUBMIT_CAPABILITY_BY_AREA[area];
}
