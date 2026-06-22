import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { getEffectivePortalContext } from '@/lib/effectiveRole';

export function useEffectivePortalContext() {
  const { user } = useAuth();
  const { isPpoc, actingAs, resolvedLicenseeId, ownLicenseeId, loading: ppocLoading } = usePpoc();

  return useMemo(
    () =>
      getEffectivePortalContext({
        baseRole: user?.role,
        userType: user?.userType,
        isPpoc,
        actingAs,
        resolvedLicenseeId,
        // Primary User status must come from EXPLICIT signals only — never
        // from an inferred ownLicenseeId (name match / license back-ref),
        // which would mislabel applicants/pre-licensees as "Primary User".
        hasPrimaryUserAccess:
          !!user?.licenseeId
          || String(user?.userType || '').toLowerCase() === 'primary'
          || user?.role === 'licensee_primary',
        ppocLoading,
      }),
    [actingAs, isPpoc, ownLicenseeId, ppocLoading, resolvedLicenseeId, user?.licenseeId, user?.role, user?.userType],
  );
}