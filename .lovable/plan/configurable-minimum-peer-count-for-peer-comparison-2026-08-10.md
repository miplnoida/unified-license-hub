# Configurable Minimum Peer Count for Peer Comparison

Today the peer-comparison confidentiality gate is fixed at 5 peers: `peer_ratio_snapshot` defaults `_min_peers` to 5, the Prudential Analytics page hardcodes `MIN_PEERS = 5` for its message, and the Entity Profile peer tab falls back to 5 in its label. This makes it one configurable global value with a hard floor of 3.

## What changes for users

- A new **Peer comparison** setting: "Minimum peers required to publish a distribution", default 5, editable only by users who can manage prudential configuration.
- The setting lives as a small card on the Prudential Analytics page (Admin → Returns → Prudential → Analytics), shown read-only to users without config rights.
- Everywhere peer comparison is shown — Analytics page, Prudential Entity Profile peer tab, and the AI return-analysis peer snapshot — the insufficient-data message and the gate use the configured number instead of a hardcoded 5.
- Values below 3 are rejected (confidentiality guard) and values are capped at a sane upper bound (50).

## Technical notes

Backend (one migration)
- Store the value in the existing `site_settings` key/value table under key `prudential_peer_settings` as `{ "min_peers": 5 }`; no new table. Seed the row if absent.
- Replace `public.peer_ratio_snapshot(date, text, uuid, uuid, integer)` with a version where `_min_peers` defaults to `NULL`, meaning "use the configured value": resolve `v_min := GREATEST(COALESCE(_min_peers, <configured>, 5), 3)`. Explicit callers can still pass a stricter number; the floor of 3 always applies. Keep the existing signature, `STABLE`, `SECURITY DEFINER`, `search_path`, and the current REVOKE/GRANT lines so no caller breaks.
- Add a small `STABLE SECURITY DEFINER` helper `public.prudential_min_peers()` that reads the setting (so the snapshot function does not depend on `site_settings` RLS), granted to `authenticated, service_role`.
- Guard writes: saving the setting goes through a `SECURITY DEFINER` RPC `set_prudential_min_peers(_value int)` that requires the existing prudential-config permission check (super admin allowed), validates 3–50, writes `site_settings`, and records a compliance audit entry consistent with the other prudential config RPCs.

Frontend
- New hook `src/hooks/usePeerSettings.ts`: `usePeerMinPeers()` (reads `site_settings` key, defaults to 5) and `useSavePeerMinPeers()` (calls the RPC, invalidates the setting plus all `peer_ratio_snapshot` queries so charts re-evaluate immediately).
- `src/pages/returns-mgmt/PrudentialAnalytics.tsx`: drop the local `MIN_PEERS = 5` constant, use the configured value for the insufficient-peer message, and add the settings card (number input, 3–50, Save, validation message, disabled without permission).
- `src/pages/prudential/PrudentialEntityProfile.tsx`: peer tab label uses `p?.min_peers` (already returned by the RPC) with the configured value as fallback instead of the literal 5.
- `supabase/functions/generate-return-analysis/index.ts`: stop pinning a peer minimum; pass `_min_peers: null` so the configured value applies.
- `src/lib/prudentialPhase2.ts` keeps its pure helpers unchanged; only the doc comment noting the fixed 5 is corrected.

Tests
- Update `supabase/tests/phase2/02_peer_comparison.sql`: assert the default now follows the configured setting, that an explicit higher `_min_peers` still wins, and that a request below 3 is clamped to 3.

## Verification

- Set the value to 3 on the Analytics page and confirm a 3-peer ratio/period now renders a distribution that previously showed "insufficient peer data"; set it to 10 and confirm the same selection reverts to the insufficient message quoting 10.
- Confirm a non-config user sees the value but cannot save, and that saving 2 is rejected.
- Re-check the Entity Profile peer tab quotes the configured minimum, and run the phase2 peer SQL tests plus typecheck.
