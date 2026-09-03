# W4 — Supervisory Question Governance (P0 corrections)

Verification gate: `scripts/verify-w4-question-governance.sql` (`psql -v ON_ERROR_STOP=1 -f …`) — 7 gates, all PASS.

## 1. One question catalogue, one source of truth

| Object | Classification |
| --- | --- |
| `public.supervisory_methodology_question` | **AUTHORITATIVE** normalised catalogue (one row per dimension question) |
| `supervisory_methodology_dimension.mandatory_questions` (JSONB) | **COMPATIBILITY_SNAPSHOT** — read-only mirror, documented via `COMMENT ON COLUMN`. Retained for existing readers; not a write path. |

- `supervisory_methodology_question_sync(dimension_id, questions jsonb)` performs the deterministic
  normalisation: stable `question_code` (`code`/`question_code`, else `Q<ordinality>`), preserved
  `methodology_id`, `methodology_dimension_id` and ordering (`sort_order = ordinality * 10`),
  evidence requirements inherited from the dimension when not stated.
- Removed questions are **retired** (`active = false`), never deleted. An absent or empty snapshot is
  **never destructive**.
- `supervisory_methodology_question_backfill()` is the idempotent one-shot backfill of the legacy
  JSONB snapshot. Census at migration time: 51 dimensions, all snapshots empty → 0 rows converted;
  41 catalogue questions already normalised.
- Configuration write paths now maintain the catalogue:
  `supervisory_methodology_dimension_save` mirrors `mandatory_questions` into the catalogue for
  `DRAFT`/`REVIEW` versions (and now rejects question edits on `ACTIVE`/`APPROVED` versions);
  `supervisory_methodology_new_version` copies the catalogue to the new draft version.
- Parity gate (G2): configured question count and text must equal the working-file catalogue.

## 2. Domain-specific write authority

`supervisory_assessment_question_upsert` no longer accepts an unrelated permission bundle. It derives
`domain_code` from the assessment and resolves the required action through
`supervisory_domain_actions(domain_code, 'edit')`:

| Domain | Edit authority |
| --- | --- |
| `AML_CFT` | `aml_supervision.edit` |
| `PRUDENTIAL` | `prudential_supervision.record_camels_assessment` |
| `MARKET_CONDUCT` | `market_conduct.edit` / `market_conduct.run_conduct_analytics` |
| other | `supervisory_spine.edit` |

Approval is **not** edit: `aml_supervision.approve` alone no longer permits a response write.
Entity supervisory scope (`supervisory_entity_scope_check`) still applies, and the status gate
(`draft` / `returned_for_revision`) is unchanged. NA rationale is now enforced at write time as well
as at submission.

Negative evidence (G4): an AML viewer/examiner without `aml_supervision.edit` is refused with
`42501`; the AML officer holding `aml_supervision.edit` succeeds.

## 3. Response visibility follows the assessment

`supervisory_assessment_question_response_read` now delegates to
`supervisory_assessment_question_readable(uid, assessment_id)`, which requires, in order:

1. the domain **view** permission for the assessment's own domain,
2. entity supervisory scope (`view_all_entities` or an entity assignment),
3. for `CONFIDENTIAL` / `RESTRICTED` / `SECRET` assessments: the domain confidential-view permission
   (`aml_supervision.view_confidential`), or being the assessment `owner_id` / `created_by`
   (the officer's own working file).

Super admin remains the only bypass.

## 4. Gap check split

| Routine | Exposure |
| --- | --- |
| `supervisory_assessment_question_gaps_internal(uuid)` | `service_role` only — used by the submission guard trigger |
| `supervisory_assessment_question_gaps(uuid)` | `authenticated` — checks `supervisory_assessment_question_readable` first, then delegates |
| `supervisory_methodology_question_sync(uuid, jsonb)` | `service_role` only |

No question routine is `anon`-executable (G7). Anon-execute census unchanged at 7 allowlisted
routines; security-definer-view and search-path baselines unchanged.

## 5. Submission guard preserved

`supervisory_assessment_question_completeness_guard` still blocks `draft → submitted` on
`unanswered`, `observation_missing`, `na_rationale_missing` and `evidence_missing` (G6), now using
the internal helper so the guard carries no authorization side effects.

## 6. Regression matrix

| Suite | Result |
| --- | --- |
| `scripts/verify-w4-question-governance.sql` | 7/7 PASS |
| `scripts/verify-epic-2-supervisory-spine.sql` | ALL DB GATES PASSED |
| `scripts/verify-epic-3-aml-closed-loop.sql` | ALL GATES PASSED |
| `scripts/verify-dms-phase4-closure.sql` | 15/15 PASS |
| `scripts/verify-f0c-certification.sql` | 34 TESTED_PASS / 0 FAIL |
| Typecheck + build | clean |

Certification-script corrections made in this wave (assertion drift, not product defects):

- Epic 2 examination/plan population assertions were absolute counts; they now scope the
  preservation claim to the historical `LEGACY_UNKNOWN` population and compare against the
  pre-run baseline, so legitimately governed new supervisory work no longer reads as migration drift.
- Epic 2 and Epic 3 AML fixtures now answer the mandatory methodology questions through the governed
  RPC before submitting — the fixtures were previously relying on an ungoverned submission.
