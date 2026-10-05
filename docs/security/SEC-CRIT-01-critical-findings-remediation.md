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
