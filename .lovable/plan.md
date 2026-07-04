## Goal

Staff sidebar already has a single "All License Requests" link → `/applications/queue`. Make that queue explicitly show both pre- and post-licensing applications, differentiated by a new **Pre/Post** column. Leave licensee-facing menus and all other behavior untouched.

## Changes

### 1. `src/pages/applications/ApplicationQueue.tsx`
- Include `data` in the row shape (already selected from the query; just extend `QueueRow` to keep it).
- Derive category per row using existing helper:
  ```ts
  import { getApplicationCategoryLabel } from '@/lib/applicationCategory';
  const category = getApplicationCategoryLabel(r.data); // "Pre-Licensee" | "Post-Licensee"
  ```
- Add a new **"Category"** column between **Type** and **Status**, rendering a small badge:
  - Pre → outline/neutral badge "Pre"
  - Post → secondary badge "Post"
- Extend the search filter so typing "pre" / "post" also matches this new column.
- No change to fetch query (already returns both categories — status-only filter).

### 2. Navigation — no change
`src/config/navigation.tsx` already exposes a single staff link ("All License Requests"). The two licensee-facing menu items ("Pre Licensing Applications", "Post Licensing Applications") stay as-is per the user's "don't change other working functionality" instruction.

### 3. No backend, no route, no permission changes.

## Verification

- Open `/applications/queue` as internal staff → table shows a new **Category** column with Pre / Post badges.
- Rows include both pre-license applications and post-license applications (those with `data.type === 'post_license'` or `data.service_id`).
- Searching "post" filters to post-licensing rows; "pre" to pre-licensing rows.
- Existing bulk assign, priority, SLA chips, and links to `/applications/:id` remain unchanged.
- Licensee sidebar (Pre / Post Licensing Applications) still navigates to `/applications?type=pre|post` with the same filtered list behavior.
