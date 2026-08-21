---
name: Prudential assessment case workspace
description: Assessment stage changes only from the Current step tab; rating policy and evidence are server-owned
type: feature
---
- `/prudential/assessments/:id` is `AssessmentWorkspace.tsx`, driven entirely by `public.prudential_assessment_case()` (header, blockers, available_actions, next_action, filing, linked_actions, rating_guidance, completed_steps).
- One lifecycle controller: only the **Current step** tab renders transitions. Supporting tabs save their own content; blocker "Resolve" links use `?from=current` and show a detour banner.
- No client-side supervisory rating suggestion. `rating_guidance` currently reports "NO AUTOMATED RATING SUGGESTION" (no configured methodology); overall rating is a human determination.
- No raw return-filing-id input. Evidence = canonical EPR-01 accepted filing; stress evaluation is only runnable at `/admin/prudential/operations`.
- `/prudential/entities/:id` redirects to `/entities/:id?view=prudential`; analytics-only surface retained at `/prudential/analysis/:id`.
