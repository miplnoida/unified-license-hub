# Plan: Add sidebar layout to Supervisory AI Reports page

## Root cause (confirmed by reading the files)
`src/pages/analytics/SupervisoryAiReports.tsx` returns its JSX directly inside a
plain `<div className="space-y-6">`. Every other dashboard page (e.g.
`AiInsightsHub.tsx`) wraps its content in `<DashboardLayout>...</DashboardLayout>`,
which is the component that renders the `Sidebar` + `Header` shell
(`src/components/layout/DashboardLayout.tsx`). Because the AI Reports page skips
that wrapper, it renders full-width with no sidebar — exactly the symptom you see.

## Fix (one file, ~3 lines)
In `src/pages/analytics/SupervisoryAiReports.tsx`:

1. Add the import:
   ```ts
   import { DashboardLayout } from '@/components/layout/DashboardLayout';
   ```
2. Wrap the page return in `<DashboardLayout>`:
   - Change `return ( <div className="space-y-6">` →
     `return ( <DashboardLayout> <div className="space-y-6">`
   - Add the matching `</DashboardLayout>` before the final `);` at the end of the
     component (after the closing `</div>` that pairs with the opening one, around
     line 498).

This matches the existing pattern used by `AiInsightsHub.tsx` and all other
analytics/dashboard pages, so the sidebar and header will appear consistently.

## Verification
- After the edit, open the preview at `/analytics/ai-reports` and confirm the
  left sidebar + top header render identically to `/analytics/ai-insights`.
- Confirm the page content (tabs, cards, drawer) still renders correctly inside
  the layout.
