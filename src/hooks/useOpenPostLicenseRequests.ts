import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Statuses that mean "this request is still in flight" for duplicate protection. */
const OPEN_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'pending_payment',
  'pending_approval',
  'in_progress',
  'rfi_raised',
  'resubmitted',
];

export interface OpenPostLicenseRequest {
  id: string;
  status: string;
  service_id: string | null;
  license_id: string | null;
  service_name: string | null;
  created_at: string;
}

/**
 * Open post-licence requests for the given licensee, used to block a second
 * concurrent request for the same licence + service (Phase 6 duplicate
 * protection). Read-only: the authoritative gate stays server-side.
 */
export function useOpenPostLicenseRequests(licenseeId?: string | null) {
  return useQuery({
    queryKey: ['open-post-license-requests', licenseeId ?? 'self'],
    queryFn: async (): Promise<OpenPostLicenseRequest[]> => {
      const { data, error } = await supabase
        .from('applications')
        .select('id, status, data, created_at')
        .in('status', OPEN_STATUSES)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || [])
        .map((row) => {
          const d = (row.data ?? {}) as Record<string, unknown>;
          return {
            id: row.id as string,
            status: row.status as string,
            service_id: (d.service_id as string) ?? null,
            license_id: (d.license_id as string) ?? null,
            service_name: (d.service_name as string) ?? null,
            created_at: row.created_at as string,
            _type: d.type as string | undefined,
            _licensee: d.licensee_id as string | undefined,
          };
        })
        .filter((r) => r._type === 'post_license')
        .filter((r) => !licenseeId || !r._licensee || r._licensee === licenseeId)
        .map(({ _type, _licensee, ...rest }) => rest);
    },
    staleTime: 30_000,
  });
}
