# AML/CFT demonstration — recording runbook

## Before recording

1. Confirm non-production. Every demo script refuses on a production deployment.
2. Ensure the dataset is present and convergent:
   - `psql -X -q -f scripts/demo/seed-aml-demo-dataset.sql`
   - `psql -X -q -f scripts/demo/seed-aml-demo-current-workflow.sql`
   - `psql -X -q -f scripts/demo/seed-aml-demo-downstream.sql`
   Each script is convergent: a second run creates no business record.
3. Run the integrity gates: `psql -X -q -f scripts/demo/verify-aml-demo.sql`.
   Expected result: all `CURRENT-01…06` and `DOWNSTREAM-01…06` gates pass; the two known
   historical gates `INTEGRITY-14B` and `INTEGRITY-15` fail by design, because the historical
   baseline predates the current publication and question-plan architecture.
4. Sign in as an internal AML/CFT supervisory user. Do not record as a licensee user.
5. Warm every route in `docs/aml/AML-demo-route-manifest.md` once so no scene opens on a loading state.
6. Set the browser to 1280 x 800 or wider; collapse browser bookmark bars and notifications.

## During recording

- Follow `docs/aml/AML-demo-video-storyboard.md` scene order and read
  `docs/aml/AML-demo-presenter-script.md`.
- Do not create, edit or delete records outside the seeded scenarios.
- Do not activate a calculation policy, answer DEC-01…DEC-08, or attempt to publish a rating.
- If the platform refuses an action, show the refusal and move on.

## After recording

- Leave the dataset in place: it is permanent, not disposable.
- Do not attempt cleanup to "reset" the demo. `scripts/demo/cleanup-aml-demo-dataset.sql` refuses
  atomically while immutable risk movements exist, and that refusal is correct behaviour.

## Known limitations to state on camera

| Limitation | Reason |
|------------|--------|
| No approved rating publication | No live calculation policy; DEC-01…DEC-08 unsigned |
| Historical ratings labelled legacy | Recorded before the current governed publication workflow existed |
| Demo dataset not removable | Append-only risk history and audit evidence by design |
