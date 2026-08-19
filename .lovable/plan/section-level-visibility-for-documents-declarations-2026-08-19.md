# Section-Level Visibility for Documents & Declarations

Today "Visible to applicant" exists only per row (each document type, each declaration). Two gaps:

1. There is no way to hide the whole Documents or Declarations section in one action.
2. When every row is hidden, the preview still renders the Documents section with an empty dropdown and upload control (the preview page passes the raw config through and does not drop empty steps the way the live registration flow does).

## What admins get

Each card in the Registration Form Builder gets a section-level switch in its header:

```text
Required Document Types      Visible to applicant [ON]   [Hidden]
Declaration Checkboxes       Visible to applicant [ON]   [Hidden]
```

- Turning a section off hides the whole step from applicants, regardless of row-level switches.
- Row-level switches stay and keep working for partial hiding.
- Rows remain fully editable in the builder when the section is hidden; a `Hidden` badge marks the card.
- Save gate unchanged in spirit: hiding the Documents section while "Require documents" is on is blocked with an inline message ("Documents are required for registration and cannot be hidden. Disable the requirement first."). Hiding the Declarations section is blocked only when a required OTP or CAPTCHA is placed on that step and has nowhere else to render.

## What applicants get

- Hidden section: the step disappears from the stepper, numbering closes up, nothing from it is validated or shown in Review.
- Documents section hidden or all types hidden: no dropdown, no upload control, no empty box — the step is simply absent.
- Declarations section hidden but a required CAPTCHA/OTP sits on that step: the step stays and shows only those controls.
- Already-uploaded files and previously stored declaration answers are never deleted or blanked.

## Technical approach

**Database** — migration adding to `registration_form_configs`:
`documents_section_visible boolean not null default true`, `declarations_section_visible boolean not null default true`. Defaults keep existing configs behaving exactly as now.

**Types / config hook** (`src/hooks/useRegistrationConfig.ts`) — expose `documentsSectionVisible`, `declarationsSectionVisible` using the `!== false` rule; `src/lib/registrationPreview.ts` gains the same optional flags.

**Shared helper** (`src/lib/registrationItemVisibility.ts`) — add `isDocumentsStepVisible(cfg)` and `isDeclarationsStepVisible(cfg)` that combine section flag + row visibility + OTP/CAPTCHA placement, so builder, runtime, preview and the edge function share one rule. Extend `validateSecurityVisibility` with the documents/declarations section checks.

**Builder** (`src/pages/admin/RegistrationFormBuilder.tsx`) — section switches in both card headers, `Hidden` badges, include new fields in load/save payloads and in the preview payload, plus the pre-save validation messages.

**Runtime** (`src/pages/registration/PreLicenseeRegistration.tsx`) — step derivation and `validateCurrentStep` use the new helpers instead of inline row filtering; review section and progress counters follow the same lists.

**Preview** (`src/pages/admin/RegistrationFormPreviewPage.tsx`) — select the new columns and the existing `otp_visible_to_applicant` / `captcha_visible_to_applicant`, and drop steps that resolve to empty, matching the applicant flow.

**Defensive render** (`src/components/registration/DocumentsStep.tsx`) — when no visible document type remains, render nothing instead of a section with an empty type dropdown.

**Server** (`supabase/functions/register-pre-licensee/index.ts`) — required-document and declaration enforcement skips items in a hidden section, using the same helper logic.

**Tests** (`src/lib/__tests__/registrationItemVisibility.test.ts`) — section hidden overrides visible rows; section visible + all rows hidden → step omitted; declarations section hidden with required CAPTCHA → step retained; documents section hidden + require_documents → validation error.

## Verification before reporting done

Typecheck, lint, test suite, then a browser pass on `/admin/registration-forms` (toggle each section off, save, preview) and `/register` (stepper numbering, no blank controls, submission succeeds).
