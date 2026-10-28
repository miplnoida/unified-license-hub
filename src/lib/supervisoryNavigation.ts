export const SUPERVISORY_NAV_PATHS = ['/supervision/detection', '/supervision/management-assurance'] as const;
export function isSupervisoryNavigationPath(path?: string | null) {
  return SUPERVISORY_NAV_PATHS.some(p => path === p);
}
export function canDiscoverSupervisoryNavigation(internal: boolean, bypass: boolean, hasPermission: (module: string, action: string) => boolean) {
  return bypass || (internal && ['supervisory_spine', 'prudential_supervision', 'aml_supervision', 'market_conduct', 'fit_and_proper'].some(m => hasPermission(m, 'view')));
}