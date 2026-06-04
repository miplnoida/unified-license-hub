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
        isPpoc,
        actingAs,
        resolvedLicenseeId,
        hasPrimaryUserAccess: !!(user?.licenseeId || ownLicenseeId),
        ppocLoading,
      }),
    [actingAs, isPpoc, ownLicenseeId, ppocLoading, resolvedLicenseeId, user?.licenseeId, user?.role],
  );
}