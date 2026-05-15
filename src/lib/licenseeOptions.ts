import { supabase } from '@/integrations/supabase/client';

export interface ApprovedLicenseeOption {
  id: string;
  display_name: string;
  sector_id: string | null;
  /**
   * Sector resolved using the same priority as the backend
   * `save_ppoc_mapping` RPC: licensees.sector_id → registrations.sector_id →
   * applications.data->>'sector_id'. Use this for any frontend filter that
   * must match server-side sector validation.
   */
  resolved_sector_id: string | null;
  sector_name?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  license_number?: string;
  application_id?: string | null;
  raw?: any;
}

/**
 * Loads licensee entities with the same name/sector resolution priority used
 * by the admin Licensee Entities page (ManageLicensees.tsx). Returns one
 * entry per unique (display_name + resolved sector_id), preferring active
 * status and the most recently updated row.
 */
export async function loadApprovedLicenseeOptions(opts?: {
  keepLicenseeId?: string | null;
  onlyActive?: boolean;
}): Promise<ApprovedLicenseeOption[]> {
  const onlyActive = opts?.onlyActive !== false;
  const keepId = opts?.keepLicenseeId || null;

  const [licRes, secRes, licensesRes] = await Promise.all([
    supabase.from('licensees').select('*').order('created_at', { ascending: false }),
    supabase.from('sectors').select('id, name'),
    supabase.from('licenses').select('id, application_id, license_number'),
  ]);

  const sMap: Record<string, string> = {};
  (secRes.data || []).forEach((s: any) => { sMap[s.id] = s.name; });

  const licenseToApp: Record<string, string> = {};
  const licenseToNumber: Record<string, string> = {};
  (licensesRes.data || []).forEach((l: any) => {
    if (l.application_id) licenseToApp[l.id] = l.application_id;
    if (l.license_number) licenseToNumber[l.id] = l.license_number;
  });

  const licensees = (licRes.data || []) as any[];
  const appIds = Array.from(new Set(
    licensees.map(l => l.license_id ? licenseToApp[l.license_id] : null).filter(Boolean)
  )) as string[];

  const appsMap: Record<string, any> = {};
  const applicantIds: string[] = [];
  if (appIds.length) {
    const { data: appsData } = await supabase
      .from('applications')
      .select('id, applicant_id, created_at, data')
      .in('id', appIds);
    (appsData || []).forEach((a: any) => {
      appsMap[a.id] = a;
      if (a.applicant_id) applicantIds.push(a.applicant_id);
    });
  }

  const uniqApplicants = Array.from(new Set(applicantIds));
  const regMap: Record<string, any> = {};
  const profileMap: Record<string, any> = {};
  const plMap: Record<string, any> = {};
  if (uniqApplicants.length) {
    const [regsRes, profRes, plRes] = await Promise.all([
      supabase.from('registrations')
        .select('user_id, applicant_name, sector_id')
        .in('user_id', uniqApplicants),
      supabase.from('profiles').select('id, entity_name').in('id', uniqApplicants),
      supabase.from('pre_license_users').select('id, entity_name').in('id', uniqApplicants),
    ]);
    (regsRes.data || []).forEach((r: any) => { regMap[r.user_id] = r; });
    (profRes.data || []).forEach((p: any) => { profileMap[p.id] = p; });
    (plRes.data || []).forEach((p: any) => { plMap[p.id] = p; });
  }

  const enriched: ApprovedLicenseeOption[] = licensees.map((l: any) => {
    const appId = l.license_id ? licenseToApp[l.license_id] : null;
    const app = appId ? appsMap[appId] : null;
    const reg = app?.applicant_id ? regMap[app.applicant_id] : null;
    const prof = app?.applicant_id ? profileMap[app.applicant_id] : null;
    const pl = app?.applicant_id ? plMap[app.applicant_id] : null;
    const data = app?.data || {};

    const display_name =
      reg?.applicant_name ||
      data?.applicant_name ||
      data?.entity_name ||
      pl?.entity_name ||
      prof?.entity_name ||
      l.name ||
      '—';

    const sector_id = reg?.sector_id || data?.sector_id || l.sector_id || null;
    // Backend RPC priority: licensees.sector_id first, then registration/app fallback.
    const resolved_sector_id =
      l.sector_id || reg?.sector_id || (data?.sector_id ?? null) || null;

    return {
      id: l.id,
      display_name,
      sector_id,
      resolved_sector_id,
      sector_name: (sector_id && sMap[sector_id]) || data?.sector_name || undefined,
      status: l.status,
      created_at: l.created_at,
      updated_at: l.updated_at,
      license_number: (l.license_id && licenseToNumber[l.license_id]) || undefined,
      application_id: appId,
      raw: l,
    };
  });

  const filtered = enriched.filter(r =>
    (!onlyActive || r.status === 'active') || (keepId && r.id === keepId)
  );

  const norm = (n: string) => (n || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const bestByKey = new Map<string, ApprovedLicenseeOption>();
  for (const row of filtered) {
    const key = `${norm(row.display_name)}::${row.sector_id || ''}`;
    const prev = bestByKey.get(key);
    if (!prev) { bestByKey.set(key, row); continue; }
    const prevActive = prev.status === 'active';
    const curActive = row.status === 'active';
    const prevTs = new Date(prev.updated_at || prev.created_at || 0).getTime();
    const curTs = new Date(row.updated_at || row.created_at || 0).getTime();
    if ((curActive && !prevActive) || (curActive === prevActive && curTs > prevTs)) {
      bestByKey.set(key, row);
    }
  }
  let deduped = Array.from(bestByKey.values());

  if (keepId && !deduped.some(r => r.id === keepId)) {
    const original = enriched.find(r => r.id === keepId);
    if (original) deduped.push(original);
  }

  deduped.sort((a, b) => a.display_name.localeCompare(b.display_name));
  return deduped;
}
