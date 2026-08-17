# Remove visible "Please select parent field first" label from registration form

## Goal
Replace the visible helper text "Please select the parent field first" / "Select parent field first" that appears under disabled cascading fields in the registration form with a small info icon that shows the same message on hover via a tooltip.

## Current state
`src/components/registration/RegistrationStepRenderer.tsx` shows the message in four places:
- Dynamic-option `select` fields (line ~497-502)
- `MasterDataRegField` `select` fields (line ~959-964)
- `MasterDataRegField` radio variant (line ~909)
- `MasterDataRegField` multi-checkbox variant (line ~925)

The disabled select trigger and empty-option placeholders also currently display the same text.

## What will change
1. **Import shadcn Tooltip and an info icon**
   - Add `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` from `@/components/ui/tooltip`.
   - Import `Info` from `lucide-react` (keep existing `AlertCircle` if still needed elsewhere).

2. **Replace visible helper labels with icon + tooltip**
   - In each of the four locations above, remove the `<p>` element that renders the message.
   - Render a small inline `Info` icon instead, wrapped in a tooltip that displays "Please select the parent field first" on hover.

3. **Clean up placeholder text**
   - Change the disabled `SelectTrigger` placeholder from "Select parent field first" to the field's normal placeholder or a neutral "Select...".
   - Change the disabled empty `SelectItem` text from "Select parent field first" to "—" or the field placeholder so the message only appears in the tooltip.

4. **Verification**
   - Load `/register`, leave Country unselected, and confirm State/City show only an info icon (no visible label).
   - Hover the icon and confirm the tooltip appears.
   - Select a Country and confirm the State dropdown enables and options populate as before.
