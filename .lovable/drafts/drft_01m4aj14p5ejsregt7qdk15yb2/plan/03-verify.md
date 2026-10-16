## Step 2 (your decision): what to do when no rules are set up
Right now, running the checks with no rules counts as a pass. That is technically correct, but it really means nothing was checked. Choose one:
- **A. Leave as is.** The reviewer only has to click the button.
- **B. Make it clearer on screen.** When no rules apply, the Sufficiency card says "No sufficiency rules are set up for this licence type", and the gate reads "Checks run, no rules set up". How approval works stays the same.
- **C. Set up real rules.** An administrator creates sufficiency rules for this licence type. This is a settings task, not a code change.

This plan makes no database changes. Nothing is deployed or published without your approval.

## Technical notes
- Gate source: `decision_gate_status`. It passes only when the latest `sufficiency_evaluations` row exists with no unresolved `fail` + `blocker` results.
- `evaluate-application-sufficiency` still inserts an evaluation when no rule set matches (`rule_set_id = null`, `overall_status = sufficient`).
- Option B changes only `SufficiencyPanel.tsx` and the wording in `sufficiencyLabels.ts`.
