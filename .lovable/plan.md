## Fix "column legal_name does not exist" on Map to Licensee

**Root cause:** The `link_complaint_licensee` RPC was written against a `licensees.legal_name` column that does not exist — the real column is `name`. The RPC raises the 42703 error before the update runs. A stale reference in `ComplaintsList.tsx` also selects `legal_name` and would fail once that list tries to enrich names.

### Changes

1. **Migration** — replace `public.link_complaint_licensee` so it reads `name` instead of `legal_name` (unchanged signature, grants, security-definer, and audit payload — just the SELECT column and variable comment).
2. **`src/pages/complaints/ComplaintsList.tsx`** (lines 256/259) — drop `legal_name` from the `licensees` select and from the fallback expression; use `name` only.

### Not changing
- No schema change to `licensees`.
- No other callers or RLS.
