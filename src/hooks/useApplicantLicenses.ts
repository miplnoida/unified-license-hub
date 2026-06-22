import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ApplicantLicenseRow {
  id: string;
  license_number: string | null;
  status: string;
  valid_until: string | null;
}

/**
 * Lightweight license lookup for applicant / pre-licensee dashboards.
 * Resolves licenses owned by the current user via explicit signals only:
 *   1. licenses.holder_id = userId
 *   2. licenses.application_id where applications.applicant_id = userId
 *
 * Returns deduped rows so the applicant dashboard can show their licensee
 * record (e.g. an expired post-license) with a Renew action, even when their
 * profile does not carry a Primary User mapping yet.
 */
export function useApplicantLicenses(userId: string | undefined) {
  return useQuery({
    queryKey: ['applicant-licenses', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<ApplicantLicenseRow[]> => {
      if (!userId) return [];

      const [heldRes, appsRes] = await Promise.all([
        supabase
          .from('licenses' as any)
          .select('id, license_number, status, valid_until')
          .eq('holder_id', userId),
        supabase
          .from('applications' as any)
          .select('id')
          .eq('applicant_id', userId),
      ]);

      const dedup = new Map<string, ApplicantLicenseRow>();
      for (const row of ((heldRes.data || []) as any[])) {
        if (row?.id) dedup.set(row.id, {
          id: row.id,
          license_number: row.license_number ?? null,
          status: row.status,
          valid_until: row.valid_until ?? null,
        });
      }

      const appIds = ((appsRes.data || []) as any[]).map(r => r?.id).filter(Boolean);
      if (appIds.length) {
        const { data: extra } = await supabase
          .from('licenses' as any)
          .select('id, license_number, status, valid_until')
          .in('application_id', appIds);
        for (const row of ((extra || []) as any[])) {
          if (row?.id && !dedup.has(row.id)) {
            dedup.set(row.id, {
              id: row.id,
              license_number: row.license_number ?? null,
              status: row.status,
              valid_until: row.valid_until ?? null,
            });
          }
        }
      }

      return Array.from(dedup.values()).sort((a, b) => {
        const at = a.valid_until ? new Date(a.valid_until).getTime() : Infinity;
        const bt = b.valid_until ? new Date(b.valid_until).getTime() : Infinity;
        return at - bt;
      });
    },
  });
}
