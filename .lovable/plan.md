## Diagnosis (verified)

The 404 is not a backend problem — there is simply **no public complaint submission page in the app**.

Confirmed by reading the code and database:
- `src/routes/publicRoutes.tsx` has only `/track/complaint` (tracking). No submission route exists; anything else falls through to `NotFound`.
- `src/pages/complaints/` contains only internal pages (`NewInternalComplaint` etc.), all behind `/complaints/*` module guards.
- Backend is ready: `create_complaint(_variant, _payload)` and `create_complaint_with_attachments(...)` are both executable by the `anon` role, and the intake rule for variant `public` exists with `allow_anonymous = true`, required fields `subject, description`, max 5 attachments.

So: build the frontend surface; no schema change needed.

## What to build

1. **New page** `src/pages/public/PublicComplaintIntake.tsx`
   - Public layout consistent with other public pages (LandingNav wrapper, government-portal styling).
   - Fields: subject, description, complaint type (from readable complaint types), optional licensee/entity name, contact name, email, phone, and an "Submit anonymously" toggle.
   - When anonymous is off, email is required (the RPC enforces this for non-anonymous public submissions); when on, contact fields are hidden and omitted.
   - Attachments: reuse the existing staged-upload attachment field pattern used by internal intake, capped at 5 files; only used if anonymous upload is permitted by storage policy — otherwise the field is hidden and the plan falls back to text-only submission (verified at implementation time).
   - Client-side validation with the existing complaint Zod schema, plus per-field errors rendered from the RPC's structured `fieldErrors`.
   - Submits via the existing `useCreateComplaint` hook with `variant: 'public'` (or `'anonymous'`, which the hook already maps to `public`), including an idempotency key so double-clicks can't create duplicates.

2. **Success view** — after submit, show the returned complaint reference number prominently with a note to save it, plus a link to `/track/complaint`.

3. **Route** — add `/complaints/submit` (public, lazy-loaded) to `src/routes/publicRoutes.tsx`. Note the existing `/complaints` dashboard route is guarded, so the public path must not collide; the public submission path will be registered in `publicRoutes` ahead of the guarded tree and use a distinct path (`/complaints/submit`). If ordering proves ambiguous, use `/submit-complaint` instead.

4. **Entry points** — point the landing page "Lodge Complaint" tile (`src/components/landing/FeaturesSection.tsx`, currently `href: '/login'`) at the new page, and add a "Track your complaint" link alongside it.

## Verification

- Load the new URL in an unauthenticated browser session and confirm the form renders (no 404, no redirect to login).
- Submit anonymously and non-anonymously; confirm a reference number returns and the rows land with the correct variant.
- Confirm the returned reference resolves on `/track/complaint`.
- Confirm required-field errors from the RPC render inline.

No changes to internal complaint pages, guards, RLS, or RPCs.
