# Stop the AI analyst flagging "Building Society - Building Society - Building Society"

## What is happening

The AI assessment is given the application's raw `license_type` string, which is built by joining sector, sub-sector and category names. When all three levels carry the same name (Building Society), the string repeats three times. The model has no way to know these are three taxonomy levels, so it reports the repetition as a data-quality/redundancy issue — even though the data is correct. The rest of the app already collapses these repeats for display via the shared taxonomy label helper; only the AI path does not.

## Fix

1. **Give the AI the taxonomy properly, not a repeated string.**
   In the assessment context, send the licence type as a collapsed label plus the three levels separately (sector / sub-sector / category), so the model sees structure instead of a repeated phrase.

2. **Tell the model this is expected.**
   Add one explicit prompt rule: taxonomy levels may legitimately share the same name; identical sector / sub-sector / category names are not a data-quality issue and must never be raised as a finding or integrity concern.

3. **Clean the currently stored reports.**
   Existing saved assessments already contain this finding. In the Decision tab's AI panel, filter out findings and data-integrity commentary whose only substance is the repeated licence-type naming, and render every licence-type value through the existing taxonomy label helper so it reads "Building Society".

4. **Verify.**
   Re-generate the assessment on this application and confirm the redundancy finding is gone, the licence type reads once, and all other findings, ratings, evidence and Accept / Override / Escalate behaviour are unchanged.

## Technical notes

- Edge function `generate-application-ai-assessment`: replace `license_type: app.license_type` in `applicationContext.application_details` with a collapsed label (same dedupe logic as `src/lib/formatTaxonomyLabel.ts`, ported into the function) and keep `sector_name` / `sub_sector_name` / `category_name` as the authoritative levels; add the taxonomy guardrail to the prompt rules; bump prompt version.
- `src/components/applications/ApplicationAiAssessmentPanel.tsx`: apply the taxonomy label helper to displayed licence-type text, and drop findings/integrity items matching the repeated-taxonomy pattern.
- No schema, workflow, permission or decision-logic changes.
