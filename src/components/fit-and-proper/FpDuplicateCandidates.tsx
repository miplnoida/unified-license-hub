import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users } from 'lucide-react';

interface Props {
  fullName: string;
  dateOfBirth?: string | null;
  nationalId?: string | null;
  onOpenExisting?: () => void;
}

/**
 * Phase 3A — soft duplicate candidates.
 *
 * Ranks existing individuals by name similarity + DOB + identifier through
 * `fp_find_duplicate_candidates`. Advisory only: the hard identifier/email
 * duplicate block in the create mutation is unchanged.
 */
export function FpDuplicateCandidates({ fullName, dateOfBirth, nationalId, onOpenExisting }: Props) {
  const name = (fullName ?? '').trim();

  const { data, isFetching } = useQuery({
    queryKey: ['fp_dup_candidates', name, dateOfBirth ?? '', nationalId ?? ''],
    enabled: name.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_find_duplicate_candidates', {
        _full_name: name,
        _date_of_birth: dateOfBirth || null,
        _national_id: nationalId || null,
        _limit: 5,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        full_name: string;
        date_of_birth: string | null;
        national_id: string | null;
        status: string | null;
        match_score: number;
        match_reason: string | null;
      }>;
    },
    staleTime: 30_000,
  });

  if (name.length < 3) return null;

  if (isFetching) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking for possible duplicates…
      </p>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-xs text-muted-foreground">No similar individual found.</p>;
  }

  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-warning">
        <Users className="h-4 w-4" /> Possible duplicates ({data.length})
      </div>
      <p className="text-xs text-muted-foreground">
        One individual may hold many roles across entities — open the existing profile and add a role
        instead of creating a second record.
      </p>
      <ul className="space-y-1">
        {data.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">
              <Link
                to={`/fpa/individuals/${c.id}`}
                className="font-medium underline"
                onClick={onOpenExisting}
              >
                {c.full_name}
              </Link>
              {c.national_id ? ` · ID ${c.national_id}` : ''}
              {c.date_of_birth ? ` · DOB ${c.date_of_birth}` : ''}
              {c.match_reason ? ` · ${c.match_reason}` : ''}
            </span>
            <Badge variant="outline" className="font-mono shrink-0">
              {Math.round(Number(c.match_score ?? 0) * 100)}%
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FpDuplicateCandidates;
