# Public Experience

The logged-out area is a **Regulatory Services Portal**, not a marketing site. It serves four
audiences: applicants, existing licensees / regulated entities, representatives / portal users, and
members of the public.

## Public navigation (canonical)

| Item | Route |
|---|---|
| Home | `/` |
| Applicants | `/applicants` |
| For Licensees | `/licensee-services` |
| Public Register | `/registry` |
| Guidance | `/guidance` |
| Help / Contact | `/help` |

Right side: **Sign In** (`/login`) and **Apply / Register** (`/register`).

Implemented in `src/components/landing/LandingNav.tsx`. The nav entries are fixed platform
destinations rather than editable branding links, so licensee-facing routes and sign-in can never be
configured away. Sign In is rendered in the desktop header, in the compact header on mobile
(alongside the menu toggle) and inside the mobile menu.

## Public surfaces

| Route | Purpose | Data |
|---|---|---|
| `/` | Homepage, including the "Already regulated?" entity-portal section | Public |
| `/applicants` | Applying for regulatory authorisation — full journey explanation | Public |
| `/licensee-services` | For Licensees hub: entry choices + service catalogue | Public |
| `/licensee-services/:slug` | Process detail page per service (About / Who / Before you start / Process / After you submit / Need help / Action) | Public |
| `/guidance` | Public information index and explicit list of sign-in-only content | Public |
| `/help` | Help and contact details drawn from configured site settings | Public |
| `/registry`, `/registry/licensees`, `/registry/licensees/:id`, `/registry/entities`, `/registry/enforcement` | Public registers and published enforcement outcomes | Public, publication-authorised fields only |
| `/register`, `/register/applicant`, `/register/entity`, `/register/account` | Registration decision page and the two governed journeys | Public |
| `/login`, `/forgot-password`, `/reset-password` | Authentication | Public |

## Licensee journey (logged out → authenticated)

```text
Homepage "Already regulated?"  ──►  /licensee-services
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
Already have access?         Regulated, no access?            New licence?
Sign In to Entity Portal     Connect to Existing Entity        Start a New Application
/login?redirect=…            /register/entity                  /register/applicant
        │
        ▼
/licensee-services/<service>  ──►  Sign In CTA  ──►  /login?redirect=<authenticated route>
                                                          │
                                                          ▼
                                             secure entity portal surface
```

## Public vs secure distinction

Public information carries a **Public information** badge; anything requiring authentication carries
a **Secure entity service — sign in required** badge (`src/components/public/AccessBadges.tsx`).

Public: licence register, regulated entity register, published enforcement outcomes, general
regulatory guidance, service process descriptions.

Secure: returns, correspondence, requests, fit and proper, application details, obligations and
deadlines, private notices, entity user management.

## Redirect safety

All sign-in CTAs build their target through `signInHref()` in
`src/lib/publicServices/catalogue.ts`, which rejects anything that is not a same-origin relative
path. `src/pages/Login.tsx` independently re-validates the `redirect` parameter (must start with `/`
and must not start with `//`) before navigating, so arbitrary external redirects are not possible.

## Public licensee record

`/registry/licensees/:id` remains a public register record. It shows only publication-authorised
fields and renders "Not published" where the registry service does not publish a field. A clearly
separated panel invites authorised representatives to sign in or request portal access, and states
explicitly that viewing the record confers no access — membership and authority are determined only
after sign-in / onboarding.

## Related documents

- `docs/product/LICENSEE_PUBLIC_SERVICE_CATALOGUE.md`
- `docs/product/LICENSEE_SERVICE_GAP_REGISTER.md`
