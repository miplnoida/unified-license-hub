# Fix cascading-field info icon placement in registration form

## Goal
Move the "Please select the parent field first" info icon so it sits immediately after the field label, instead of appearing below the disabled input. Keep all existing cascading behavior unchanged.

## Current state
- `src/components/registration/RegistrationStepRenderer.tsx` renders cascading `select`, `radio`, and `multi_select` fields with an `Info` icon + tooltip inside a helper paragraph below the input.
- The label (`labelEl`) is rendered separately above the input, so the icon currently looks disconnected from the label.

## Changes
1. In `RegistrationStepRenderer`:
   - Promote the `Info` tooltip into the label row for fields that are disabled because their parent cascading field is empty.
   - Keep the tooltip text: "Please select the parent field first".
   - Remove the standalone helper paragraph that currently holds the icon below the input.
   - Apply this to:
     - dynamic `select` fields (`field.dependsOn` / `dynamicOptions`)
     - `MasterDataRegField` select, multi-select, and radio variants
2. Preserve existing behavior:
   - dependent fields still clear when parent changes
   - placeholders remain neutral ("Select..." / "—")
   - disabled state remains until parent is selected
   - no other registration form logic changes

## Verification
- Open `/register` and select/deselect a cascading parent (e.g., Country) to confirm the info icon now appears next to the dependent label (State/City) when the parent is empty.
- Confirm tooltip displays on hover.
- Confirm cascading population still works after a parent is selected.
