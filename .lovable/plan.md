## Goal
Make the Collaborative Review panel look "alive" for demos — every narrative field, the reviewer legend, the sidebar cards, inline markup, and the anchored pins should render as though real reviewers have been working on the record — even when the underlying DB has nothing yet.

This is UI-only. No DB writes, no schema changes, no changes to `useCollabReview`, and no impact on real records that already have data.

## Where the change lives
Single file: `src/components/collab-review/CollaborativeReview.tsx`.

A new local helper `buildDemoOverlay(fields)` produces:
- A per-field dummy narrative string (used only when `field.value` is empty)
- Three dummy reviewers with distinct colors, names, roles, and initials
- Dummy `ReviewComment[]` (open, resolved, blocking, with replies, some anchored to text ranges)
- Dummy `ReviewSuggestion[]` (insert / delete / replace; pending / accepted / rejected)

The component then computes `effectiveFields`, `effectiveComments`, `effectiveSuggestions` by merging demo data on top of the real hook output. All existing rendering paths (`InlineMarkup`, `ReviewerLegend`, sidebar cards, filter/legend counts, anchor pins) consume the merged data unchanged.

## Activation rule
Demo overlay activates only when the record is empty:

```
demoActive =
  collab.comments.length === 0 &&
  collab.suggestions.length === 0 &&
  fields.every(f => !f.value || !f.value.trim())
```

If any real comment/suggestion exists, or any field has real content, the overlay is fully off — real records look identical to today.

## Demo content spec

Reviewers (stable synthetic ids, never sent to the server):
```text
demo-r1  Priya Menon        Senior Examiner        #6366F1 (indigo)
demo-r2  Marcus Wright      Legal Counsel          #F59E0B (amber)
demo-r3  Aisha Rahman       Head of Supervision    #10B981 (emerald)
```

Per-field narrative fallback (used only when `field.value` is blank). Content is tailored by field label keyword so it reads naturally in every module:
- Labels containing "risk" / "assessment" / "analysis" → risk-analysis paragraph
- Labels containing "finding" / "observation" → examination-findings paragraph
- Labels containing "recommendation" / "conclusion" → recommendation paragraph
- Labels containing "complaint" / "conduct" → conduct-review paragraph
- Labels containing "financial" / "balance" / "capital" → prudential paragraph
- Fallback → generic reviewer narrative paragraph

Each paragraph is 3–5 sentences of realistic regulatory prose so anchored selections have something to point at.

Sidebar contents per field:
- 1 pending replace suggestion by Priya (anchors a phrase in the narrative)
- 1 accepted insert suggestion by Marcus
- 1 rejected delete suggestion by Aisha
- 1 open blocking comment by Marcus anchored to a phrase, with 1 reply from Priya
- 1 open non-blocking comment by Aisha anchored to a different phrase
- 1 resolved comment by Priya (no anchor)

That produces populated: reviewer legend with 3 chips + counts, inline colored insertions/deletions, numbered anchor pins, blocking badge, "Approval blocked" header badge preview, resolved/accepted/rejected states — the full feature surface.

## Safety
- Demo objects use `id` values prefixed `demo-` so the real mutation buttons (Accept / Reject / Resolve / Reply / Blocking) are hidden on demo rows via a small `isDemo` guard. Clicking any action button on a demo row is a no-op with a toast: "Demo item — connect real data to interact." Real rows keep every existing action.
- `authorLabelSafe` gets a small branch: if `uid` starts with `demo-`, return the demo reviewer's name/role/color/initials directly (bypasses `authorMap`/`roleMap` lookups so no spurious profile queries fire).
- `commentAnchorNumbers`, `legendEntries`, filters, and view-mode toggle work unchanged because they operate on the merged arrays.
- Empty-state placeholders in `ReviewerLegend` and `InlineMarkup` become unreachable when demo is active (there is always content), which is the desired demo behaviour.

## Out of scope
- No changes to `useCollabReview`, RLS, permissions, edge functions, or `CollabReviewConfigTab`.
- No changes to `ReturnDetail`, `ApplicationDetail`, `ComplaintDetail`, `RegistrationReviewDetail` — they keep passing the same `fields` prop.
- No new dependencies.

## Acceptance
- Open any Application / Return / Complaint / Registration record with no reviewer activity → panel shows 3 reviewers in the legend, colored inline insertions/deletions in the narrative, numbered anchor pins, and 6 sidebar cards (mix of comments, replies, suggestions, blocking, resolved, accepted, rejected).
- A red "Approval blocked: 1 unresolved" badge appears in the card header (demo blocking comment).
- Switching Markup / Final / Original changes the narrative rendering as today.
- Filter dropdown (All / Open / Resolved / Suggestions / Mine) narrows demo items correctly.
- Clicking a reviewer chip filters the sidebar and dims other reviewers inline.
- On a record that already has any real comment/suggestion or non-empty narrative, the panel renders exactly as it does today — demo overlay is off.
