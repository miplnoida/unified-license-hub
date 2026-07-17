# Complaints Automation Closure — Sequential Sprint (a → b → c)

Each phase lands as its own migration + code + behavioural test, verified before moving to the next. No phase is marked Fixed until its test passes and `docs/verification/complaints/11_final_verification.md` is updated with evidence.

---

## Phase (a) — Automatic Duplicate Candidate Generation

**Goal:** New/updated complaints automatically produce weighted duplicate candidate pairs, replacing the current manual-only flow.

### Database
- New table `public.complaint_duplicate_scoring_config` (single active row): weights for `complainant_email`, `complainant_phone`, `licensee_id`, `subject_trigram`, `description_trigram`, `time_window_days`, `min_score`. GRANTs + RLS (admin write, authenticated read).
- Function `public.generate_complaint_duplicate_candidates(_complaint_id uuid)` — `SECURITY DEFINER`, `search_path=public`:
  - Loads active config.
  - Finds candidates within the same regulator + time window.
  - Computes weighted score (exact matches on email/phone/licensee; `pg_trgm` similarity on subject/description).
  - Upserts into `complaint_duplicate_pairs` using a **symmetric key** (`least(a,b), greatest(a,b)`) so pair uniqueness holds regardless of insert order. Adds partial unique index `uq_duplicate_pair_symmetric` for pending rows.
  - Skips pairs already `confirmed`/`dismissed`/`merged`.
- Trigger `trg_complaints_generate_duplicates` `AFTER INSERT OR UPDATE OF complainant_email, complainant_phone, licensee_id, subject, description ON public.complaints` → calls the generator.

### Tests (`supabase/tests/complaints/06_duplicates.sql` — rewritten behavioural)
- Seed regulator + two complaints sharing email → assert a `pending` pair with score ≥ threshold.
- Same complainant, different regulator → assert no pair created (regulator scope).
- Outside time window → no pair.
- Re-insert same pair (order flipped) → symmetric uniqueness holds (still one row).
- Confirming pair sets `parent_complaint_id`; re-running generator does not resurrect it.

### Frontend
- `src/pages/complaints/duplicates/` list already reads `complaint_duplicate_pairs` — verify it renders newly generated rows (no code change expected beyond query refresh).

### Verification
Update `11_final_verification.md`: item 3 → Fixed with test file + migration reference.

---

## Phase (b) — Scheduled Escalation Sweep

**Goal:** Time/age/SLA-based escalation cases open automatically without a user action.

### Database
- Function `public.evaluate_complaint_escalations(_complaint_id uuid)` — evaluates every enabled row in `complaint_escalation_rules` against one complaint; opens a `complaint_escalation_cases` row (respecting `uq_escalation_active_kind`), writes audit + notification outbox rows.
- Function `public.evaluate_all_complaint_escalations()` — loops active complaints, calls the per-complaint evaluator, returns summary counts.
- Both `SECURITY DEFINER`, `search_path=public`.

### Edge Function
- `supabase/functions/complaint-escalation-sweep/index.ts` — service-role client, calls `evaluate_all_complaint_escalations()`, returns HTTP 200 summary (matches existing `sla-escalation-sweep` pattern).
- Deno test `index_test.ts` — mocks Supabase client, asserts RPC invoked, error path returns 200 with `ok:false`.

### Cron
- Via `supabase--insert` (not migration, per project rules): `cron.schedule('complaint-escalation-sweep', '*/15 * * * *', $$ select net.http_post(...) $$)` targeting the deployed function URL with anon key header.

### Tests (`supabase/tests/complaints/07_escalations.sql` — rewritten behavioural)
- Seed complaint older than rule threshold → evaluator opens case with correct tier.
- Duplicate call → unique-active-kind index blocks second row.
- Dismiss case → evaluator can reopen after dismissal.
- Non-matching complaint → no case.

### Verification
Update `11_final_verification.md`: item 4 → Fixed with function + test + cron reference.

---

## Phase (c) — Physical Storage Object Cleanup

**Goal:** Orphaned `complaint_evidence` blobs are removed from Storage, not just DB rows.

### Database
- Extend `cleanup_orphaned_complaint_evidence` to return `(file_upload_id uuid, storage_bucket text, storage_path text)` so the worker can delete objects.
- New table `public.complaint_storage_cleanup_deadletter` (id, file_upload_id, bucket, path, attempts, last_error, created_at). GRANTs + RLS (service_role only).

### Edge Function
- `supabase/functions/complaint-storage-cleanup/index.ts`:
  - Calls the cleanup RPC (default interval 24h).
  - For each returned row, `storage.from(bucket).remove([path])`.
  - Retry up to 3 attempts in-loop with backoff; on final failure insert into deadletter table.
  - Returns HTTP 200 summary.
- Deno test `index_test.ts` — mocks storage client; asserts remove called per row, deadletter insert on failure, 200 response on error.

### Cron
- `supabase--insert` scheduling daily at 02:00.

### Tests (`supabase/tests/complaints/08_attachments.sql` — extended behavioural)
- Insert staged evidence older than interval, never finalised → RPC returns row, deletes DB record.
- Finalised evidence within interval → RPC leaves it alone.
- Deadletter table exists, RLS restricts to service_role.

### Verification
Update `11_final_verification.md`: items 5 (and residual 1 for these three files) → Fixed.

---

## Sequencing & Guardrails

1. Execute phases strictly in order. Do not start (b) until (a)'s migration is approved and tests are green in `supabase test db`. Same gate between (b) and (c).
2. Each phase: migration first (via `supabase--migration`), wait for approval, then code + tests, then verification doc update.
3. Item 2 (11-persona RLS matrix) and item 6 (observed green Actions run) remain out of scope for this sprint — they will be called out as still-open in the verification doc so nothing is misrepresented.
4. No `continue-on-error`; CI stays blocking as previously hardened.

## Technical Notes
- Symmetric duplicate uniqueness: `CREATE UNIQUE INDEX uq_duplicate_pair_symmetric ON complaint_duplicate_pairs (least(complaint_a_id, complaint_b_id), greatest(complaint_a_id, complaint_b_id)) WHERE status = 'pending';`
- `pg_trgm` extension already enabled (used by `search_licensees`); reuse `similarity()`.
- Edge functions follow existing pattern: `npm:@supabase/supabase-js@2/cors`, service-role client, HTTP 200 error bodies.
- Cron uses `supabase--insert` (not migration) because URLs/anon keys are project-specific.
