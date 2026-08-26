# MC-07.1 — Conduct 360 fact backend (backend only)

Build the server-authoritative, deterministic fact layer behind the approved MC-07 contract. No AI, no UI, no MC-07.2+ work.

## Scope

One primary read RPC returns the whole Conduct 360 fact snapshot for one entity and one review window, in a stable shape that later serves both the Conduct 360 screen and the governed AI input. Heavy lists keep their existing paged registers rather than being duplicated.

## Fact sections delivered

Built only where certified MC-00–MC-06 data already exists:

1. Entity and context — entity name, registration/licence context, sector and sub-sector, portfolio owner, review window echoed back.
2. Conduct posture summary — open complaints, complaints closed in window, upheld / partially upheld share, redress ordered vs paid, open signals, confirmed patterns, open alerts, overdue items.
3. Complaints and outcomes — window-scoped complaint list (reference, category, severity, status, SLA state, outcome) plus volumes by category and by month.
4. Redress and outcome indicators — counts and amounts ordered, agreed, paid, outstanding.
5. Conduct signals — entity-scoped signals with reference, source, category, severity, systemic potential, lifecycle status.
6. Deterministic patterns — clusters including this entity with rule, rule version, measure, measured value vs threshold, window, member count, review status.
7. Conduct alerts — kind, severity, origin, status, and the pattern or complaint each is linked to.
8. Product / channel / sector context — the same volumes broken down by product and distribution channel where those references exist.
9. Conduct risk indicators — existing conduct risk categories / ratings with their last human review.
10. Material trends and counts — window vs immediately preceding window deltas for each headline measure, computed in SQL.
11. Open supervisory items — open investigations, open RFIs, open reconsiderations, open supervisory actions, overdue SLA items.
12. Recent material activity — a merged, time-ordered feed of the material events in the window drawn from the existing history/annotation records.

Every section carries its measure, window, source module and a canonical drill-down reference so the consumer never has to guess where a number came from.

## Authority and scope

- Permission gate reuses the existing market-conduct read requirement used by the MC-05/MC-06 registers, so supervisors, analysts and auditors who can already read conduct data can read Conduct 360.
- Regulator and operating-structure scope enforced through the existing `regulatory_scope_allows` guard on the entity, its regulator and its sector; out-of-scope or wrong-regulator entities raise the same denial as MC-05/MC-06 rather than returning partial data.
- Read-only by construction: the function performs no writes, so auditor personas get identical output with nothing to mutate.
- No AI fields anywhere in the payload; the advisory store is untouched in this phase.

## Technical detail

- New function `public.conduct_360_snapshot(_entity_id uuid, _window_start date default null, _window_end date default null)` returning `jsonb`, `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = public`, defaulting to a trailing 12-month window.
  - Structure: `{ generated_at, window, entity, posture, complaints, redress, signals, patterns, alerts, product_channel, risk_indicators, trends, open_items, recent_activity, provenance }`, each section an object with `measures`, `items` and `source` keys so the shape is stable when a section is empty.
  - All aggregation done in CTEs in a single call — one round trip, no N+1.
  - Business references only (complaint/signal/pattern/alert reference strings, entity and sector names, human-readable statuses); ids are present only inside each item's `href`/`ref` for drill-down.
- Helper functions added only if the snapshot cannot stay within one statement: at most `public.conduct_360_peer_comparison(_entity_id, _window_start, _window_end)` for sector peer measures. Existing `conduct_cluster_register`, `conduct_signal_register`, `conduct_alert_register`, `conduct_action_register` and `conduct_entity_profile_summary` are reused, not reimplemented.
- `REVOKE ALL` from `anon`, `EXECUTE` granted to `authenticated` and `service_role`, matching MC-05/MC-06.

## Tests

New `supabase/tests/conduct/06_conduct_360_fact_layer.sql` (pgTAP), targeted only:

- authorised in-scope supervisor read returns a populated snapshot with every contracted section key present;
- wrong-regulator / out-of-scope entity read is denied;
- auditor persona read succeeds and the function is write-free (SECURITY DEFINER with pinned search_path, no DML on fact tables);
- deterministic counts — snapshot counts match direct SQL counts over the same window, and two consecutive calls are identical;
- source references — every item exposes a business reference and a drill-down href;
- no AI-generated fields — the payload contains no advisory/model/prompt/confidence keys.

## Out of scope

AI generation, advisory store changes, prompts, Conduct 360 UI, MC-07.2+ and broad certification.
