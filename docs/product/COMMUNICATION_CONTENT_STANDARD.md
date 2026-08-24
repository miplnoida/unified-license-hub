# Enterprise Communication Content Standard

Scope: content, structure, format and regulatory tone of every communication the
platform generates for external recipients (applicants, registrants, licensees,
authorised representatives, complainants, individuals under assessment).

This is a **content-only** standard. No event key, recipient rule, channel,
dedupe window, severity, workflow, permission or dispatch mechanism was changed
by its application.

## 1. House style

1. Institutional voice — "the Authority", never "we at the team", never marketing tone.
2. No exclamation marks, emojis, slogans, urgency language or promotional content.
3. Every external communication carries its regulatory reference in the subject line,
   in the form `Subject matter | {{reference}}`.
4. Body structure, in order:
   - opening line stating what the communication concerns and its reference;
   - substantive statement of the decision, requirement or event;
   - `Action required` — what the recipient must do, or an explicit statement that
     no action is required;
   - `Deadline` — where a date applies, with the consequence of non-compliance;
   - `What happens next` — the Authority's next step and the recipient's options;
   - sign-off `Regards, {{app_name}}`.
5. Decisions state that they are decisions, and where a right of review or appeal
   exists it is signposted without restating statute.
6. Confidential material (notice contents, decision reasoning, evidence) is never
   reproduced in email; the recipient is directed to the portal.
7. In-app copy is a single scannable sentence carrying reference + required action.
8. Sensitive matters (enforcement, conduct, fitness and propriety) avoid conclusive
   language until a determination has been made.

## 2. Token discipline (non-regression control)

A communication may only reference variables the dispatcher already supplies for
that event. The applier (`scripts/comms-refresh/apply.py`) extracts every token in
the proposed copy and rejects the event unless the token set is a subset of the
tokens present in the pre-existing content for the same event, plus the system
tokens (`app_name`, `app_url`, `cta_url`, `cta_label`, `support_email`,
`portal_url`, `login_url`).

Result of the applied run: **0 events rejected**, **0 tokens introduced**, and all
pre-existing link tokens (`portal_url` on the registration correction/approval
family) retained.

## 3. Coverage

| Area | External events refreshed |
| --- | --- |
| Applications and assessment | 17 |
| Registration and onboarding | 12 |
| Licensing, payments, entity access | 20 |
| Returns and prudential supervision | 23 |
| Conduct, complaints and enforcement | 15 |
| **Total event configurations** | **85 applied** |

Template rows re-published and re-pinned: **159** (74 email, 85 in-app). Each
re-publication appends a new `notification_template_versions` row; no historic
version row was modified, and each channel binding was re-pinned to the new
version so live dispatch uses the improved wording.

Code-controlled copy upgraded: one-time verification code email
(`send-registration-otp`) — subject, heading, intro and security paragraphs.

Formal correspondence (`correspondence_templates`: approval, conditional approval,
deferral, refusal, resubmission decision letters) already conforms to this standard
and was left unchanged.

Email presentation: the shared summary table (`_shared/email-branding.ts`) now also
surfaces complaint, enforcement, investigation, reporting-period, individual and
response-due references, with label de-duplication.

## 4. Known pre-existing defect (not introduced here)

Two active event configurations have no bound published template for their declared
channels and therefore cannot dispatch at all:

- `conduct_investigation.monitoring_activated`
- `conduct_intelligence_report_published`

Their integrity guard (`notification_event_config_requires_templates`) blocks any
update while unbound, so their refreshed copy is held in the content pack
(`scripts/comms-refresh/content/conduct-enforcement.json`) and will apply as soon as
templates are bound. This is a configuration gap, outside content scope.

## 5. Evidence and re-runs

- Curated copy: `scripts/comms-refresh/content/*.json` (event key → in-app title/message, email subject/body).
- Applier and validator: `scripts/comms-refresh/apply.py` (`--dry-run` / `--apply`).
- Pre-change snapshot of every touched row: `scripts/comms-refresh/out/before-snapshot.json`.
- Validation artefacts: `out/rejected-tokens.json`, `out/missing-events.json`.

Any future wording change should be made in the content pack and re-applied through
the same validator, so token parity is enforced and a rollback baseline exists.

## 6. Formatting contract (how stored copy becomes formatted email)

Template bodies are stored as plain text. The shared email shell
(`supabase/functions/_shared/email-layout.ts`, `renderRichBody`) converts them to
HTML at dispatch time, after HTML-escaping, so copy can never inject markup:

| Stored copy | Rendered as |
| --- | --- |
| Blank-line separated blocks | Separate paragraphs |
| A standard section label on its own line (`Action required`, `Deadline`, `What happens next`, `Remark`, `Reason`, `Decision`, `Right of appeal`, …) | Bold sub-heading |
| A short (≤5 words), un-punctuated opening line introducing further lines | Bold sub-heading |
| Lines beginning `- `, `* ` or `• ` | Bulleted list |
| Lines beginning `1. ` / `1) ` | Numbered list |
| `**text**` | Bold |
| `*text*` / `_text_` | Italic |
| `` `text` `` | Monospaced inline code |
| Bare `http(s)://…` | Clickable link |
| Single newlines inside a paragraph (e.g. `Regards,` + `{{app_name}}`) | Line break |

Colon-terminated lead-ins (`Please sign in and:`) and lines immediately preceding a
list are treated as sentences, not labels, so list introductions stay in body style.
The same rules are mirrored client-side in `src/lib/emailBodyFormat.ts` so the admin
template preview shows the dispatched formatting rather than raw text.

No template content was changed to add markup: the existing section-label structure
of the applied content pack is what drives the bold headings, so this is a
presentation-layer upgrade with no token or recipient impact.
