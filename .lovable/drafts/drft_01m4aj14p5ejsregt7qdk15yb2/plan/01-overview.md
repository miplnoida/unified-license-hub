# Fix plan for the security workbook — app and server-function changes only

## Scope
The workbook lists 59 risks (4 Critical, 16 High, 28 Medium, 11 Low). This plan fixes those that can be closed **without any database change**. That means changes to screens, browser code, server (edge) functions and libraries only. Changes to tables, access rules, database functions, triggers, grants and seed data are listed as **deferred**. Nothing is removed from the database.

Most Critical and High risks (profile self-editing, payment status, legacy access rules, audit coverage) live in the database, so they cannot be closed here. Where possible, this plan adds a safe app-side mitigation and records what is still open.

## Part A — Fix now (no database change)

| # | Risk | Fix | Verified in code |
|---|---|---|---|
| A1 | RISK-018 Stored XSS in correspondence (High) | Replace the regex cleaner with an allow-list sanitiser (DOMPurify): only the composer's tags (p, br, b, i, u, strong, em, ul, ol, li, a with safe href), no attributes except href/target/rel. Apply the same to the notification template preview, which also renders HTML directly. | Yes: `MessageThreadPanel.tsx` uses a regex and `dangerouslySetInnerHTML`; `TemplatePreviewDialog.tsx` renders raw HTML |
| A2 | RISK-012 `new Function()` in prudential evaluation (High) | Replace with a real arithmetic parser (numbers, + − × ÷, parentheses, unary minus only) shared with `src/lib/safeEval.ts` behaviour. No code execution. | Yes: `evaluate-return-prudential/index.ts` lines 17–25 |
| A3 | RISK-046 Vulnerable xlsx 0.18.5 (Medium) | Upgrade SheetJS to 0.20.3 from the official SheetJS distribution, then re-test template download and Excel import. | Yes: `package.json` |
| A4 | RISK-024 Audit export module filter broken (Medium) | Use the correct column per log: `audit_logs.entity_type`, `compliance_audit_logs.object_type`, `security_event_logs.module`. Date filter uses `created_at`. | Yes: `compliance_audit_logs` has no `table_name` column |
| A5 | RISK-025 Export cut at 20,000 rows and CSV injection (Medium) | Page through all rows in batches of 1,000 with an upper safety limit, and record "truncated" in the job if the limit is hit. Prefix cells starting with `= + - @` or tab with an apostrophe. | Yes: `audit-export/index.ts` |
| A6 | RISK-056 Template placeholders not HTML-escaped (Low) | Escape placeholder values when building HTML emails; plain-text versions stay unescaped. | Placeholder replace found; escaping to confirm while building |
| A7 | RISK-057 CORS allows any lovable.app subdomain (Low) | Default list becomes exact domains: the project's preview, published and custom domain, plus localhost in development. `ALLOWED_ORIGINS` still overrides. Also make `evaluate-return-prudential` use the shared CORS helper instead of `*`. | Yes: `_shared/cors.ts`; prudential function uses `*` |
| A8 | RISK-040 No idle timeout (Medium) | Sign the user out after a period of inactivity (default 30 minutes), with a 2-minute warning dialog. Activity is shared across tabs. | Yes: none in `AuthContext.tsx` |
| A9 | RISK-007 Failed logins not recorded (High, partly) | On a failed sign-in, call the existing security-event logging path (already used for successful logins) with email and reason. No password is logged. If the current grant blocks signed-out callers, route it through an existing public server function instead. | Success is logged; failure path has no logging |
| A10 | RISK-041 OTP rate limit bypassable (Medium) | In `send-registration-otp`, rate-limit by email **and** by caller IP using existing OTP rows (count per window). Never trust client-supplied counters. | To confirm at lines 48–66 |
| A11 | RISK-058 Public registry, no rate limit (Low) | Add per-IP request limiting in memory in the function, and remove internal IDs from the public response where the screen doesn't need them. | To confirm in function |
| A12 | RISK-044 AI redaction inconsistent (Medium) | Add one shared redaction helper (emails, phone numbers, ID and account numbers) and use it in every AI edge function before sending text to the gateway. | To list functions while building |
| A13 | RISK-030 Edge audit writes best-effort (Medium) | For mutating functions, a failed audit write returns an error instead of being ignored; read-only functions stay best-effort. | `_shared/audit.ts` |
| A14 | RISK-053 Delegation elevates to delegator's full role (Low) | When acting on behalf of someone, expose only the delegated scope in the app, not the delegator's full role set. | `authHelpers.ts` lines 105–125 |

Mitigations only (the real fix is in the database):
- **RISK-001/002/013/015**: hide role, user type, licensee, regulator and 2FA fields from every profile edit form, and never send those fields in profile updates. This does not stop a direct API call.
- **RISK-014**: also check the 2FA flag in the route guard on every protected page load, not only at sign-in. This is still enforced in the browser only.

## Part B — Deferred (need database changes, not done)
- **Critical**:
  - RISK-001/002/013/015: lock profile columns; stop deriving staff status and entity membership from profiles.
  - RISK-003/004: real payment gateway with a signed webhook; remove the payer's update right on payments.
- **High**:
  - RISK-005: restrict audit log read to an audit permission.
  - RISK-006: wider audit trigger coverage.
  - RISK-016/017/019/020: retire legacy permissive access rules.
  - RISK-008/009/011: seed missing notification configurations and emit payment.failed.
  - RISK-010: SMS channel. This is a product decision: add a provider or formally de-scope it.
  - RISK-014: server-side 2FA.
- **Medium/Low**:
  - RISK-021 to 023, 026 to 029, 031 to 039, 042, 043, 045, 047 to 052, 054, 055, 059.

Each deferred item will be written up as a ready-to-apply change list when database work is approved.

## Verification
- **Tests**:
  - Sanitiser: script tags, event handlers, `javascript:` links and SVG payloads are stripped; normal formatting survives.
  - Arithmetic parser: valid formulas, division by zero, and rejected input such as `()=>`, `[]` and `!`.
  - CSV formula escaping, idle-timeout timer, and CORS origin matching.
- **Browser checks**:
  - The correspondence thread shows formatted messages correctly.
  - The audit export filter works for each log type.
  - The idle warning appears and signs the user out.
- **Regression**: the full test suite and typecheck pass. Excel template download and import still work after the xlsx upgrade.
- **Records**: update the workbook's "Missing Impl & Risks" status for fixed items (Fixed – pending retest), and save a short summary in `docs/security/`.

## Technical notes
- New dependency: `dompurify`. xlsx is installed from the SheetJS CDN tarball, because the npm registry stops at 0.18.5.
- Edge function changes deploy automatically. No migrations, no `supabase/migrations` files, no grants.
- The idle timeout is a configurable constant. It is not a site setting, because adding a setting would be a database change.
