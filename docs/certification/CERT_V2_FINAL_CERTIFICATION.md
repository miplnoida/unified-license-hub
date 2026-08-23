# Enterprise SupTech Certification V2 — Final Certification Report

Run mode: real users, real routes/APIs, real governed RPCs against the seeded
Certification Dataset V2 supervisory universe. No mocked data, no faked email
delivery, no bypassed authorisation.

## Package results (final replay)

| Package | Domain | Result |
| --- | --- | --- |
| P01 | Registration & onboarding | PASS |
| P02 | Entity resolution & membership | PASS |
| P03 | Licensing & authorisation (intake → decision) | PASS |
| P04 | Licence lifecycle (renewal, variation, suspension, surrender) | PASS |
| P05 | Fit & proper | PASS (34/34) |
| P06 | Returns (prepare → submit → review → correction) | PASS (30/30) |
| P07 | Prudential supervision | PASS (16/16) |
| P08 | Complaints & conduct | PASS (30/30) |
| P09 | Thematic review | PASS (23/23) |
| P10 | Onsite examination | PASS (43/43) |
| P11 | Enforcement | PASS (26/26) |
| P12 | Correspondence & notifications | PASS (16/16) |
| P13 | Supervisory intelligence | PASS (8/8) |
| P14 | Configuration & form version pinning | PASS (18/18) |
| P15 | Platform operations | PASS (24/24) |

## Control totals

| Control | Value |
| --- | --- |
| CROSS_ENTITY_LEAKS | 0 |
| VISIBILITY_LEAKS | 0 |
| CORRESPONDENCE_VISIBILITY_LEAKS | 0 |
| SELF_APPROVAL_SUCCESSES | 0 |
| SECONDARY_UNAUTHORIZED_SUBMISSIONS | 0 |
| DUPLICATE_NOTIFICATION_EVENTS | 0 |
| WRONG_RECIPIENT_NOTIFICATIONS | 0 |
| IN_FLIGHT_VERSION_CHANGED | 0 |
| AUDITOR_WRITE_SUCCESSES | 0 |
| BREAK_GLASS_IS_BYPASS | YES (designated account only) |
| NORMAL_ADMIN_BUSINESS_BYPASS | NO |
| SMTP_CONFIGURED | true |

## Defects found and remediated in this run

| Gap | Severity | Finding | Remediation |
| --- | --- | --- | --- |
| GAP-P14-001 | P1 | An in-flight case was re-pinned when its pinned form version was archived. | Version resolution now keeps archived pins stable for in-flight cases; the repin reason is a governed value. |
| GAP-P15-001 | P1 | The standard "System Administrator" role mirrored to the unrestricted super-administrator system role, granting a blanket business-decision bypass (it could close an enforcement case with no enforcement authority). | The role now maps to a normal administrator; the unrestricted bypass is reserved for the designated break-glass account. Form publish/retire authority was granted explicitly instead of inherited. |
| GAP-P15-002 | P2 | The compliance audit trail was unreachable through the API (no table privileges), so auditors could not read audit evidence. | Read privileges granted; row-level access rules unchanged. |
| GAP-P15-003 | P1 | Governed role assignment failed whenever the assigned role existed only in the canonical security model (legacy profile mirror was foreign-key bound). | The legacy mirror is now written only when a legacy counterpart exists; clearing all roles also clears the legacy mirror. |
| GAP-P15-004 | P1 | An assigned-scope prudential analyst could never open an assessment or issue a supervisory action, because assignment was proven only through pre-existing action records. | Supervision assignment on the institution (or a named supervisory officer on it) now proves assigned scope. |

Side effects of negative-control tests (one enforcement case closed via the
bypass defect) were reverted, and the certification universe was replayed in full
after remediation.

## Platform operations evidence (P15)

- Break-glass: single canonical active `super_admin` assignment on the
  designated account; bypass principal confirmed; reaches all representative
  protected admin and business modules.
- Normal administrator: not a bypass principal; enforcement business decision
  refused; holds no `decide` authority.
- Maker/checker: the referring/proposing officer role cannot decide.
- Auditor: reads all required audit and supervisory evidence; zero successful
  governed writes across record creation, direct mutation and workflow RPCs.
- User/role management: assignment and revocation through
  `sec_assign_user_roles`, permission and navigation effects observed by the
  user themselves, and both changes written to the audit log.
- Forgot password: real Auth recovery accepted for a real account and
  account-enumeration safe for unknown addresses.

## Certification statement

All fifteen process packages replay green against the deterministic
certification universe with zero cross-entity leakage, zero self-approval, zero
duplicate or misdirected notifications and zero unauthorised writes.

**CERTIFICATION V2 STATUS: PASS.**
