## Plan

1. **Fix the Applications list CTA routing**
   - In the Applications list, make the “New Application” action respect the current tab/filter context:
     - `/applications?type=pre` → open `/pre-license/new`
     - `/applications?type=post` → open `/post-license/new`
     - `/applications` with no type filter → keep the existing Pre/Post choice for licensee/PPOC users.
   - This prevents users in the Pre Licensing Applications area from being sent to the post-license create page.

2. **Use effective portal context, not only base role**
   - Treat Primary User, Secondary User, and PPOC context consistently via the existing portal context.
   - Avoid relying only on `user.role`, because PPOC/web-user operating mode can differ from the base role.

3. **Normalize pre-license create URLs**
   - Prefer `/pre-license/new` for pre-license application creation.
   - Keep `/applications/new` as a backward-compatible alias to the same pre-license form, without changing the existing form functionality.

4. **Verify the navigation behavior**
   - Confirm the Pre Licensing Applications page CTA opens the pre-license form.
   - Confirm the Post Licensing Applications page CTA still opens the post-license form.
   - Confirm the unfiltered applications page still allows choosing Pre or Post where appropriate.