# Remove the stray "Update Registration" button from registration emails

## What's happening

The button is not coming from the email template. It is injected by the notification layout.

Confirmed in code:
- `supabase/functions/perform-registration-workflow-action/index.ts` builds one shared payload for every workflow action and always sets `cta_url` = `/registration/update/<id>` and `cta_label` = `"Update Registration"`.
- `supabase/functions/dispatch-notification-event/index.ts` passes those values into `renderBrandedEmail`, and `supabase/functions/_shared/email-layout.ts` renders a CTA button whenever a CTA URL is present (defaulting the label to "Open Portal").

So approvals, escalations, comments and rejections all inherit an "Update Registration" action button that makes no sense for those steps.

## Fix

1. In `perform-registration-workflow-action`, stop putting the CTA in the shared payload. Derive it per action instead:
   - Actions that genuinely need applicant input (`request_resubmission`, `return_for_correction`, `request_more_info`, `send_back`): keep `cta_url` = `<origin>/registration/update/<id>` with label `"Update Registration"`.
   - All other actions (`approve` at any step, final approval, `reject`, `escalate`, `save_comment`, anything else): omit `cta_url` and `cta_label` entirely.
2. Keep the rest of the payload (reviewer name, comments, portal/app URL, status) unchanged so existing templates keep rendering.
3. In `email-layout.ts`, keep the existing behaviour of rendering no button when no CTA URL is supplied — verify this and only adjust if an empty string still produces markup.

No template records, recipient rules, or workflow logic change; this only removes a button that was force-injected.

## Verification

- Approve a registration step and confirm the email body has no action button.
- Trigger a "return for correction" action and confirm the "Update Registration" button is still present and links correctly.
