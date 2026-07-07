## Update `fp-screening-run` edge function to questionnaire-only parsing

Overwrite `supabase/functions/fp-screening-run/index.ts` with the uploaded version that reads declaration answers from `declaration_data.questionnaire.<key> = { answer, explanation }` instead of the legacy flat fields.

### Scope
- Single file change: `supabase/functions/fp-screening-run/index.ts`.
- No DB schema, RLS, table, or frontend changes.
- Auto-deploys on write.

### Behavior after deploy
- Criminal / credit / regulator findings fire from the new questionnaire keys:
  - `criminal_conviction`, `criminal_pending`, `director_disqualified`, `civil_judgment`
  - `bankruptcy`, `insolvent_director`
  - `license_refused`, `license_revoked`, `disciplinary_proceedings`
- PEP keyword scan also reads `q.other_regulated_roles`.
- Sanctions + adverse-media (AI) logic unchanged.
- Run row creation, config snapshot, high-severity escalation, notification dispatch, and integration logging unchanged.

### Accepted trade-off
Legacy assessments whose `declaration_data` is still in the flat shape (`criminal_record`, `financial_soundness`, `regulatory_history`, `disqualifications`, `bankruptcy`, `disciplinary`) will **not** generate criminal / credit / regulator findings on re-run. Only sanctions + adverse-media checks would fire for those.

### Rollback
Chat revert or History tab restores the previous version; auto-redeploys immediately. No data migration needed.

### Verification
Tail `fp-screening-run` logs after the next manual screening run to confirm success and expected finding counts.
