# AML-CLOSE-02A — Governed runtime E2E certification

Date: 2026-10-03 (UTC). Environment: non-production preview backend.
All evidence below is read from durable records (policy package, binding, component,
methodology, snapshot, fact and event tables) or from live server responses captured
during this run. Nothing is reconstructed from memory or from deleted temporary files.

**TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY**

## A. Verdict

**CONDITIONAL PASS**

The core chain is proven end to end in the browser and on the server. The verdict is
conditional because four listed negative cases were not exercised live (H-gaps in G),
and one integrity finding (G-F1) about the component content hash is recorded but not fixed.

## B. Starting position

AML-CLOSE-02 was CONDITIONAL PASS: overlay, fact and source enforcement existed in the
database commands, but no active package bound those families and methodology 1.0 defines
no facts, so the enforcement had never run on a real assessment. Assessment-creation
refusal under an excluding overlay was also not proven. AML-CLOSE-02A was to prove the
whole chain on an isolated TEST configuration without touching FSRA policy.

## C. TEST certification configuration

| Item | Id | Version | Final status |
|---|---|---|---|
| Policy package `AML_TECH_CERT_POLICY` | cb8dc30e-c301-432f-8527-89686ee57292 | 1 | SUPERSEDED (by v2) |
| Policy package `AML_TECH_CERT_POLICY` | d7427fe1-7f13-42d2-816c-0c187798224e | 2 | RETIRED |
| Methodology `AML_TECH_CERT_METHOD` | df8921b4-096c-4e2a-8647-edea9f4c9397 | 2 | RETIRED |
| Calculation settings | cbecda28-d062-43fe-9f8a-638195ead511 | 1 | ACTIVE (only reachable via the retired methodology) |
| Sector overlay `AML_TECH_CERT_OVERLAY` | a9c454fb-c294-4607-841d-9918a2d0ba85 | 1 | SUPERSEDED |
| Sector overlay `AML_TECH_CERT_OVERLAY` | 3876ee95-999a-4fbf-9871-c27d4787eca0 | 2 | ACTIVE (bound only to retired package v2) |
| Sector overlay `AML_TECH_CERT_OVERLAY` | 4de4b99e-43aa-47bb-abe6-83e69ecf3b6f | 3-draft-neg | DRAFT (negative-test artefact, never bound) |
| Fact settings `AML_TECH_CERT_FACTS` | 05edf00c-898b-4637-bad0-0d49fd63f3cb | 1 | ACTIVE |
| Source settings `AML_TECH_CERT_SOURCES` | 19f44ec6-8ced-4164-8238-a886c0fdc27d | 1 | ACTIVE |

Package scope: regulator FSRA, sector VIRTUAL_ASSET_BUSINESS (ba6f00d3-…) only.
TEST v1 methodology (0e1e2e54-…) is SUPERSEDED; the mis-created TEST-labelled copy
(09eae55b-…) remains DRAFT.

## D. Governance proof

Maker: aml_supervision_officer (b8eaf680-…). Checker: aml_supervision_supervisor (0b522724-…).
- Package v1: `created_by` b8eaf680, `approved_by` 0b522724 (stored on the record).
- Overlay v1 / fact v1 / source v1: `created_by` b8eaf680, `approved_by` 0b522724.
- Overlay v2: submitted by maker; maker self-approval refused
  (`maker_checker: the person who submitted this component cannot approve it`); approved and
  activated by checker.
- Package v2: maker moved it to REVIEW; maker approval refused HTTP 403
  (`not_authorized: the author of a policy profile version cannot approve it`); checker
  approved and activated, compatibility check `compatible: true, error_count: 0`.

## E. Complete runtime trace

```text
Helen Digital Assets Ltd (fdf5c81f-9aa8-40da-9df0-781f3c2e7adc, demo-labelled)
 -> sector VIRTUAL_ASSET_BUSINESS (ba6f00d3-…)
 -> package AML_TECH_CERT_POLICY v1 (cb8dc30e-…)
 -> methodology AML_TECH_CERT_METHOD v2 (df8921b4-…)
 -> calculation settings v1 (cbecda28-…)
 -> overlay AML_TECH_CERT_OVERLAY v1 (a9c454fb-…) — APPLICABLE
 -> fact settings AML_TECH_CERT_FACTS v1 (05edf00c-…) — STR_COUNT required
 -> source settings AML_TECH_CERT_SOURCES v1 (19f44ec6-…) — STR_COUNT: RETURN
 -> fact AML_TECH_CERT_STR_COUNT (requirement 890022fc-…)
 -> source RETURN
 -> value 12 (fact 71b4bf9a-0ed0-40c7-99da-2104c36bad90, value_numeric 12)
 -> provenance.governance: overlay v1, fact settings v1 (is_required true),
    source binding v1 (source_kind RETURN), recorded_by b8eaf680, 2026-10-03T17:37:24Z
 -> assessment SUP-AML_CFT-2026-00838 (66cc17e3-f944-4b93-be22-8857565a1213)
 -> snapshot content_hash 7e5bed5e523315dec267329dbca344c2
```

Evidence-file linkage was not exercised; no new evidence architecture was added.

## F. Browser E2E result

Real login UI as the AML officer; no session injection.
1. Assessments page → "New AML/CFT assessment" → entity Helen Digital Assets Ltd →
   "Periodic AML/CFT assessment". Dialog showed `AML_TECH_CERT_METHOD v2 … TEST ONLY`.
2. Created SUP-AML_CFT-2026-00838 (draft). Snapshot lists PROGRAMME 1.0+FSRA, CALC 1,
   FACT_CONFIG 1, METHODOLOGY 2, SECTOR_OVERLAY 1, SOURCE_BINDING 1.
3. Working file, before recording:
   - STR_COUNT: may be recorded Yes (VAB), mandatory Yes, source RETURN, status **Missing**.
   - NOT_CONFIGURED: may be recorded No; no Record button.
   - OTHER_SECTOR and RETIRED: Record button shown — **defect 3, fixed below**.
4. Record STR_COUNT: source list offered only "Regulatory return". Saved 12.
   Record HAS_FLAG: source list offered only "Officer entry". Saved true.
5. Page reload: STR_COUNT "Recorded (RETURN)", HAS_FLAG "Recorded (MANUAL)"; same versions.
6. After defect-3 fix, re-run: NOT_CONFIGURED, OTHER_SECTOR, RETIRED all show 0 action
   buttons; OTHER_SECTOR shows "No — applies to another sector (INTERNATIONAL_BANKING)".

Database: two `supervisory_assessment_fact` rows (values above) with
`methodology_id` df8921b4-…, `recorded_by` b8eaf680-…. Observation: `source_reference`
was saved empty because the screen only pre-fills it when the source is changed; the
governed reference is still recorded in `provenance.governance.source_binding`.

## G. Negative / security results

All forged calls used the officer's genuine signed-in token directly against the
backend, bypassing the screen (`supervisory_assessment_fact_set`). All HTTP 400 / 22023.

| Case | Result |
|---|---|
| Unknown fact code | refused — not defined by the attached methodology version |
| Fact not in fact settings (hidden in UI) — **forged request** | refused — not a permitted fact under AML_TECH_CERT_FACTS 1 |
| Fact for another sector | refused — does not apply to sector VIRTUAL_ASSET_BUSINESS |
| Retired fact definition | refused — retired fact definition |
| Wrong data type (`not-a-number`) | refused — not a whole number |
| Fact-settings/methodology type conflict | refused — not a whole number |
| Source not allowed (MANUAL for TIER) | refused — binding allows FORM |
| Unknown source kind | refused — binding allows MANUAL |
| Bind DRAFT overlay to a package | refused — component_not_approved |
| Self-approval of component / package | refused (see D) |
| **Create assessment when overlay excludes sector** | refused HTTP 400: `Sector overlay AML_TECH_CERT_OVERLAY 2 marks sector VIRTUAL_ASSET_BUSINESS as not applicable.` No assessment row created (Helen still has exactly 1). |
| Sector outside TEST package | Resolution for VAB after retirement, and for every non-VAB sector, returns FSRA package 1.0, never the TEST package (scope = VAB only). |

Not exercised live (gaps): inactive overlay at creation, SUBMITTED-but-unapproved overlay
at creation, overlay outside its effective period, inactive/draft source settings.
The code paths exist (`supervisory_assessment_pinned_component_internal` returns
UNAVAILABLE for unapproved or non-effective pinned components, and binding refuses
non-approved components), but they were not driven by a live test.

Finding G-F1: `supervisory_policy_component_content_hash` includes the lifecycle status, so
overlay v1's hash changed from `2a8d2ad5…` to `08a5aea1…` when it became SUPERSEDED, with
content unchanged. No function compares stored and recomputed hashes, so nothing breaks
today, but the hash is not a pure content fingerprint. Not fixed here: a fix changes every
recomputed hash and needs its own decision.

## H. Version immutability proof

Original bindings on SUP-AML_CFT-2026-00838: package v1, methodology v2, calc v1, overlay v1,
fact v1, source v1. A later overlay v2 (VAB = NOT_APPLICABLE) and package v2 were created
and activated through normal governance. Afterwards:
- the snapshot row is unchanged (protected by `supervisory_assessment_policy_snapshot_immutable`);
- configuration authority still reports overlay v1, status SUPERSEDED, applies = true;
- a new fact (TIER = TIER_A, source FORM) was recorded at 17:41:56Z and its provenance
  names overlay v1 / fact v1 / source v1;
- a new assessment resolved the later version and was refused (G).
After retiring package v2 and methodology v2, all three families still report GOVERNED for
this assessment and its three facts remain readable.

## I. Faults fixed during this work

1. **Single-entity coverage**: `staff_portfolio_scope_add` copied sector/sub-sector into
   entity scopes, which the validator forbids, so every single-entity add failed. Fixed to
   leave them empty for entity scopes. Proof: Helen was added to the officer's coverage by
   the normal command, and the officer could see and assess her. The command still requires
   the admin permission.
2. **Free-text fact source**: the fact screen let you type any source. It now offers only the
   governed sources and hides facts the settings do not permit (F, steps 3–4).
3. **(Found in this run) Refused facts still showed "Record"**: the configuration view ignored
   retired definitions and sector limits. `supervisory_assessment_configuration_authority` now
   returns `permitted=false` with `not_permitted_reason` (RETIRED_DEFINITION,
   NOT_IN_FACT_CONFIG, OTHER_SECTOR, FACT_CONFIG_UNAVAILABLE). Display only. Backend
   enforcement is unchanged and was proven separately by the forged calls.

## J. FSRA non-impact verification

- FSRA-AML-CFT-POLICY 1.0 (5dcc6999-…): ACTIVE. `updated_at`, `approved_at`, `activated_at`
  = 2026-09-12T14:07:47Z. Its newest binding `updated_at` is the same, so it was not modified.
  The TEST package never replaced it (`superseded_profiles: 0` on TEST v1 activation;
  v2 activation superseded only TEST v1).
- Methodology AML-CFT-RBA 1.0: ACTIVE, updated_at 2026-09-02. Methodology 1.1: DRAFT.
- TEST methodology v2 was VAB-scoped and is now RETIRED.
- Snapshots: FSRA 1.0 / methodology 1.0 = 3 assessments, last stamped 2026-09-29. None
  remapped.
- SUP-AML_CFT-2026-00830: approved, methodology 1.0, snapshot FSRA 1.0, updated_at
  2026-09-12T14:11:29Z. Unchanged.
- STR_SAR_GOVERNANCE and the 19 missing published risk records were not touched.

## K. TEST package retirement

- Package v2 → RETIRED (maker, rationale recorded). Package v1 was already SUPERSEDED.
- Methodology v2 → RETIRED (checker).
- Effect: for Helen/VAB the resolver now returns FSRA package 1.0, and no TEST package is
  eligible.
- Preservation: no rows deleted. The certification assessment, snapshot, facts and provenance
  stay readable, and its families still resolve as GOVERNED.
- Left in place: overlay v2, fact v1, source v1 and calc v1 stay ACTIVE but are unreachable,
  because no active package binds them. Overlay draft 3-draft-neg stays DRAFT.

## L. Regression results

- TypeScript typecheck (`tsgo`): PASS, 0 errors.
- AML / supervisory / policy unit tests: 22 files, **343 / 343 passed**.
- Front-end boundary gates: AML-04 7/7, AML-05 12/12, calculation 12/12, AML-07 17/17,
  AML-08 20/20, AML-09 27/27, AML-10 33/33, AML-11 39/39 → **167 / 167 passed**.
- AML-CLOSE-02 / 02A backend checks: live server tests in G/H. All 12 refusals and the
  creation refusal behaved as expected.
- Browser E2E: journey F passed; the scripted re-check after the fix passed.
- Not run: the SQL verifier scripts under `scripts/` and the committed Playwright cert-v2
  suite. No committed Playwright spec was added for this journey.
- Build: OK.

## M. Remaining regulator / business decisions (not technical failures)

- Real FSRA sector overlays.
- Real FSRA structured facts.
- Real FSRA permitted sources.
- Whether methodology 1.0 is amended or 1.1 (or another version) is adopted.
- STR_SAR_GOVERNANCE mapping.
- Meaning of "applies with modifications" (current interpretation retained).
- Real calculation and rating values requiring regulator approval.
- Whether the component content hash should exclude lifecycle status (G-F1).

## N. Final certification statement

**Has the platform technically proven end-to-end that a governed policy package can drive
Sector Overlay + Facts + Sources through an actual AML/CFT assessment, with backend
enforcement, source provenance, version immutability and governance controls?**
YES for the core chain: browser journey, server refusals, forged request, creation refusal,
immutability and maker-checker. It is qualified by the four negative cases not driven live
(G), which is why the verdict is CONDITIONAL PASS and not PASS.

**Does this certify the substantive FSRA AML/CFT regulatory configuration?** NO. Every
value used was TEST-only, and no regulator-approved policy value was created or changed.

AML-CLOSE-03 has not been started.
