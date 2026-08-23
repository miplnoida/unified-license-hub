# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-audience-boundary.spec.ts >> SCN-BOUNDARY-EXT-licensee_primary_user: internal routes are refused by direct URL
- Location: e2e/cert-v2/02-audience-boundary.spec.ts:30:3

# Error details

```
Error: cross-audience route leaks for licensee_primary_user

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "/licensing/entity-resolution rendered for licensee_primary_user (final path /licensing/entity-resolution)",
+ ]
```

# Page snapshot

```yaml
- generic [ref=f9e2]:
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - generic [ref=f9e3]:
    - complementary [ref=f9e4]:
      - generic [ref=f9e5]:
        - img "OLRAS" [ref=f9e7]
        - button [ref=f9e8] [cursor=pointer]
      - navigation [ref=f9e12]:
        - generic [ref=f9e14]:
          - generic [ref=f9e15]:
            - button "Home" [expanded] [ref=f9e16] [cursor=pointer]
            - link "Home" [ref=f9e27] [cursor=pointer]:
              - /url: /dashboard
          - generic [ref=f9e33]:
            - button "My Work" [ref=f9e34] [cursor=pointer]
            - generic [ref=f9e42]:
              - link "Notifications" [ref=f9e43] [cursor=pointer]:
                - /url: /notifications
              - link "My Licences" [ref=f9e49] [cursor=pointer]:
                - /url: /licenses
              - link "My Returns" [ref=f9e55] [cursor=pointer]:
                - /url: /entity/returns
              - link "My Appeals" [ref=f9e61] [cursor=pointer]:
                - /url: /appeals
              - link "My Correspondence" [ref=f9e70] [cursor=pointer]:
                - /url: /entity/correspondence
              - link "Information Requests" [ref=f9e76] [cursor=pointer]:
                - /url: /entity/complaint-rfis
              - link "Supervisory Actions" [ref=f9e81] [cursor=pointer]:
                - /url: /entity/supervisory-actions
              - link "My Payments" [ref=f9e87] [cursor=pointer]:
                - /url: /payments
          - generic [ref=f9e92]:
            - button "Licensing & Authorisation" [ref=f9e93] [cursor=pointer]
            - generic [ref=f9e102]:
              - button "Applications" [ref=f9e103] [cursor=pointer]
              - generic [ref=f9e112]:
                - link "Pre-Licensing" [ref=f9e113] [cursor=pointer]:
                  - /url: /applications?type=pre
                - link "Post-Licensing" [ref=f9e119] [cursor=pointer]:
                  - /url: /applications?type=post
          - generic [ref=f9e126]:
            - button "Supervision" [expanded] [ref=f9e127] [cursor=pointer]
            - generic [ref=f9e138]:
              - button "Market Conduct" [expanded] [ref=f9e139] [cursor=pointer]
              - link "Complaints" [ref=f9e154] [cursor=pointer]:
                - /url: /complaints
          - generic [ref=f9e159]:
            - button "Returns & Data" [expanded] [ref=f9e160] [cursor=pointer]
            - link "Reporting Dashboard" [ref=f9e171] [cursor=pointer]:
              - /url: /entity/returns/dashboard
          - generic [ref=f9e179]:
            - button "Correspondence & Cases" [ref=f9e180] [cursor=pointer]
            - link "Documents" [ref=f9e189] [cursor=pointer]:
              - /url: /documents
    - generic [ref=f9e195]:
      - banner [ref=f9e196]:
        - button "Search navigation" [ref=f9e198] [cursor=pointer]:
          - generic [ref=f9e202]: Search...
          - generic [ref=f9e203]: ⌘K
        - generic [ref=f9e204]:
          - button "Sector Not set" [ref=f9e205] [cursor=pointer]:
            - generic [ref=f9e210]: Sector
            - generic [ref=f9e211]: Not set
          - button "Notifications" [ref=f9e212] [cursor=pointer]
          - button "C Certification - Licensee Primary User Applicant, Regulated Entity User" [ref=f9e213] [cursor=pointer]:
            - generic [ref=f9e214]: C
            - generic [ref=f9e216]:
              - paragraph [ref=f9e217]: Certification - Licensee Primary User
              - paragraph [ref=f9e218]: Applicant, Regulated Entity User
      - main [ref=f9e219]:
        - generic [ref=f9e220]:
          - navigation "breadcrumb" [ref=f9e221]:
            - list [ref=f9e222]:
              - listitem [ref=f9e223]:
                - link "Home" [ref=f9e224] [cursor=pointer]:
                  - /url: /dashboard
              - listitem [ref=f9e225]
              - listitem [ref=f9e228]:
                - link "Entity resolution" [disabled] [ref=f9e229]
          - generic [ref=f9e232]:
            - heading "Access Denied" [level=1] [ref=f9e236]
            - paragraph [ref=f9e237]: You don't have permission to access this page. Please contact your administrator if you believe this is an error.
            - link "Go to Dashboard" [ref=f9e238] [cursor=pointer]:
              - /url: /dashboard
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { PERSONAS } from './support/personas';
  3  | import { loginAs, probeRoute } from './support/auth';
  4  | 
  5  | /**
  6  |  * WAVE 3A / SCN-BOUNDARY — declared audience boundaries are authoritative.
  7  |  * External users must not reach internal supervisory routes by direct URL, and
  8  |  * read-only/auditor personas must not reach mutation surfaces.
  9  |  */
  10 | 
  11 | const INTERNAL_ONLY = [
  12 |   '/returns/queue',
  13 |   '/prudential/work',
  14 |   '/conduct/work-queue',
  15 |   '/enforcement',
  16 |   '/inspections',
  17 |   '/admin/users',
  18 |   '/admin/roles',
  19 |   '/admin/audit-logs',
  20 |   '/licensing/entity-resolution',
  21 | ];
  22 | 
  23 | const EXTERNAL_PERSONAS: Array<[string, string]> = [
  24 |   ['applicant_user', PERSONAS.applicant],
  25 |   ['licensee_primary_user', PERSONAS.licenseePrimary],
  26 |   ['entity_ppoc', PERSONAS.entityPpoc],
  27 | ];
  28 | 
  29 | for (const [label, email] of EXTERNAL_PERSONAS) {
  30 |   test(`SCN-BOUNDARY-EXT-${label}: internal routes are refused by direct URL`, async ({ page }) => {
  31 |     await loginAs(page, email);
  32 |     const leaks: string[] = [];
  33 |     for (const route of INTERNAL_ONLY) {
  34 |       const r = await probeRoute(page, route);
  35 |       const blocked = r.denied || r.notFound || r.redirected;
  36 |       if (!blocked) leaks.push(`${route} rendered for ${label} (final path ${r.path})`);
  37 |     }
> 38 |     expect(leaks, `cross-audience route leaks for ${label}`).toEqual([]);
     |                                                              ^ Error: cross-audience route leaks for licensee_primary_user
  39 |   });
  40 | }
  41 | 
  42 | test('SCN-BOUNDARY-AUDITOR: auditor reaches read surfaces but no admin mutation surface', async ({ page }) => {
  43 |   await loginAs(page, PERSONAS.auditor);
  44 |   const leaks: string[] = [];
  45 |   for (const route of ['/admin/users', '/admin/roles', '/settings/security']) {
  46 |     const r = await probeRoute(page, route);
  47 |     if (!(r.denied || r.notFound || r.redirected)) leaks.push(`${route} rendered for auditor`);
  48 |   }
  49 |   expect(leaks, 'auditor admin-surface leaks').toEqual([]);
  50 | });
  51 | 
  52 | test('SCN-BOUNDARY-READONLY: read_only persona cannot reach configuration surfaces', async ({ page }) => {
  53 |   await loginAs(page, PERSONAS.readOnly);
  54 |   const leaks: string[] = [];
  55 |   for (const route of ['/admin/roles', '/admin/forms', '/settings/security']) {
  56 |     const r = await probeRoute(page, route);
  57 |     if (!(r.denied || r.notFound || r.redirected)) leaks.push(`${route} rendered for read_only`);
  58 |   }
  59 |   expect(leaks, 'read_only configuration leaks').toEqual([]);
  60 | });
  61 | 
```