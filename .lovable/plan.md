## Goal
Remove all "Demo" language from the Collaborative Review panel and make the seeded content look like real reviewer activity. The current viewer's identity and role are auto-detected and used as one of the reviewers, so the panel reads as though the user and their colleagues have been collaborating on the record.

This remains **UI-only**. No DB writes, no schema changes, no changes to `useCollabReview`, RLS, or edge functions. Real records with real activity render exactly as today.

## How it will work (plain English)

1. **Auto-detect the current user.** On mount, `CollaborativeReview` already has access to `AuthContext` (name, email, role) and `useEffectivePortalContext` (effective role label, regulator scope). We resolve:
   - Display name: `user.fullName` → falls back to email local-part.
   - Role label: the effective role from `useEffectivePortalContext` (e.g. "Senior Examiner", "Legal Counsel", "Head of Supervision", "Reviewer"), mapped through the same `roleMap` the component already builds. If the role can't be resolved, we use "Reviewer".
   - Initials: first letters of the display name.
   - Color: deterministic hash of the user id → one of the palette colors already used inline (indigo / amber / emerald / rose / violet).

2. **Build a reviewer roster of three.** The current user is always **Reviewer 1**. Reviewers 2 and 3 are drawn — in this order — from:
   - Other real profiles that appear in `authorMap` for this record (if any leaked through from the hook), then
   - A small pool of realistic regulator-style names/roles seeded from the active regulator context (e.g. "Legal Counsel", "Head of Supervision", "Compliance Officer"). Names are picked deterministically from a stable list keyed by the record id so the same record always shows the same roster.
   
   All three reviewers get distinct palette colors. None of them are labelled "demo".

3. **Seed narrative + activity only when the record is empty.** The activation rule stays the same as today: overlay only when there are zero real comments/suggestions AND every narrative field is blank. The moment any real content exists, the overlay is fully off.

4. **Content shown per empty field.** Same realistic regulatory prose already implemented (risk / findings / recommendation / conduct / prudential / generic), plus the same six-item activity mix per field:
   - 1 pending replace suggestion (Reviewer 1 = current user)
   - 1 accepted insert suggestion (Reviewer 2)
   - 1 rejected delete suggestion (Reviewer 3)
   - 1 open blocking comment (Reviewer 2) + 1 reply (Reviewer 1)
   - 1 open non-blocking comment (Reviewer 3)
   - 1 resolved comment (Reviewer 1)
   
   Because Reviewer 1 is the signed-in user, the "Mine" filter, the reviewer chip highlighting, and the inline color coding all key off the user's real identity automatically.

5. **Remove all "Demo" labels from the UI.**
   - No "Demo item — connect real data to interact." toast or badge.
   - No visible "demo" text anywhere in the panel.
   - Action buttons (Accept / Reject / Resolve / Reply / Toggle blocking) on seeded rows are still gated — but silently: they render disabled with a neutral tooltip ("No pending action") instead of the demo message. This keeps the panel from firing writes against synthetic ids, without exposing that the content is seeded.
   - Sidebar counts, legend chips, "Approval blocked" badge, filter dropdown, and view-mode toggle all behave exactly as they do on a real populated record.

6. **Safety on IDs.** Seeded objects keep an internal `synthetic: true` marker (not rendered) and non-UUID ids so the existing `useCollabReview` mutations refuse to touch them. The marker is only used by `CollaborativeReview.tsx` to gate the action buttons — it never appears in the DOM or in any label.

## Files touched

- `src/components/collab-review/demoContent.ts` — rename the exported symbols away from "Demo*" and rework to accept `{ currentUser, roster }`:
  - `buildDemoOverlay` → `buildSeedOverlay`
  - `DEMO_REVIEWERS` → internal `SEED_ROSTER_POOL` (name/role/color pool, no "demo" wording)
  - `isDemoId` → `isSyntheticId`
  - Reviewer 1 is always the current user; Reviewers 2 & 3 are picked deterministically per record id from the pool, skipping any name that collides with the current user.
  - All strings scrubbed of the word "demo".

- `src/components/collab-review/CollaborativeReview.tsx`:
  - Import `useAuth` + `useEffectivePortalContext` to derive the current user descriptor.
  - Replace `buildDemoOverlay` call with `buildSeedOverlay({ currentUser, recordId: entityId })`.
  - Replace `authorLabelSafe` demo branch with a synthetic-roster branch that returns roster entries (including the current user) transparently.
  - Remove the "Demo item — connect real data to interact." toast and any visible "demo" copy; disable action buttons on synthetic rows with a neutral tooltip.
  - Rename local variables (`demoActive` → `seedActive`, etc.) to match.

- `src/components/collab-review/markup/InlineMarkup.tsx` and `ReviewerLegend.tsx`: no logic change; they already consume merged data. Only remove any residual "demo" wording if present in placeholders (verified during exploration — none in these two files, all demo copy currently sits in `CollaborativeReview.tsx` and `demoContent.ts`).

## Out of scope

- No changes to `useCollabReview`, `review_step_permissions`, RLS, edge functions, or `CollabReviewConfigTab`.
- No new DB rows are created; nothing is persisted.
- Behaviour on records that already have real comments/suggestions or non-empty narrative is unchanged.

## Acceptance

- Open any Application / Return / Complaint / Registration with no reviewer activity and blank narrative → the panel shows the signed-in user as one of three reviewers in the legend (with their real name, role, and initials), plus two deterministic colleagues; inline colored markup, anchor pins, sidebar cards, "Approval blocked" badge, and filters all populate.
- The word "demo" appears nowhere in the panel, tooltips, or toasts.
- Clicking the "Mine" filter narrows to the current user's items.
- Action buttons on seeded rows are disabled with a neutral tooltip; no toast fires; no network request is made.
- On any record with real activity or non-empty narrative, the panel renders identically to today.
