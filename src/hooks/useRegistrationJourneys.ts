/**
 * Public registration journey catalogue (`registration_journey_types`).
 *
 * `/register` is a decision page only: the two genuine public journeys
 * (New Applicant Registration → `/register/applicant`, Connect to an Existing
 * Entity → `/register/entity`) are rendered from this governed catalogue —
 * titles, descriptions, entry routes and ordering all come from the database,
 * never from a parallel hard-coded list in React.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RegistrationJourneyType {
  id: string;
  key: string;
  label: string;
  public_title: string;
  public_description: string;
  help_text: string | null;
  entry_route: string;
  resolution_timing: string;
  applicant_type: string | null;
  is_default: boolean;
  sort_order: number;
  regulator_id: string | null;
  sector_id: string | null;
}

export interface JourneyScope {
  regulatorId?: string | null;
  sectorId?: string | null;
}

/**
 * Enabled + public journeys applicable to the current scope, in governed sort
 * order. Scope rule: a journey with a NULL regulator/sector applies globally;
 * a scoped journey only applies when the scope matches.
 */
export function useRegistrationJourneys(scope: JourneyScope = {}) {
  const { regulatorId = null, sectorId = null } = scope;

  return useQuery({
    queryKey: ['registration-journey-types', regulatorId, sectorId],
    staleTime: 300_000,
    queryFn: async (): Promise<RegistrationJourneyType[]> => {
      const { data, error } = await supabase
        .from('registration_journey_types')
        .select(
          'id,key,label,public_title,public_description,help_text,entry_route,resolution_timing,applicant_type,is_default,sort_order,regulator_id,sector_id',
        )
        .eq('is_enabled', true)
        .eq('is_public', true)
        .order('sort_order', { ascending: true });

      if (error) throw new Error(error.message);

      return ((data || []) as RegistrationJourneyType[]).filter(
        (j) =>
          (!j.regulator_id || !regulatorId || j.regulator_id === regulatorId) &&
          (!j.sector_id || !sectorId || j.sector_id === sectorId),
      );
    },
  });
}
