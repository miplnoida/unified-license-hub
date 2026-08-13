# Plan: Logo Visibility & Site Name Handling

## Goal
Make the uploaded logo display larger and more clearly across the portal, and stop rendering the textual site name next to the logo because the logo image already contains the site name. The `site_name` value remains stored in the database for other uses (page title, SEO, admin fields, etc.).

## Scope
Frontend/presentation-only changes. No database schema or data migration required.

## Changes

### 1. Branding Settings preview
File: `src/pages/settings/BrandingSettings.tsx`
- Increase the primary logo preview container from `h-24` to a larger display area (target `h-40` / `max-w-md`) so the user can verify the uploaded logo at a usable size.
- Keep the 5MB upload limit and recommended-size helper text unchanged.

### 2. Public landing navigation
File: `src/components/landing/LandingNav.tsx`
- When `branding.logo_url` is present, render only the logo image (no adjacent `site_name` text).
- Increase the logo image size from `h-8 w-8` to `h-10 w-auto` (or similar) so it is readable.
- When no logo is uploaded, keep the existing fallback (icon + site name).

### 3. Public landing footer
File: `src/components/landing/LandingFooter.tsx`
- When `branding.logo_url` is present, render only the logo image (no `site_name` text).
- Increase the footer logo size from `h-7 w-7` to `h-10 w-auto`.
- Keep the fallback icon + site name when no logo exists.

### 4. Sidebar (authenticated portal)
File: `src/components/layout/Sidebar.tsx`
- For both desktop and mobile sidebar, when `branding.logo_url` is present, render only the logo image (no `site_name` text).
- Increase the sidebar logo size from `h-8 w-8` to `h-10 w-auto`.
- Preserve the fallback icon + site name when no logo is set.
- Ensure the collapse/expand toggle remains correctly positioned when the text label is hidden.

## Acceptance criteria
- Logo preview on `/settings/branding` is visibly larger.
- Landing nav, landing footer, and authenticated sidebar show only the logo image when a logo URL exists.
- `site_name` is still saved/loaded from `site_settings` and appears in the page title and form fields.
- When no logo is set, the existing icon + site name fallback still displays.

## Out of scope
- Changes to the database, `site_settings` schema, or favicon handling.
- Header notification/user menu (it does not currently display a logo).
