## Plan

1. Add a public route alias for `/complaints/new` that redirects to the existing unauthenticated complaint intake page at `/complaints/submit`.
2. Keep the authenticated internal complaint creation page available under a non-conflicting internal/admin URL, so existing staff functionality is not removed.
3. Update any visible/public complaint links that still point to `/complaints/new` to use `/complaints/submit`.
4. Verify in the browser that opening `/complaints/new` while signed out no longer redirects to `/login` and shows the public complaint submission form.

## Technical notes

- Current routing has `/complaints/submit` public, but `/complaints/new` is registered in the protected dashboard routes and wrapped by the auth/module guard.
- The minimal fix is route precedence plus a safe alias: public `/complaints/new` → `/complaints/submit`, and move the internal-only route to a distinct authenticated path if needed.