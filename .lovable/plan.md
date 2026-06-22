## Problem

Clicking **View** on a form template (Pre-License / Post-License / Returns) currently opens the full Form Builder at `/admin/forms/create?...&mode=view`. That URL is wrong (it says "create"), and the builder UI — even with palette/properties hidden — is dense, technical, and not how the form will actually look to applicants.

A clean, friendly preview already exists (`/preview/:versionId`, rendered with `FormRenderer`), but it's only reachable from inside the builder's "Preview" button.

## What changes

### 1. New route + page: read-only template view

- Add `/admin/forms/:templateId/view` (admin-guarded, same as other `/admin/forms/*` routes).
- New page `src/pages/admin/FormTemplateView.tsx` that:
  - Loads the template via `useFormTemplates` (lookup by id) and its **published/active** version (fall back to latest if none published) via `useFormVersions` + `useVersionSections`.
  - Renders inside `DashboardLayout` with a `PageHeader`:
    - Title = template name
    - Sub-line = sector / sub-sector / category / service badges + version + status badge
    - Actions: **Back to list**, **Edit** (only when user has edit permission — routes to `/admin/forms/create?type=<form_type>&id=<templateId>`), **Open in new tab** (opens `/preview/<versionId>`).
  - Body = `FormRenderer` with `readOnly`, no submit/save callbacks (the same component end users see), wrapped in a `Card` for consistency with admin pages.
  - Empty state when the template has no fields/sections.
  - Loading + not-found states.

### 2. Wire the View action to the new route

Update the `onClick` for the **View** row action in:

- `src/pages/admin/PreLicenseForms.tsx` (`handleView`)
- `src/pages/admin/PostLicenseForms.tsx` (`handleView`)
- `src/pages/admin/FormManagement.tsx` (the View action around line 289 and any other View entry points for returns/other tabs)

…to navigate to `/admin/forms/<id>/view` instead of `/admin/forms/create?...&mode=view`.

### 3. Builder cleanup (minimal)

- Keep the existing `mode=view` branch inside `FormBuilder.tsx` as a harmless fallback for now (no admin link points to it anymore). No structural builder changes.

## Out of scope

- No changes to the builder itself, the existing `/preview/:versionId` page, `FormRenderer`, permissions, version history, or any backend/migration.
- No change to the "Edit" or "Create" flows — they still use `/admin/forms/create`.

## Files touched

- **Add** `src/routes/adminRoutes.tsx` — new route entry.
- **Add** `src/pages/admin/FormTemplateView.tsx` — new view page.
- **Edit** `src/pages/admin/PreLicenseForms.tsx` — repoint `handleView`.
- **Edit** `src/pages/admin/PostLicenseForms.tsx` — repoint `handleView`.
- **Edit** `src/pages/admin/FormManagement.tsx` — repoint the View action(s).

## Result

```text
Click "View" on a form template
   │
   ▼
/admin/forms/<id>/view   ← clean URL, admin layout
   │
   ▼
PageHeader (name, sector, version, status, Edit, Open in new tab)
FormRenderer (readOnly) — looks exactly like the applicant experience
```
