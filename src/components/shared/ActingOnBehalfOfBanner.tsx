import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types/platform';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { UserCheck, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface ActiveDelegation {
  id: string;
  name: string;
  delegate_from_user_id: string | null;
  effective_from: string | null;
  effective_until: string | null;
  delegator_name?: string;
}

/**
 * Shows a persistent banner whenever the current user has one or more active
 * delegations granting them authority on behalf of another user. Filters by
 * `delegate_to_user_id == current user`, `is_active`, and the
 * `effective_from`/`effective_until` window.
 */
export function ActingOnBehalfOfBanner() {
  const { user } = useAuth();
  const { isPpoc, mappedLicensees, activeLicensee } = usePpoc();
  const [delegations, setDelegations] = useState<ActiveDelegation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data: rules } = await supabase
        .from('delegation_rules')
        .select('id, name, delegate_from_user_id, effective_from, effective_until, is_active')
        .eq('delegate_to_user_id', user.id)
        .eq('is_active', true);

      const active = ((rules || []) as ActiveDelegation[]).filter(r => {
        const fromOk = !r.effective_from || r.effective_from <= nowIso;
        const untilOk = !r.effective_until || r.effective_until >= nowIso;
        return fromOk && untilOk;
      });

      if (active.length === 0) {
        if (!cancelled) {
          setDelegations([]);
          setLoading(false);
        }
        return;
      }

      const fromIds = Array.from(
        new Set(active.map(d => d.delegate_from_user_id).filter(Boolean) as string[])
      );
      let nameMap: Record<string, string> = {};
      if (fromIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', fromIds);
        nameMap = Object.fromEntries(((profs || []) as any[]).map(p => [p.id, p.full_name]));
      }

      if (!cancelled) {
        setDelegations(
          active.map(d => ({
            ...d,
            delegator_name: d.delegate_from_user_id ? nameMap[d.delegate_from_user_id] : undefined,
          }))
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // PPOC-only banner: shown when the user is mapped to exactly one licensee
  // (in which case the header switcher is hidden but they still need a clear cue
  // that they're acting on behalf of an entity).
  const showPpocSoloBanner = isPpoc && mappedLicensees.length === 1 && activeLicensee;

  if (loading || (delegations.length === 0 && !showPpocSoloBanner && !user?.delegatedRole)) return null;

  const delegatedRoleLabel = user?.delegatedRole ? ROLE_LABELS[user.delegatedRole] : null;

  return (
    <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
      <UserCheck className="h-4 w-4 text-amber-700 dark:text-amber-400" />
      <AlertTitle className="text-amber-900 dark:text-amber-200">
        {showPpocSoloBanner
          ? `Acting as PPOC for ${activeLicensee!.licensee_name}`
          : delegatedRoleLabel
          ? `Acting as ${delegatedRoleLabel}${user?.delegatedFromName ? ` (delegated by ${user.delegatedFromName})` : ''}`
          : `Acting on behalf of ${delegations.length === 1 ? 'another user' : `${delegations.length} users`}`}
      </AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-300 space-y-1 mt-1">
        {showPpocSoloBanner && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="border-amber-400 text-amber-900 dark:text-amber-200">
              <Building2 className="h-3 w-3 mr-1" />
              {activeLicensee!.licensee_name}
            </Badge>
            <span>All return submissions will be tagged to this licensee.</span>
          </div>
        )}
        {delegatedRoleLabel && (user?.delegationFrom || user?.delegationUntil) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="border-amber-400 text-amber-900 dark:text-amber-200">
              {delegatedRoleLabel}
            </Badge>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {user.delegationFrom ? format(new Date(user.delegationFrom), 'PP') : '—'}
              {' → '}
              {user.delegationUntil ? format(new Date(user.delegationUntil), 'PP') : '—'}
            </span>
          </div>
        )}
        {delegations.map(d => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="border-amber-400 text-amber-900 dark:text-amber-200">
              {d.name}
            </Badge>
            {d.delegator_name && <span>delegated by <strong>{d.delegator_name}</strong></span>}
            {d.effective_until && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                until {format(new Date(d.effective_until), 'PP')}
              </span>
            )}
          </div>
        ))}
      </AlertDescription>
    </Alert>
  );
}
