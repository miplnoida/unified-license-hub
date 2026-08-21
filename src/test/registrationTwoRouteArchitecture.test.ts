/**
 * Public registration two-route architecture guardrails.
 *
 *   /register            → governed journey choice (FORM_FIRST / ENTITY_FIRST)
 *   /register/applicant  → FORM_FIRST  (existing production registration form)
 *   /register/entity     → ENTITY_FIRST (governed entity resolution)
 *   /register/legacy     → compatibility alias to /register/applicant
 *
 * Update/resubmission routes must stay separate from new registration.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

const routes = read('src/routes/publicRoutes.tsx');
const choice = read('src/pages/registration/RegistrationJourneyChoice.tsx');
const hook = read('src/hooks/useRegistrationJourneys.ts');
const account = read('src/pages/registration/UserAccountStep.tsx');
const legacy = read('src/routes/LegacyRegisterRedirect.tsx');
const registerPage = read('src/pages/Register.tsx');
const edge = read('supabase/functions/register-pre-licensee/index.ts');

describe('public registration routes', () => {
  it('exposes the canonical journey routes', () => {
    expect(routes).toContain('path="/register"');
    expect(routes).toContain('path="/register/applicant" element={<PreLicenseeRegistration />}');
    expect(routes).toContain('path="/register/entity" element={<EntityIdentification />}');
    expect(routes).toContain('path="/register/account" element={<UserAccountStep />}');
  });

  it('renders the decision page at /register, not a journey', () => {
    expect(registerPage).toContain('RegistrationJourneyChoice');
    expect(registerPage).not.toContain('UserAccountStep');
  });

  it('keeps /register/legacy as a compatibility alias to /register/applicant', () => {
    expect(routes).toContain('path="/register/legacy" element={<LegacyRegisterRedirect />}');
    expect(legacy).toContain('/register/applicant');
    expect(legacy).toContain('location.search');
    // legacy must no longer mount a second copy of the registration form
    expect(routes).not.toContain('path="/register/legacy" element={<PreLicenseeRegistration');
  });

  it('leaves update/resubmission routes untouched as continuation journeys', () => {
    expect(routes).toContain('path="/registration/portal"');
    expect(routes).toContain('path="/update-registration-form"');
    expect(routes).toContain('path="/registration/update/:registrationId"');
    expect(routes).toContain('<PreLicenseeRegistration mode="update" />');
  });
});

describe('governed journey catalogue is the control plane', () => {
  it('reads journeys from registration_journey_types with enabled/public filters and sort order', () => {
    expect(hook).toContain("from('registration_journey_types')");
    expect(hook).toContain("eq('is_enabled', true)");
    expect(hook).toContain("eq('is_public', true)");
    expect(hook).toContain("order('sort_order'");
    expect(hook).toContain('entry_route');
  });

  it('renders titles, descriptions and targets from configuration, not hard-coded routes', () => {
    expect(choice).toContain('useRegistrationJourneys');
    expect(choice).toContain('j.public_title');
    expect(choice).toContain('j.public_description');
    expect(choice).toContain('j.entry_route');
    // no hard-coded parallel catalogue of journey destinations
    expect(choice).not.toContain("to=\"/register/applicant\"");
    expect(choice).not.toContain("to=\"/register/entity\"");
  });

  it('fails safely when the catalogue is unavailable and never advertises legacy', () => {
    expect(choice).toContain('isError');
    expect(choice).toContain('Registration options are unavailable');
    expect(choice.toLowerCase()).not.toContain('/register/legacy');
    expect(choice).not.toContain('FORM_FIRST →');
  });

  it('keeps secondary links (sign in, continue existing) out of the journey list', () => {
    expect(choice).toContain('/login');
    expect(choice).toContain('/registration/portal');
  });

  it('avoids internal vocabulary in public copy', () => {
    const visible = choice.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const term of ['canonical UUID', 'provisional binding', 'entity-resolution token']) {
      expect(visible).not.toContain(term);
    }
  });
});

describe('account creation respects the selected journey', () => {
  it('returns the user to the journey they chose', () => {
    expect(account).toContain("journeyKey === 'FORM_FIRST' ? '/register/applicant' : '/register/entity'");
    expect(account).toContain('goToJourneyStep');
    expect(account).not.toContain("navigate(withIntentParam('/register/entity', intent))");
  });

  it('preserves the intended application through account creation', () => {
    expect(account).toContain('withIntentParam');
    expect(account).toContain('readIntentFromSearch');
  });

  it('reuses the existing governed OTP infrastructure', () => {
    expect(account).toContain('send-registration-otp');
    expect(account).toContain('verify-registration-otp');
  });
});

describe('FORM_FIRST is wired into governed entity resolution', () => {
  it('invokes the governed resolver after the registration is durably created', () => {
    expect(edge).toContain('onboarding_form_first_resolve_service');
    const insertIdx = edge.indexOf('from("registrations").insert');
    const resolveIdx = edge.indexOf('onboarding_form_first_resolve_service');
    expect(insertIdx).toBeGreaterThan(-1);
    expect(resolveIdx).toBeGreaterThan(insertIdx);
    expect(edge).toContain('_registration_id: regData.id');
  });

  it('never creates entities through direct table writes in the browser', () => {
    const client = read('src/pages/registration/PreLicenseeRegistration.tsx');
    expect(client).not.toContain("from('entities')");
    expect(client).not.toContain('from("entities")');
    expect(choice).not.toContain('entities');
  });
});
