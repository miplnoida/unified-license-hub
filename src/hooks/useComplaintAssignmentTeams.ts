/**
 * Regulator-scoped assignment teams reference.
 *
 * Backs the "Assigned Team" filter in the complaints list. Previously the
 * dropdown was built from teams visible on the current paginated page, so
 * teams that only appeared on later pages were absent. This hook calls the
 * `list_complaint_assignment_teams(_regulator_id)` RPC which returns the
 * full set of teams for the active regulator, independent of pagination.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useComplaintAssignmentTeams(regulatorId: string | null | undefined) {
  return useQuery({
    // Regulator is part of the key so switching regulators refetches. If
    // the caller omits regulator scope (super-admin view) we still refetch
    // when it transitions from undefined → null.
    queryKey: ['complaint_assignment_teams', regulatorId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'list_complaint_assignment_teams' as any,
        { _regulator_id: regulatorId ?? null } as any,
      );
      if (error) throw error;
      return (data as any[] | null)?.map((r: any) => ({
        team: r.team as string,
        count: Number(r.complaint_count ?? 0),
      })) ?? [];
    },
  });
}
