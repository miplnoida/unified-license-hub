// Determines whether an application is a Pre-Licensee or Post-Licensee filing.
// Post-licensee applications are scoped to a specific licensed service
// (data.service_id is set during NewPostLicenseApplication). Pre-licensee
// applications have no service_id.

export type ApplicationCategory = 'pre_license' | 'post_license';

export function getApplicationCategory(data: any): ApplicationCategory {
  const d = (data || {}) as Record<string, any>;
  if (d.service_id || d.type === 'post_license') return 'post_license';
  return 'pre_license';
}

export function getApplicationCategoryLabel(data: any): string {
  return getApplicationCategory(data) === 'post_license' ? 'Post-Licensee' : 'Pre-Licensee';
}
