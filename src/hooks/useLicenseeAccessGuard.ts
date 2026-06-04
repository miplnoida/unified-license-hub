import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Server-verified authorization check for licensee-scoped actions.
 *
 * Returns true only when the backend confirms the current auth.uid() is
 * either the Primary User of `licenseeId` (profiles.licensee_id match) or
 * has an ACTIVE PPOC mapping covering it (and the sector when provided).
 *
 * NEVER rely on client context (usePpoc / resolvedLicenseeId / actingAs)
 * alone before performing a write — call this first.
 */
export function useLicenseeAccessGuard() {
  const verify = useCallback(
    async (licenseeId: string | null | undefined, sectorId?: string | null) => {
      if (!licenseeId) return false;
      const { data, error } = await supabase.rpc(
        "can_current_user_access_licensee",
        {
          target_licensee_id: licenseeId,
          target_sector_id: sectorId ?? null,
        },
      );
      if (error) {
        console.error("[useLicenseeAccessGuard] RPC error", error);
        return false;
      }
      return data === true;
    },
    [],
  );

  return { verify };
}
