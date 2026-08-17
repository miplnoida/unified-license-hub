# Applicant Application: Make the Active Tab/Step Clearly Highlighted

Presentation-only fix. No changes to validation, submission, or payment logic.

## What is happening now

- On the New/Continue Application wizard (`/applications/new`, continue and view modes), the step rail at the top of the page paints the **current** step as a plain outlined circle with primary text, while already-passed steps get a solid filled circle. Result: the step you are on looks weaker than the ones behind it, so it doesn't read as "you are here".
- On the application detail view (view mode), the tab strip uses the default shadcn tab styling, where the active tab differs only slightly from the inactive ones.
- Inside a single form, the section/sub-form tabs already highlight the active tab (solid primary + ring) — that part stays as is.

## Changes

1. Wizard step rail (New / Continue / view application)
   - Active step: solid primary circle with primary-foreground icon, a visible ring around it, and the label in bold primary — the strongest element in the rail.
   - Completed steps: soft primary tint circle with a check icon, label in primary (clickable as today).
   - Not-yet-reachable steps: muted neutral, unchanged behaviour.
   - Keep the current reachability/clickable rules exactly as they are.

2. Forms list step
   - The form card currently being worked on (or last opened) gets a primary border/tint so it is obvious which form the user returns to; completed forms keep their check badge.

3. Application detail tab strip (view mode)
   - Active tab gets solid primary background with a ring so it stands out on the wrapped multi-row tab strip; inactive tabs stay muted with hover feedback.

Applies to both pre-license and post-license applicant screens that use the same wizard/tab components, in add, edit and view modes.

## Technical notes

- `src/pages/NewApplication.tsx`: step-rail button class logic (circle + label states) around the `WIZARD_STEPS` map; forms-list card class for the active template.
- `src/pages/PostLicenseApplicationForms.tsx` and `src/pages/ApplicationForms.tsx`: apply the same active-form card styling where the form list is rendered.
- `src/pages/applications/ApplicationDetail.tsx`: `TabsTrigger` className for the active state (via `data-[state=active]` classes), leaving tab values and content untouched.
- `src/components/form-renderer/FormRenderer.tsx`: no change needed; its tab styling is already the reference visual language the above will match.
