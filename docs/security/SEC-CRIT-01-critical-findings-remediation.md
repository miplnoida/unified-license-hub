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
- No migration files were written to the repository. The changes were applied directly through the migration tool.
- Not published. Publishing waits for the registration proof above.

**Status:** CONDITIONAL PASS (security gate met; positive registration journey and publishing still open).
