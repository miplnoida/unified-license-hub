# Harden CAPTCHA, Offline Payment, Invoice & Review Editing

## What I verified in the current code

- `CaptchaWidget` renders a plain "I'm not a robot" checkbox whenever there is no active configuration (insecure fallback confirmed).
- The main pre-licensee registration declarations step does **not** use `CaptchaWidget` at all — it has its own placeholder checkbox with the comment "This is a placeholder captcha".
- `register-pre-licensee` (the server submission function) contains no CAPTCHA logic, so CAPTCHA is currently client-side only.
- `manage-captcha` verifies tokens with the provider secret server-side, keeps secrets in `captcha_secrets` (never returned), and gates admin actions on admin/super_admin — this part is sound; reCAPTCHA v3 is treated exactly like v2 (no score/action check).
- Two migrations (`...095704`, `...095751`) both define `issue_payment_invoice`, `submit_offline_payment`, `verify_offline_payment` — duplicated/competing definitions to reconcile.
- Applicant payment panel offers a "Paid Offline" button next to online pay; there is no explicit "Choose payment method" step.
- `PaymentSettings` has no online/offline enable toggles.
- Per-section edit is wired (`onEditSection` → `focusSectionId`) in `NewApplication`, but no acknowledgement-reset logic is present after a section edit.

## Plan

### 1. CAPTCHA (highest priority)
- Delete the checkbox fallback from `CaptchaWidget`. Three states only: disabled → render nothing; enabled + active config → real provider widget; enabled + no active config → destructive notice "Security verification is temporarily unavailable. Please try again later." and submission disabled.
- Widget returns a server-issued verification token (not a boolean). `manage-captcha verify` will mint a short-lived single-use verification record (new table `captcha_verifications`: id, provider, config id, ip hash, expires_at, consumed_at) and return its id.
- Replace the placeholder checkbox in the registration declarations step with `CaptchaWidget`; registration form state stores the verification id.
- `register-pre-licensee` re-checks server-side: if `captcha_enabled` is true, require a valid, unexpired, unconsumed verification id and consume it atomically; reject otherwise. Disabled → skip intentionally. No trust in any client boolean.
- reCAPTCHA v3: use `grecaptcha.execute` flow with action, and validate `action` + configurable `score_threshold` (new nullable column, default 0.5) server-side. Confirm hCaptcha/Turnstile/v2 verification endpoints and error mapping.
- Structured, secret-free error responses in `manage-captcha` for malformed body, missing config, missing secret, unsupported provider, provider network/API error.

### 2. CAPTCHA admin settings
- Single-active guarantee: partial unique index on `captcha_configurations (is_active) where is_active` plus an `activate_captcha_configuration(_id)` RPC that deactivates others and activates the target in one transaction; UI calls only the RPC.
- Settings page: warning banner when enabled with no active config; confirm dialog before activating another config; block deleting the active config unless another is activated or CAPTCHA is globally disabled; secret shown as "Configured / ••••••••" and preserved when left blank on edit; loading/success/error states and disabled buttons during mutations.
- Audit entries (server-side) for create/edit/activate/deactivate/delete/global enable-disable, never including the secret.

### 3. Payment method selection & settings
- `PaymentSettings`: add "Enable Online Payments" and "Enable Offline Payments" toggles persisted in site settings.
- Applicant panel: explicit "Choose Payment Method" selectable cards (Online / Offline) honouring those toggles; only-one-enabled shows just that option; both off shows a clear configuration message with payment blocked and no silent fallback.

### 4. Offline payment hardening
- Consolidate the duplicated RPC definitions into one authoritative migration and harden `submit_offline_payment`: ownership/authorisation check, application state check, positive amount matching outstanding, valid non-future payment date, reference required for bank transfer/cheque, allowed offline method, and rejection when the application is already paid or has a pending offline payment.
- Proof attachments: enforce owner-only upload/read plus regulator read via storage/RLS policies, size and MIME whitelist, rejecting executable/dangerous types; require proof for bank transfer and cheque, optional for cash, before approval is allowed.
- `verify_offline_payment`: `SELECT ... FOR UPDATE` on the payment, accept only `pending_verification → approved|rejected`, return a clear "already reviewed" result otherwise, set paid/paid_at/verified_by/verified_at on approval, store rejection reason, issue the invoice exactly once, and write a single server-side audit entry. Idempotent on repeat calls.
- Admin verification dialog shows applicant, application number, amount, method, reference, payment date, bank, remarks, proof preview/download, approve/reject with remarks (reason mandatory on reject), and Download Invoice after approval.
- Payment gate: only approved/completed payments satisfy submission; pending offline never counts.

### 5. Invoice
- Issue only for confirmed online payments and approved offline payments; never for pending/rejected/failed. Idempotent — a second call returns the same row.
- Invoice numbers generated database-side from a sequence with a unique index on `invoice_number`; one receipt per payment enforced by a unique index on `payment_id`.
- Persist a full snapshot at issuance (entity/applicant name, application number, application & licence type, fee line items, subtotal, tax, total, currency, payment method, reference, paid date, invoice date) and make the PDF render only from the snapshot, never recalculating today's fee config.
- Access control via RLS/RPC so a guessed payment/invoice UUID cannot expose another applicant's invoice; applicant download available from payment section and payment history at any later time with the consistent label "Download Invoice"; admin download from payment detail/verification dialog.

### 6. Review per-section editing
- Make `onEditSection` resolve correctly for simple sections, grouped forms, sub-forms, nested sections and conditional/hidden sections, so the renderer lands on the exact section (scroll + focus), not just the right template.
- Each editable review section gets a Pencil action with an accessible label "Edit <section name>", keyboard reachable; section headers stay non-clickable.
- Show the edit action only in editable states (draft / incomplete / returned for correction / RFI); enforce the same rule server-side on the save/update path so the icon can never bypass a locked application.
- Reset the review acknowledgement when application data actually changes after acknowledgement (data-hash comparison), requiring a fresh acknowledgement before payment/submission; no reset on plain back-navigation without changes.

### 7. RBAC, tests, regression
- Confirm every new action has server-side authorisation (CAPTCHA view/edit/activate/delete; offline payment view/verify/reject/proof; invoice applicant-ownership and scoped admin access), reusing existing permissions rather than broad admin grants.
- Add tests: CAPTCHA disabled/enabled/misconfigured paths, activation single-active invariant, offline payment create/authorisation/pending-not-paid/approve/reject/double-approve, invoice creation rules and uniqueness, and section-edit + acknowledgement-reset logic.
- Regression check the existing online payment flow (gateway, webhook/RPC confirmation, duplicate prevention, refresh, invoice issuance) and the review → acknowledge → pay → submit sequence; run build, typecheck, lint and tests, then report fixes, migrations, security posture, tests and any remaining gaps honestly.

## Technical notes
- New/changed DB objects: `captcha_verifications` table, `score_threshold` column, partial unique index on active CAPTCHA, `activate_captcha_configuration` RPC, consolidated `submit_offline_payment` / `verify_offline_payment` / `issue_payment_invoice` with locking and snapshot, unique indexes on `invoice_number` and `payment_receipts.payment_id`, storage policies for payment proof. All functions `SECURITY DEFINER` with explicit `search_path` and minimal grants.
- Edge functions touched: `manage-captcha` (verification tokens, v3 scoring, structured errors), `register-pre-licensee` (server-side CAPTCHA enforcement).
- Frontend touched: `CaptchaWidget`, `useCaptchaConfig`, registration declarations step, `CaptchaSettings`, `PaymentSettings`, licensee payment panel, `OfflinePaymentDialog`, `PaymentVerificationDialog`, `PaymentAttachments`, `ApplicationReviewBuilder`, `ReviewAcknowledgement`, `FormRenderer`, `NewApplication`, `src/lib/invoice.ts`.
