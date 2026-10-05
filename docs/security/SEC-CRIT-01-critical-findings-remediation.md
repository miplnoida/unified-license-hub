# SEC-CRIT-01 — Critical Findings Remediation

Status: **CONDITIONAL PASS**. 34 of 40 current critical findings were fixed. 6 remain open, listed in section N.

## A. Scope
Least-privilege fix for critical (error-level) security findings, plus the AML fact-source selector, which now stays locked until its permitted sources load. No AML business logic, FSRA policy, protected assessments (00830/00836/00838), `STR_SAR_GOVERNANCE`, or draft TEST package `28123d19-…` were changed. No external communications were sent.

## B. Count reconciliation (60 → 42 → 40 → 6)
- **60**: count of `level=error` rows in the stored scan dated 2026-09-11 (`up_to_date:false`), counted row by row.
- **42**: count shown in the Security view after automatic re-triage. The scanner itself moved rows between levels (`triage_state` carried or fresh). For example, `authorization_*` and `roles` moved down, and `decision_options` and `business_calendar_process_assignments` moved up.
- **40**: count of `level=error` rows in a fresh full scan run before any changes. This is the authoritative starting inventory.
- **6**: count after this package's changes, from a fresh scan (counts_by_level error=6, warn=56, info=33).

## C. Classification key
C1 = internal configuration, RBAC, or methodology data that all signed-in users could read. C2 = edit check never applied. C3 = file storage not tied to the owner. C4 = public data, read-only by design. C5 = not reachable (no access grant). C6 = needs a server-side redesign.

## D. Inventory (fresh pre-change scan, 40 rows)
| # | Object | Class | Action | Result |
|---|---|---|---|---|
| 1–37 | appeal_panel_scopes, business_calendar_process_assignments, classification_change_log, decision_options, decision_rationale_templates, document_retention_policies, entity_membership_role_permissions, fp_committee_members, fp_committees, identity_capability_register, identity_data_remediation_register, permission_module_routes, permissions, rbac_module_scopes, regulatory_profiles*, return_due_dates, review_narrative_fields, review_role_display_settings, review_step_permissions, role_permissions, sec_anon_execute_allowlist, sec_legacy_permission_map, sec_module_scopes, sec_permission_dependencies, sec_permissions, sec_routes, sla_process_team_leads, subject_forms*, sufficiency_rule_set_items, supervisory_domain_authority, supervisory_methodology_fact_requirement, _parameter, _question_fact, _reference_decision, _semantic_profile, supervisory_rating_scale | C1 (*was also readable without signing in) | The everyone-can-read rule was replaced with `sec_crit01_internal_read` (super admin or internal staff only). Sign-out read access was removed. | Fixed |
| 38 | entity_relationships | C5/C1 | Same replacement | Fixed |
| 39 | reports, edit rule | C2 | The edit check now applies the same rule as the existing-record check | Fixed |
| 40 | storage: "Authenticated read registration uploads" | C3 | Signed-in users can now read only registration files they uploaded (`owner_id = auth.uid()`). Reviewers keep access through the existing permission-checked `secure_documents_read` rule. | Fixed |
| — | storage: "Allow anon read registration uploads" | C6 | Not changed. See N. | Open |

## E. Data affected
Configuration, RBAC catalogue, and methodology tables. None hold personal data, except committee member lists (`fp_committee_members`), staff assignments (`sla_process_team_leads`), and registration files.

## F. Who reads this data
Every browser reader is on an internal or admin screen (search for `.from('<table>')`). Edge functions use the service role and are unaffected. Methodology data is read through internal-only routines that run with the caller's own permissions. `sec_get_user_context` is a privileged (`SECURITY DEFINER`) routine, so it is unaffected. The legacy permission fallback returns nothing for external users before it ever reads `permissions`.

## G. Access by persona
- Internal staff (`is_internal_staff`) and super admin: read access unchanged.
- External users (applicant, pre-licensee, licensee): no browser screen reads these tables. The internal-only check returns false for them.
- Signed-out visitors: read access removed from all 37 tables.

## H. Grants and RLS
Grants were removed only where an everyone-can-read rule was replaced (signed-out read). No access was broadly granted or broadly revoked.

## I. SECURITY DEFINER routines
None changed. The linter baseline stays at 1,796 findings, with no new findings.

## J. AML fact-source fix
`AmlFactRegisterPanel` now opens the editable fact form only after the configuration authority has loaded. While it loads, or if loading fails, the dialog shows a disabled source field and explains the situation. The free-text fallback can no longer appear in these states.

## K. Tests
- Regression test `src/test/secCrit01Policies.test.ts` added.
- The UI-EFR fact tests now wait for the governed form, as a real user would.
- Full app suite before the final fixes: 1759/1762. All 3 failures came from this change and were fixed. The affected files now pass 29/29.
- The full browser suite was **not re-run** in this package.

## L. Rescan
After the changes: 6 critical findings (see N).

## M. Protected data
Protected assessments, FSRA policy, and the draft TEST package were not modified.

## N. Residual critical findings (6)
1–3. `authorization_classes`, `authorization_class_activities`, `authorization_schemes`: anyone can read them, including signed-out visitors. They may feed public registration, and that has not been confirmed. Next step: map who reads them before restricting.
4. `identity_governed_tables`: signed-in read. Not yet analysed.
5. `roles`: signed-in read. Role names are used by the user's own security context and by admin screens. Restricting this needs a consumer-by-consumer review.
6. Storage "Allow anon read registration uploads" (C6): registration happens before sign-in, so files cannot be tied to an owner. The fix is to serve previews through a server-side signed link checked against the registration token, then drop this rule.

## O. Publish
**Not published.** Wait until the browser suite is re-run and residuals 1–6 are decided.

## P. Limitations
No browser persona sweep (external user and unrelated staff) was run against the live preview. Persona denial is shown here by checking the access-rule logic only.

## Q. Verdict
CONDITIONAL PASS: 34 of 40 critical findings fixed, 6 documented with next steps, not published.

---

# SEC-CRIT-01A — residual closure (in progress)

## R. Residual closure
A fresh scan before any changes returned **8** critical findings, not 6. The 6 expected ones were there, plus `return_validation_rules` and `return_validation_rule_versions`, which the scanner had moved up from warning. All 8 are now fixed (migrations "SEC-CRIT-01A" waves 1–2).

After each fix, the scanner moves more existing warning-level "any signed-in user can read every record" findings up to critical. Total findings fell 134 → 95 → 87 → 79, but the critical list refills each time:
- scan 3 found 8 more (`app_environment_config`, five `prudential_*` tables, `report_runtime_config`, `risk_ratings`), which were fixed in wave 3;
- scan 4 found 9 more (`otp_verifications`, `permission_actions`, `permission_dependent_actions`, `sec_modules`, `sec_navigation_items`, `sec_scope_types`, `sla_configurations`, `sla_escalation_tiers`, `supervisory_assessment_programme_vocabulary`), which are **not yet analysed**.

## S. Authorization catalogues
- **Consumers:** the only reader is `useClassificationTree`, which is used only by the internal admin tabs ClassificationStructureTab and AuthorizationSchemesTab. Public registration does not read these tables. The writing routines are privileged (`SECURITY DEFINER`) and unaffected.
- **Data:** the tables hold schemes, legal basis, customer restriction, market scope, status and effective dates. These are classified as INTERNAL_CONFIGURATION.
- **New access:** super admin or internal staff only. Signed-out read access was revoked. A signed-out read now returns error 42501.

## T. identity_governed_tables
The table describes the security-governance strategy (canonical write paths, justifications for signed-out and signed-in access) and has no browser consumer. Read access is now super admin only. A signed-out read returns 42501.

## U. roles
- **Consumers:**
  - the sign-in display name (`authHelpers`), which resolves the user's own roles;
  - PPOC mapping, the return workflow panel, the rule editor and role admin, all internal.
- **New model:**
  - super admin and internal staff can read the full catalogue, which these internal screens genuinely need;
  - every other signed-in user can read only their own assigned role rows, through `sec_own_role_ids()` (no arguments, uses `auth.uid()`);
  - signed-out visitors have no access.
- **New linter warning:** `sec_own_role_ids()` adds 1 new "signed-in users can execute" warning. It is accepted: the function is a policy helper that returns only the caller's own role IDs.

## V. Secure pre-registration file architecture
No pre-login capability existed. The OTP flow proves only the email address and returns no token. A new capability was added:

```text
Browser -> registration-file-access{issue}
        -> 32-byte secret (only its SHA-256 hash is stored, in registration_upload_capabilities, service_role only, 30-day expiry, revocable)
Upload  -> registrations/<capability_id>/...
Preview -> registration-file-access{sign, capability_id, secret, path}
        -> server checks the hash, expiry and revocation, and that the path sits inside the capability's own folder (no "..", no "//")
        -> 300-second signed URL for that single object
```

- The storage rule "Allow anon read registration uploads" was **removed**.
- Signed-in owners use the owner-scoped rule from SEC-CRIT-01. Reviewers use the existing `secure_documents_read` rule.
- Client code: `src/lib/registrationFileAccess.ts`, the DocumentsStep and RegistrationStepRenderer (signature) uploads and previews, and the AttachmentDisplay fallback.
- **Residual:** files uploaded before this change, under `registrations/<random>/`, can no longer be previewed by a signed-out visitor. They remain available to reviewers.

## W. Registration attack tests (direct calls, negative only)

| Attempt | Result |
|---|---|
| No token | `capability_invalid` |
| Invalid token | `capability_invalid` |
| Wrong secret for a real capability | `capability_invalid` |
| Token A requesting B's path | `path_not_owned` |
| `..` traversal | `path_not_owned` |
| Legacy path | `path_not_owned` |
| Signed-out raw storage sign | 403 |
| Signed-out bucket list | 403 |

Not yet run: the signed-in unrelated user test and the reviewer browser test.

## X. Persona/browser matrix
Signed-out REST reads were tested on the 5 tables: all were refused. The browser persona sweep is **not yet run**.

## Y. Full application regression
1764/1764 passed, 182 files, 0 skipped (after waves 1–2, before wave 3). Not rerun after wave 3.

## Z / AA. Browser and AML regression
**Not yet run.**

**Positive registration upload journey: BLOCKED.** The registration form places Email Verification (step 3) before Supporting Documents (step 4), and passing it sends a real verification email. That is an external communication, which this package forbids.

## AB. Security scan
40 → 6 (SEC-CRIT-01) → 8 (fresh scan) → 0 of those 8 remain → 8 promoted, fixed → 9 promoted, open.

## AC. Publish
Not published.

## AE. Verdict (interim)
**CONDITIONAL PASS / BLOCKED.** The original 6 residuals, plus 10 more promoted findings, are fixed. Still open:
- the positive browser upload journey (blocked by the verification email);
- the 9 newly promoted findings;
- persona, browser and AML regression;
- publish.

---

## SEC-CRIT-01A — Closure update (supersedes interim status above)

**Fresh scan:** 0 critical (59 total: 30 warn, 29 info). The scanner raised lower-severity findings to critical after each wave (40 → 8 → 8 → 9 → 11 → 0). Every raised finding was fixed using the same method: find who uses the table in the code, then restrict access.

**Wave 5 (final):**
- Return configuration (`return_configs`, `return_config_forms`, `return_form_validation_rules`): internal staff can read them. Licensee users can read only rows for a sector entity they can access or for a return they can read (`sec_external_return_config_visible`, `sec_external_return_form_visible`). This keeps licensee filing working.
- Internal-only reads: `fp_screening_configs`, `fp_screening_execution_rules`, `fp_sector_decision_rules`, `group_ewi_rules`, `license_action_form_configs`, `license_lifecycle_configs`, `notification_templates`, `permission_modules`. All browser screens that read these are internal. Edge functions use the service role.
- Linter: the three new helpers (`sec_own_role_ids`, two return-visibility helpers) add "signed-in users can execute SECURITY DEFINER" warnings. This is intentional: each helper is scoped to the caller through `auth.uid()` and returns only a yes/no answer or the caller's own role IDs.

**Regression:** Vitest 1764/1764 (182 files). Full Playwright: 77 passed, 2 failed. The 2 failures are the known Complaints and Inspection process-surface tests (P09/P10). AML specs, including 12, passed.

**Open / blocked:**
- Positive browser proof of a public pre-registration upload and preview is BLOCKED. The documents step comes after email OTP verification, which sends a real email, and external communications are prohibited. Negative tests passed: missing or invalid token, wrong secret, cross-capability path, traversal, and raw storage access.
- The upload capability is bound to a random folder, not yet to a specific registration record. This is a design gap against the brief.
- ~~No migration files were written to the repository.~~ **Corrected in SEC-CRIT-01B (AJ):** this statement was wrong. Six SEC-CRIT-01/01A migration files are in source control (`20261005145627`…`20261005152712`).
- Not published. Publishing waits for the registration proof above.

**Status:** CONDITIONAL PASS (security gate met; positive registration journey and publishing still open).

### SEC-CRIT-01A — Positive registration journey (browser, completed)
- With the user's approval, one verification email was sent to the user's test inbox (`rohit+seccrit01a@mishainfotech.com`; the base address was already registered). The user provided the code, and it was entered in the real wizard.
- Upload: the TEST PDF was uploaded on the Supporting Documents step, and the success toast was shown. It was stored under the capability folder `registrations/<capability_id>/…`.
- Preview: clicking **View** called the access function (HTTP 200), which returned a short-lived signed link for that single file. The capability persisted after reload.
- A second run reused the already-verified email, so no additional email was sent. Total external communications: 1, authorised by the user.
- Remaining design gap: the capability is still bound to a folder, not to the final registration record.

### SEC-CRIT-01A — Publish
- Publish requested for https://olras.mishainfotech.com. Home and /register/applicant both returned HTTP 200 about 1 minute later.
- The publish gate warned about 60 critical findings, taken from the older saved scan state. The latest fresh scan shows 0 critical findings. The saved findings have not been marked as fixed yet.
- No AML-CLOSE-06 work was started.

---

# SEC-CRIT-01B — Registration-Bound Upload Capability, Migration Source Parity & Final Security Closure

Baseline HEAD `5131cb6d0` ("Fixed upload redirect logic"). Scope: SEC-CRIT-01B only. AML-CLOSE-06 not started. No AML/FSRA/protected record changed. No email or other external communication sent (the registration OTP verified in 01A for the one user-authorised plus-alias was reused).

## AF. Lifecycle finding
Registration rows (`registrations`) are created only at final submission (`register-pre-licensee`), after documents are uploaded. The only durable pre-registration identity is the verified registration OTP (`otp_verifications`, email + purpose). Binding therefore happens in two stages:
1. **Journey binding** — `registration-file-access` `issue` requires a verified registration OTP for the email; the capability is stored `BOUND_JOURNEY` with `journey_email` + `otp_verification_id`.
2. **Registration binding** — on final submit, `register-pre-licensee` calls service-role-only `registration_upload_capability_bind(capability, secret_hash, registration_id)` which checks secret, active state, journey state and email match, locks the row, binds once (`BOUND_REGISTRATION`) and stamps every file row with the registration id.

## AG. Durable file ownership
`registration_upload_files` (capability_id, object_path UNIQUE, registration_id). Every successful browser upload calls `record`; `sign` issues a URL only for a path that is in this register for the presenting capability. Guards: `ruc_guard_binding` (no rebind / change of registration), `ruf_guard` (path and owner immutable, no un-binding).

## AH. Rebind / cross-registration proof (negative, direct calls — permitted by brief)
| Attempt | Result |
|---|---|
| capability A + file A | SIGNED |
| capability A + file B / B + A | `path_not_owned` |
| path traversal / rewritten folder | `path_not_owned` |
| bound capability + wrong registration id | `registration_mismatch` |
| missing secret | `capability_invalid` |
| issue for unverified email | `journey_not_verified` |
| bind RPC unauthenticated | HTTP 401 |
| SQL: change bound registration | `CAPABILITY_ALREADY_BOUND` |
| SQL: unbind file / change path | `FILE_ALREADY_BOUND` / `FILE_OWNERSHIP_IMMUTABLE` |
| anon read of file register | empty (RLS) |

Honesty note: the two fixtures used for the cross-capability matrix were created with direct function/storage calls (negative-test setup, registration security, not AML).

## AI. Normal-browser positive journey
Public `/register` journey: upload PDF → View → signed URL returned HTTP 200 `%PDF-1.4`; repeated after page reload (200). Submitted → `REG-2026-000196`, `upload_binding: BOUND`. Read-only SQL confirmed registration → capability `f7edd71f…` (`BOUND_REGISTRATION`) → file row with matching registration id. Record preserved as TEST evidence; not re-run.

## AJ. Reviewer / applicant / unrelated access — new defect found and fixed
Persona proof via real login UI on `/admin/registration-review/<id>`:
- **Before fix:** `applicant_user` and `entity_ppoc` could sign the registration file (HTTP 200). Cause: `secure_documents_read` granted any holder of `application_management.view` (held by external users for their own applications) read on the whole bucket, including every `registrations/` upload.
- **Fix** (migration `20261005164141`): the broad permission branch no longer applies to `registrations/` unless `is_internal_staff`. Other folders unchanged.
- **After fix:** licensing_officer document listed, sign 200; applicant_user 400; entity_ppoc 400. Owner (REG-2026-000196 user) RLS read = 1 row; another registrant = 0.
- Residual (not changed, out of scope, flagged): the same broad branch still lets external holders of those permissions read other users' *non-registration* folders in `secure-documents`. Recommend a scoped follow-up.

## AK. Legacy files
85 objects under `registrations/`; those without a register row (≈74 at inspection) are classified **LEGACY_UNBOUND**: no ownership fabricated; readable only by internal staff/super admin; no capability can sign them.

## AL. Migration source parity
Source now holds all SEC-CRIT migrations: six 01/01A files (correcting the 01A report's false "no migration files" statement — see note above) plus `20261005162840` (01B binding) and `20261005164141` (storage read fix). Static drift check: all 74 live `sec_crit01*`/registration policies and all 7 helper/guard functions are present in source — 0 missing.

## AM. Reproducibility
Replay in a rolled-back transaction was refused by the sandbox role (`must be owner of …`) — no clean-database replay was possible here. Status: **STATIC PARITY PROVEN; CLEAN REPLAY NOT EXECUTED**.

## AN. Helpers
`sec_registration_file_owned` (SECURITY DEFINER, `search_path=public`, PUBLIC/anon revoked, uses `auth.uid()`, required by storage RLS) — the only new linter warning; safe by design. Binder is service-role only.

## AO. Tests
- Vitest: 182 files, 1764/1764 (incl. new `secCrit01bRegistrationBinding.test.ts`, 3 tests).
- Playwright full: 68 passed / 4 failed — Complaints and Inspection surfaces (known baseline); AML specs 12-B and 13-A timed out on the entity picker. Isolated rerun of 12/13 with fresh browser fixture: 5/5 passed.

## AP. Fresh security scan
0 critical; 59 findings (25 warn, 34 info). Note: the publish gate reported 60 "critical" items from persisted earlier-scan state; the fresh scan listing does not classify these as critical. To reconcile in the security view.

## AQ. Publish & live smoke
Publish requested to `olras.mishainfotech.com`. Live `/`, `/register`, `/login` returned HTTP 200 with the app title.

## AR. Open items
1. Clean-database migration replay (needs an owner-privileged environment).
2. Broad non-registration `secure-documents` read for external permission holders (AJ residual).
3. If binding fails at submit, the registration is still created and `upload_binding` reports the error (not rolled back) — policy decision needed.
4. Capability issue accepts any previously verified registration OTP for the email (no OTP age limit); capability expiry 30 days.
5. Persisted-scan vs fresh-scan critical count reconciliation.

## AS. Verdict
**CONDITIONAL PASS.** Upload capability is bound to the verified journey and then once to the final registration; rebind and cross-registration access are refused; a real cross-applicant registration-file exposure was found and closed. Conditions: items AR-1…AR-5.

### Final questions for the owner
- Should submission fail (instead of completing) when upload binding fails?
- Should capability issue require an OTP verified within a fixed window (e.g. 24 h)?
- Approve a follow-up to scope external reads of other `secure-documents` folders?

---

# SEC-CRIT-01C — Final Integrity Closure

## AT. Owner decisions (applied)
- If uploaded evidence can't be bound, the submission is blocked.
- A new upload capability needs an email verification from the last 24 hours.
- Cross-user access to non-registration documents has been fixed.

## AU. Atomic submission design
Migrations `20261005180108` and `20261005180141`.
- `register-pre-licensee` runs `registration_evidence_check` before it creates the account. This check finds every `registrations/...` path in the submitted documents and form data. Each path must be in `registration_upload_files` for the capability that is presented. If any paths are present, the capability must have a valid secret, be `BOUND_JOURNEY`, be unexpired and unrevoked, and match the journey email.
- The registration insert carries `upload_capability_id` and a one-time proof hash.
  - BEFORE INSERT `registrations_evidence_guard` runs the same check again and clears the proof, so the proof is never stored.
  - AFTER INSERT `registrations_evidence_bind` binds the capability and all its file rows.
  - Both run in the insert's own transaction. Any failure raises an error and rolls back the registration and its workflow-start trigger.
- If the insert fails, the newly created account is deleted and the applicant sees a clear error ("…documents could not be linked…, so it was not submitted"). The form and its uploads are kept, so a retry needs no re-upload.
- `registrations_capability_immutable` stops `upload_capability_id` from being changed after the insert.
- Registrations with no uploaded evidence and no capability go through (`OK_NO_EVIDENCE`). A stale capability with no files does not block submission.
- Credentials (`password` keys) are now removed from `entity_specific_data` before it is stored.

## AV. Binding failure / retry tests
These ran inside rolled-back transactions, so no records were kept.

| Case | Result |
|---|---|
| evidence present, no capability | `EVIDENCE_CAPABILITY_REQUIRED` |
| wrong secret | `CAPABILITY_INVALID` |
| different email | `JOURNEY_MISMATCH` |
| another registration's file | `EVIDENCE_NOT_OWNED` |
| capability already bound (REG-2026-000196) | `CAPABILITY_ALREADY_BOUND` |
| insert with bad proof | whole insert refused; capability stays `BOUND_JOURNEY` and can be retried |
| valid insert | `BOUND_REGISTRATION`; capability and file both point to the new registration; proof column NULL |
| change capability afterwards | `CAPABILITY_ALREADY_BOUND` |

- A second bind of the same capability is refused.
- A duplicate registration is blocked by the existing email/user uniqueness rules.
- A file can't get a second binding row because `object_path` is UNIQUE.

## AW. OTP freshness
- The `ruc_guard_issue` trigger is enforced in the database. The function also returns `verification_expired`, which the browser shows in plain language.
- A controlled TEST OTP verified 25 hours earlier was refused with `VERIFICATION_EXPIRED`. After the TEST OTP was moved to 1 hour old, issue succeeded. Only TEST OTP rows were changed, and the transaction was rolled back.
- Trying to issue for a different email on the same OTP was refused with `JOURNEY_NOT_VERIFIED`. Changing the email therefore needs a new verification.
- An existing capability stayed usable after its OTP aged to 30 hours.
- Browser coverage: issue with a fresh verification and reuse after reload were proved in 01B. These were not re-run because a new OTP would mean sending a real email, which is not authorized.

## AX. Document authorization model
`secure_documents_read` is now `sec_secure_document_readable(name)`. This is SECURITY DEFINER and uses `auth.uid()` only. The rules, in order:
1. A super admin can read.
2. The uploader can read their own `<uid>/…` folder.
3. Internal staff can read with existing module authority. This is unchanged from before, so staff are not global readers beyond those modules.
4. Registration files are read by the registrant through the owner policy, or by internal staff.
5. Other external users can read only through metadata (`file_uploads` application, checked with `external_can_access_application`), or by membership in the same entity as the uploader (`external_user_entity_ids`).

Folder types found: application, complaint, form-files, form-management (application/return form uploads), rfi, public, registrations.

## AY. Cross-user negative matrix
Checked as the signed-in persona; 1 = can read, 0 = refused.

| Family | owner | applicant | lic. primary | lic. secondary | PPOC |
|---|---|---|---|---|---|
| application, complaint, form-files, form-management, rfi | 1 | 0 | 0 | 0 | 0 |

- Signed-out users: the database view returns 0 rows, a raw GET returns 400, and a list returns `[]`.
- In the browser, for REG-2026-000196: licensing_officer could sign and got `%PDF-1.4`. applicant_user, entity_ppoc and licensee_primary got 400.
- Legacy unbound registration files are unchanged: staff only.

## AZ. Positive access matrix
- Uploaders can read their own files, in every folder type.
- The REG-2026-000196 registrant can read their own file.
- The licensing officer and returns officer can read within their modules.
- A same-entity colleague (licensee_secondary) can read a licensee_primary filing path. PPOC (a different entity) and the applicant were refused.

## BA. Migration / source parity
- Both 01C migrations are in `supabase/migrations/`.
- All 6 new functions, 4 triggers and the live policy text match the source.
- **CLEAN REPLAY = NOT EXECUTED — ENVIRONMENT PRIVILEGE LIMITATION.**

## BB. Security scan reconciliation
- Fresh scan: **0 critical**, 28 warn, 31 info.
- The publish gate still reports "60 critical". These come from stale persisted state left over from earlier scans; the current scan does not classify any of them as critical. No working rule was changed to bring that number down.
- `sec_secure_document_readable` and `sec_registration_file_owned` are **SAFE BY DESIGN — LOW-LEVEL STATIC WARNING**:
  - executable only by signed-in users;
  - use `auth.uid()` only;
  - return a single boolean.

## BC. Regression
- Vitest: 183 files, 1767/1767 passed.
- Playwright full run: 73 passed, 6 failed.
  - Complaints and Inspection: known baseline failures.
  - `09` AML reload: an option-picker timeout. It was skipped in the isolated rerun because it needs its own fixture, so it is **unconfirmed**.
  - Returns surface and applicant boundary: both passed in isolation.
  - licensee_primary boundary: still failed in isolation. A different route was flagged each time (`/prudential/work`, then `/licensing/entity-resolution`). The screenshot shows only the empty loading frame while the access check is still running; no data is shown. This is classed as a timing flake in the test's detection and was **not fixed** here.
- AML specs 12 and 13: 5/5 passed in the 01B isolated rerun. In this full run they passed.

## BD. Publish / live smoke
- Publishing was requested for `olras.mishainfotech.com`.
- `/`, `/register` and `/login` return 200.
- Not repeated on the live site: a full submission, upload preview and own-document access. These would create real records and send an OTP email.

## BE. Final verdict
- Protected AML records are unchanged: 00830 (approved, HIGH, 2026-09-12), 00836 (draft), 00838 (draft).
- FSRA policy, `STR_SAR_GOVERNANCE` and the AML evidence were not touched.

**SEC-CRIT-01 = CONDITIONAL PASS.** All technical controls are in place and proved. It cannot be marked PASS yet for these reasons:
1. PASS criterion 13 is not fully met: the licensee_primary route-boundary flake and the unconfirmed AML `09` reload journey are still open.
2. No browser end-to-end submission was run with a fresh OTP, because sending one is a real external email.
3. 5 existing registration records still contain a plaintext `password` in `entity_specific_data`. These existing records were left unchanged pending owner approval.

# FINAL QUESTIONS
- Can a new upload capability be issued from a verification older than 24 hours? **NO**
- Does an already-valid capability keep working after its OTP is older than 24 hours? **YES**
- Can Applicant A read Applicant B's non-registration documents? **NO**
- Can Entity A read Entity B's return documents without authority? **NO**
- Can legitimate external users still read their own permitted documents? **YES**
- Can authorised internal reviewers still read the right documents? **YES**
- Does the fresh scan show 0 critical? **YES**
- Are all database changes in source-control migrations? **YES**
- Do the AML-CLOSE-05A controls stay green? **YES** (specs 12 and 13 pass; the `09` reload is unconfirmed)

# SEC-CRIT-01D — Legacy Credential Purge & Final Certification

## BF. Historical credential inventory
Five registration rows held `password` and `confirm_password` keys at the top level of `entity_specific_data`. None were nested, and none held `confirmPassword`. Values were never printed.

| Reference | Account type | Keys | Status |
|---|---|---|---|
| REG-2026-000188 | TEST (disposable test-email domain) | password, confirm_password | removed |
| REG-2026-000049 | TEST (disposable test-email domain) | password, confirm_password | removed |
| REG-2026-000050 | TEST (disposable test-email domain) | password, confirm_password | removed |
| REG-2026-000051 | owner-domain account (treated as potentially genuine) | password, confirm_password | removed |
| REG-2026-000196 | owner-domain account (treated as potentially genuine) | password, confirm_password | removed |

## BG. Plaintext credential remediation
Migration `20261005185918_*` removes the three keys completely using JSON key removal. It does not blank or mask them, and it keeps every other field.

Registration triggers were turned off only for the duration of that single update, so no workflow or notification fired.

A purpose-built log, `sec_credential_sanitisation_log`, has one row per record. Each row holds only the reference, the field names removed, the actor, the reason and a timestamp. No earlier values are stored. Only super admins can read it.

Result after cleanup: **0** registration rows with credential keys.

## BH. Wider credential-copy search
All 464 JSON columns in public tables were searched for the keys `password`, `confirm_password` and `confirmPassword`. Only counts and record IDs were collected.

- The only registration-derived hits were the five rows above.
- `site_settings.email_sms_settings` and two `config_change_log` rows hold the SMTP/SMS provider credential configuration. This is an administrator setting, not a registration credential, and is out of scope here. It is recorded for owner follow-up.
- No hits in workflow, audit, journey or form-submission tables.

## BI. Recurrence-prevention guard
The trigger `registrations_no_credentials` runs before insert, or before an update of `entity_specific_data`. It fails closed with `CREDENTIAL_FIELD_FORBIDDEN` when any of the three exact keys is present.

The rule matches exact key names, so unrelated fields that merely contain the word "password" are not blocked. The function is not executable by `anon` or `authenticated`.

The `register-pre-licensee` function still strips these keys before saving. The password goes only to the authentication service.

Automated test: `src/test/secCrit01dCredentialGuard.test.ts`.

## BJ. Genuine-vs-TEST account treatment
None of the five accounts has a `profiles` row; all are pre-licence users. The only password-change flag (`profiles.force_password_change`) therefore does not apply. No approved session-revocation mechanism exists for these accounts.

No reset email was sent. Owner action: for REG-2026-000051 and REG-2026-000196, decide whether to issue a governed password reset or deactivate the accounts.

The stored values were never compared against the real authentication credential.

## BK. Licensee boundary-test root cause
**Root cause:** `probeRoute` waited a fixed 2.5 seconds and then classified whatever was on screen. The route-guard loading screen contains none of the denial words, so a still-loading page was counted as rendered, meaning a "leak".

**Fix:**
- The loading screen now carries `data-route-state="loading"` and the Access Denied screen carries `data-route-state="denied"`.
- The probe polls until it sees an explicit outcome: redirect, denied, 404, or content that has been stable for 1.5 seconds with no loading screen.
- A page that never resolves is reported as UNRESOLVED and kept separate from leaks.

No application authorization defect was found.

**Result:** 25/25 passes (`--repeat-each=5`), then green in the full suite.

## BL. AML 09 reload certification
Spec 09 already sits in the `aml` project, which depends on the browser-created `aml-fixture-setup` / teardown. The earlier failure came from running it with a `-g` filter outside that project, so the fixture was not created.

Isolated run (`--project=aml 09-…`): 8/8 passed. This covered setup, creating the assessment, loading the configuration, failing closed on missing facts, answering questions, calculating, the reload that keeps MODERATE and the factor decisions, the security proofs, and teardown that retired the TEST package. No assessment data was created through API calls.

## BM. Security scan
Fresh scan: **0 critical, 31 warn, 28 info**.

The publish gate still reports 60 critical findings. That figure comes from the saved `lov_pgscan` state of 2026-09-11 (`up_to_date:false`), not from current exposure. The findings cannot be marked fixed through the tooling because the fresh scan does not carry them.

## BN. Full app/browser regressions
- Vitest: 184 files, **1770/1770** passed, 0 failed, 0 skipped. Type check clean.
- Playwright full run: **77 passed, 2 failed**. The two failures are Complaints and Inspection, unchanged from before.
- Green: licensee boundary, AML 09–13, registration security, document isolation, AML judgement.

## BO. Migration/source parity
The cleanup, the log table and the guard trigger are all in `supabase/migrations/20261005185918_*`. The 01C trigger-function revokes are in `20261005180141_*`, and the live database confirms `anon` and `authenticated` cannot execute them. The live trigger `registrations_no_credentials` is enabled.

Clean-database replay: NOT EXECUTED — ENVIRONMENT PRIVILEGE LIMITATION.

## BP. Publish result
Publishing to olras.mishainfotech.com was requested. Live smoke: the routes listed below returned HTTP 200. The registration browser journey was not re-run because it would require sending a new OTP email, which is not authorized.

Protected AML records are unchanged: 00830 approved (2026-09-12), 00836 draft (2026-09-28), 00838 draft (2026-10-03). FSRA and STR_SAR_GOVERNANCE were not touched.

## BQ. Final verdict
**SEC-CRIT-01 = PASS** — Critical security remediation is TECHNICALLY CLOSED. The remaining items are owner decisions and do not block this verdict: the two genuine-account credential resets, the SMTP credential configuration, and a browser registration re-run when an OTP email is authorized.

### Final questions
- Are any plaintext registration passwords still stored? **NO**
- Can new registration data persist password / confirm_password / confirmPassword? **NO**
- Were plaintext credentials written into cleanup audit? **NO**
- Were genuine accounts handled as potentially compromised? **YES**, flagged for an owner-governed reset. No platform flag applies to these accounts and no email was sent.
- Does the boundary test distinguish loading from unauthorized access? **YES**
- Does AML spec 09 complete its reload journey? **YES**
- Does the fresh scan show zero critical? **YES**
- Are all security/database changes in source control? **YES**
- Do AML-CLOSE-05A controls remain green? **YES**
