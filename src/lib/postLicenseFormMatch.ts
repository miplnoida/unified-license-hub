// Resolves which published post-licence form(s) apply to a chosen service.
// The server form set is sub-sector wide, so we keep only templates linked
// to the chosen service when any exist; otherwise fall back to legacy rules.
export interface PostLicenseTemplateLike {
  id: string;
  status?: string | null;
  form_type?: string | null;
  service_id?: string | null;
  sub_sector_id?: string | null;
  sector_id?: string | null;
  service?: string | null;
}

export function matchPostLicenseTemplates<T extends PostLicenseTemplateLike>(args: {
  templates: T[];
  serverFormIds: string[] | null;
  serviceId: string;
  serviceName?: string | null;
  sectorId: string | null;
  subSectorId: string | null;
}): T[] {
  const { templates, serverFormIds, serviceId, serviceName, sectorId, subSectorId } = args;
  const published = templates.filter(t => t.status === 'published' && t.form_type === 'post_license');

  if (serverFormIds && serverFormIds.length > 0) {
    const ordered = serverFormIds
      .map(id => published.find(t => t.id === id) || templates.find(t => t.id === id))
      .filter(Boolean) as T[];
    const forService = ordered.filter(t => t.service_id === serviceId);
    if (forService.length > 0) return forService;
    const unbound = ordered.filter(t => !t.service_id);
    if (unbound.length > 0) return unbound;
  }

  const byService = published.filter(t => t.service_id === serviceId);
  if (byService.length > 0) return byService;
  const bySubSector = subSectorId ? published.filter(t => t.sub_sector_id === subSectorId && !t.service_id) : [];
  if (bySubSector.length > 0) return bySubSector;
  const bySector = published.filter(t => t.sector_id === sectorId && !t.sub_sector_id && !t.service_id);
  if (bySector.length > 0) return bySector;
  if (serviceName) {
    const byName = published.filter(t => t.service === serviceName);
    if (byName.length > 0) return byName;
  }
  return [];
}
