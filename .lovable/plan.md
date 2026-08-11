# Fix: escalation creation fails with `malformed array literal: "["in_app", "email"]"`

## What is happening

With the escalation types now accepted, creating an escalation gets one step further and then fails inside the notification step of the escalation engine.

The database function `public.escalation_notify` reads the notification channels for the tier (a JSON value like `["in_app","email"]`) and assigns it straight into a text-array variable. Postgres cannot convert a JSON array to a text array implicitly, so the whole insert is aborted with `malformed array literal`.

Because `escalation_notify` is called from `escalation_raise`, every escalation created from any module (prudential, complaints, conduct, coordination) fails at the same point — nothing is saved.

Also confirmed: the channels variable is read but never actually used later in that function; the in-app + email sends are hardcoded below it. The other two functions that read `channels` (`escalation_rule_preview`, `notification_event_config_save`) handle it correctly and need no change.

## Fix

One database migration that replaces `public.escalation_notify` with a corrected version:

- Convert the tier's JSON channel list into a proper text array (`ARRAY(SELECT jsonb_array_elements_text(...))`), falling back to in-app + email when the rule has no channels configured.
- Use that channel list to decide what actually gets sent: in-app notification only when in-app is enabled, queued email only when email is enabled (and the recipient has an email address).
- Everything else — recipients, dedupe, tier events, "no recipient" logging, return value — stays exactly as it is today.

No frontend change is needed.

## Verification after the migration

1. Create a new prudential escalation — it saves and shows the success toast.
2. The escalation appears in the Escalation Manager feed with its type, tier and deadlines.
3. Recipients holding the tier role receive the in-app notification, and an email row is queued in the outbox.
4. Re-run the complaint escalation sweep to confirm the shared path works for the other modules too.

## Technical notes

- Migration: `CREATE OR REPLACE FUNCTION public.escalation_notify(...)` keeping the same signature, `SECURITY DEFINER`, and `SET search_path = public`.
- Root cause line: `SELECT coalesce((escalation_tier_config(...)->'channels')::jsonb, '["in_app","email"]'::jsonb) INTO v_channels` where `v_channels text[]`.
