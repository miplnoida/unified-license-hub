# AML-CLOSE-02 — Sector Overlay + Facts + Sources Runtime Authority

Environment: `app_environment_config = non_production`. LIVE was not touched and no messages
were sent. `SUP-AML_CFT-2026-00830`, `STR_SAR_GOVERNANCE` and the 19 unpublished approvals were
left unchanged.

## A. Verdict

**CONDITIONAL PASS.**

- The runtime enforcement is built and proven. It is pinned per assessment, versioned, enforced
  on the server and traceable.
- It is not yet live for FSRA assessments, for two reasons:
  1. The active FSRA package binds no overlay, fact configuration or source binding.
  2. Methodology 1.0 defines 0 structured facts.

  Both need a regulator decision; they must not be invented.

## B. What existed before

- **Configuration.** Sector overlay, fact configuration and source binding were stored in
  `supervisory_policy_component` (`component_type`). Each had a version, `effective_from`/`to`
  and the DRAFT→ACTIVE maker/checker lifecycle. They were bindable to a policy package but
  flagged `is_runtime_consumed = false`. Nothing read them.
- **Facts.** The canonical fact dictionary is `supervisory_methodology_fact_requirement`,
  versioned through its methodology.
  - Methodology 1.0: **0 facts**.
  - Methodology 1.1 (draft): 87 facts, all `ATTRIBUTES_PENDING`.
  - 0 assessment facts exist.
- **Sources.** `source_type` was free text, constrained only by an optional methodology
  expectation (unused). The screen defaulted it to `OFFICER_ENTERED`.
- **Version pinning.** It already existed in `supervisory_assessment_policy_snapshot` (immutable)
  and was used by evidence, judgement, response and SLA.

## C. What changed

Migration `AML-CLOSE-02`:

- **`supervisory_assessment_pinned_component_internal`** returns the component pinned in the
  assessment snapshot. It refuses (UNAVAILABLE) a component that is draft, unapproved,
  mismatched, missing or outside its effective date as of `resolved_as_of`.
- **`supervisory_assessment_sector_overlay_internal`** works out the entity's sector: assessment
  sector, otherwise the methodology context, then `sector_effective_id` (alias map). It decides
  APPLICABLE / MODIFIED / NOT_APPLICABLE, and rejects a sector the overlay does not list or
  cannot resolve.
- **`supervisory_assessment_fact_governance_internal`**:
  - the overlay must admit the sector;
  - the fact must be listed in the fact configuration;
  - optional `sector_codes` limits are applied;
  - the declared type must not conflict with the methodology type;
  - the source must match a bound `source_kind`, or be in the source vocabulary.
- **`supervisory_assessment_fact_set` / `_fact_override`** call the governance check and store
  the governing versions and hashes in `provenance.governance` and in the event log.
- **`supervisory_assessment_fact_gaps_internal`** also counts the fact configuration's
  `is_required` facts as missing information.
- **Snapshot stamping** refuses to create an assessment whose pinned overlay excludes the sector.
- **`supervisory_assessment_configuration_authority`** is a new read model for the screen. It
  checks auth and scope.
- **Policy screen and catalogue** now state that these three families are live
  (`is_runtime_consumed = true`).
- **UI.** A new `AmlConfigurationAuthorityPanel` on the assessment Working file shows the pinned
  versions, permitted and mandatory facts, accepted sources and missing facts.

## D. Runtime authority proof

```text
Entity → sector (assessment / context → alias map)
       → pinned SECTOR_OVERLAY (snapshot, approved, effective on resolved_as_of)
Fact write → methodology version fact → pinned FACT_CONFIG (listed, sector, type)
           → pinned SOURCE_BINDING (source_kind) → provenance.governance + event
```

- **Enforcement point.** All enforcement happens in database commands; the browser cannot skip
  it.
- **Version integrity.** A new component version gets a new id. The snapshot keeps the old id,
  so older assessments do not change.

## E. Tests (run 2026-10-03)

| Check | Result |
| --- | --- |
| Type check | PASS |
| AML unit tests | PASS: 19 files, 283 tests (278 existing + 5 new panel tests) |
| 5 AML screen-boundary verifiers | PASS: 136/136 gates |
| `scripts/verify-aml-close-02-configuration-authority.sql` | PASS: 23/23 gates. Run in one transaction that is always rolled back; afterwards 0 fixture rows remained (checked). |
| Browser E2E | Executed, but limited (see F) |

What the 23 gates cover:

- **Sector overlay:** correct overlay selected, sector outside the overlay, draft overlay,
  future-dated overlay, and the not-governed fallback.
- **Facts:** a mandatory fact is reported missing and then cleared once recorded; a permitted
  fact is accepted and its provenance stored; a fact not in the configuration is rejected; a
  fact for another sector is rejected; a type conflict is rejected.
- **Sources:** a source not bound to the fact is rejected; an unknown source kind is rejected;
  the correction path enforces the same source rules.
- **Pinned configuration:** fact recording is refused when the pinned overlay is draft, outside
  its effective date, or excludes the sector.
- **Bypass:** a forged `fact_requirement_id` is rejected.
- **Personas:** `read_only` and `licensee_primary_user` are denied with 42501; the licensee is
  also denied the read model.
- **Display:** the read model matches what the server enforces.
- **Version integrity:** an overlay v2 that excludes the sector does not change an assessment
  pinned to v1.

Not directly tested: refusal at creation time. It uses the same overlay check, but triggering it
would need a bound active package.

## F. E2E evidence

The browser run used TEST record `SUP-AML_CFT-2026-00739` (DEMO AML 05 Dennery Cooperative Credit
Union, draft, methodology 1.0, no policy basis).

1. Signed in and opened the Working file. The panel shows the sector resolved as CREDIT_UNIONS,
   all three families "not part of this assessment's policy" (reason: no policy basis), and
   "methodology defines no structured facts".
2. Reloaded the page; the same governed state was shown again.
3. Sent a forged fact submission directly to the backend with the real session. It was refused
   with HTTP 400, code 22023: "fact is not defined by the methodology version".

Nothing was written, so there is nothing to clean up.

The full persisted journey (record a governed fact → save → reload) is **BLOCKED**: there is no
active package binding and no methodology 1.0 facts.

## G. Owner decisions required

1. Author and approve the FSRA sector overlay, fact configuration and source binding, then
   activate a package version that binds them. This is regulator content.
2. Methodology 1.0 has no facts. Either fact attributes are approved for 1.1 and 1.1 is adopted,
   or facts are added to 1.0 by governed change.
3. 26 AML assessments have no policy basis snapshot. They stay outside this enforcement; there is
   no plan to back-fill them.
4. MODIFIED has no machine-readable modifications in the current overlay contract, so it is
   treated as applicable with a note.
5. `sector_codes` and `is_required` on fact configuration entries are enforced if present, but
   the authoring screen does not offer them yet.
6. Stray draft overlay `hjhgh` (carried over from AML-CLOSE-01).

## H. Remaining gaps

- No automatic pre-fill of facts from bound sources.
- No question- or section-level effect of the overlay.
- The authoring editor has no `sector_codes` / `is_required` fields.
- Materiality, dashboard and notification policies are still not consumed.
- The persisted browser E2E is pending the decisions in G.
- Linter: one intended authenticated-callable read model was added (same pattern as the other
  governed reads); 1798 earlier findings remain.

## I. Conclusion

**Sector Overlay + Facts + Sources are now authoritative runtime configuration for any AML/CFT
assessment whose pinned policy package binds them.** The server enforces them, they are versioned
per assessment, and they are traceable in each fact's provenance.

They do not yet govern FSRA assessments in practice. The active package binds none of the three,
and the methodology in use defines no facts. Both are regulator decisions (G1, G2).
