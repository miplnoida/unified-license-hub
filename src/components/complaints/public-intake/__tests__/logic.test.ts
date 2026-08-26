import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  buildPayload,
  createInitialState,
  mapBackendFieldErrors,
  newRespondent,
  validateClientFile,
  validateStep,
} from '../logic';
import type { IntakeConfig, WizardState } from '../types';

const config = (overrides: Partial<IntakeConfig> = {}): IntakeConfig => ({
  ...DEFAULT_CONFIG,
  support_categories: [{ code: 'language', label: 'Language assistance' }],
  desired_outcome_options: [
    { code: 'refund', label: 'A refund' },
    { code: 'other', label: 'Something else' },
  ],
  ...overrides,
});

const base = (overrides: Partial<WizardState> = {}): WizardState => ({
  ...createInitialState(),
  ...overrides,
});

describe('step 1 — about you', () => {
  it('requires a name when anonymous filing is not offered', () => {
    expect(validateStep(1, base(), config())).toHaveProperty('filer_name');
  });

  it('accepts an anonymous filer when configuration allows it', () => {
    const errors = validateStep(1, base({ anonymous: true }), config({ allow_anonymous: true }));
    expect(errors.filer_name).toBeUndefined();
  });

  it('ignores the anonymous flag when configuration forbids it', () => {
    expect(validateStep(1, base({ anonymous: true }), config())).toHaveProperty('filer_name');
  });

  it('demands representative details, authority basis and confirmation', () => {
    const errors = validateStep(1, base({ filer_role: 'representative', filer_name: 'Ann Rep' }), config());
    expect(errors.affected_name).toBeDefined();
    expect(errors.relationship_to_consumer).toBeDefined();
    expect(errors.authority_basis).toBeDefined();
    expect(errors.authority_confirmed).toBeDefined();
  });

  it('passes a fully completed representative filing', () => {
    const errors = validateStep(
      1,
      base({
        filer_role: 'attorney_or_authorised_agent',
        filer_name: 'Ann Rep',
        filer_position: 'Attorney',
        affected_name: 'Joe Consumer',
        relationship_to_consumer: 'Client',
        authority_basis: 'Power of attorney',
        authority_confirmed: true,
      }),
      config(),
    );
    expect(errors).toEqual({});
  });

  it('keeps anonymous and confidential as separate choices', () => {
    const payload = buildPayload(
      base({ filer_name: 'Joe', confidential: true }),
      config({ allow_confidential: true }),
    );
    expect(payload.anonymous).toBe(false);
    expect(payload.parties[0].confidentiality).toBe('confidential');

    const anon = buildPayload(
      base({ filer_name: 'Joe', anonymous: true }),
      config({ allow_anonymous: true }),
    );
    expect(anon.anonymous).toBe(true);
    expect(anon.parties[0].full_name).toBeNull();
    expect(anon.parties[0].confidentiality).toBe('anonymous');
  });
});

describe('step 2 — contact and support', () => {
  it('requires a valid email only when email contact is chosen', () => {
    expect(validateStep(2, base({ preferred_method: 'email' }), config())).toHaveProperty('contact_email');
  });

  it('accepts a phone-only consumer with no email', () => {
    const errors = validateStep(2, base({ preferred_method: 'phone', contact_phone: '+1758 555 0100' }), config());
    expect(errors).toEqual({});
  });

  it('requires a phone number when phone contact is chosen', () => {
    expect(validateStep(2, base({ preferred_method: 'phone' }), config())).toHaveProperty('contact_phone');
  });

  it('requires a postal address when post is chosen, without demanding email', () => {
    const errors = validateStep(2, base({ preferred_method: 'post' }), config());
    expect(errors.postal_address_line1).toBeDefined();
    expect(errors.city).toBeDefined();
    expect(errors.contact_email).toBeUndefined();
  });

  it('accepts a complete postal consumer', () => {
    const errors = validateStep(
      2,
      base({ preferred_method: 'post', postal_address_line1: '1 Bay Street', city: 'Castries' }),
      config(),
    );
    expect(errors).toEqual({});
  });

  it('requires support categories once support is requested', () => {
    const errors = validateStep(2, base({ preferred_method: 'phone', contact_phone: '555', support_required: true }), config());
    expect(errors.support_categories).toBeDefined();
  });

  it('sends the support declaration only when categories are chosen', () => {
    const off = buildPayload(base({ support_required: true }), config());
    expect(off.support_declaration.support_required).toBe(false);
    const on = buildPayload(base({ support_required: true, support_categories: ['language'] }), config());
    expect(on.support_declaration.support_required).toBe(true);
    expect(on.support_declaration.categories).toEqual(['language']);
  });
});

describe('step 3 — respondents', () => {
  it('requires a register selection for a regulated business', () => {
    expect(validateStep(3, base(), config())).toHaveProperty('respondent_0_business');
  });

  it('accepts an unmatched business identified by any detail, with no licensee id', () => {
    const state = base({
      respondents: [{ ...newRespondent('not_found'), legal_name: 'QuickCash Loans Online' }],
    });
    expect(validateStep(3, state, config())).toEqual({});
    const payload = buildPayload(state, config());
    expect(payload.respondents[0].licensee_id).toBeNull();
    expect(payload.respondents[0].match_state).toBe('UNMATCHED');
    expect(payload.respondents[0].legal_name).toBe('QuickCash Loans Online');
  });

  it('maps a suspected unauthorised provider without fabricating a licensee', () => {
    const state = base({
      respondents: [{ ...newRespondent('unauthorised'), website: 'fastloans.example' }],
    });
    expect(validateStep(3, state, config())).toEqual({});
    const payload = buildPayload(state, config());
    expect(payload.respondents[0].match_state).toBe('SUSPECTED_UNAUTHORISED');
    expect(payload.respondents[0].licensee_id).toBeNull();
  });

  it('supports multiple respondents and marks only the first as primary', () => {
    const state = base({
      respondents: [
        { ...newRespondent('regulated'), licensee_id: 'lic-1', selected_name: 'Apex Bank' },
        { ...newRespondent('intermediary'), legal_name: 'Island Brokers', agent_name: 'A. Broker' },
      ],
    });
    expect(validateStep(3, state, config())).toEqual({});
    const payload = buildPayload(state, config());
    expect(payload.respondents.map((r) => r.is_primary)).toEqual([true, false]);
    expect(payload.respondents[0].match_state).toBe('MATCHED_REGULATED');
    expect(payload.respondents[1].match_state).toBe('INTERMEDIARY');
    expect(payload.respondents[1].respondent_role).toBe('intermediary');
  });

  it('keeps previously regulated respondents matched to their licence holder', () => {
    const state = base({
      respondents: [{ ...newRespondent('previously_regulated'), licensee_id: 'lic-9', selected_name: 'Old Trust Co' }],
    });
    const payload = buildPayload(state, config());
    expect(payload.respondents[0].match_state).toBe('MATCHED_PREVIOUSLY_REGULATED');
    expect(payload.respondents[0].licensee_id).toBe('lic-9');
  });
});

describe('step 5 — what happened', () => {
  const valid = { subject: 'Charges applied without notice', description: 'x'.repeat(40) };

  it('requires a summary and a narrative of reasonable length', () => {
    const errors = validateStep(5, base({ subject: 'abc', description: 'too short' }), config());
    expect(errors.subject).toBeDefined();
    expect(errors.description).toBeDefined();
  });

  it('rejects future and inverted incident dates', () => {
    const future = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    expect(validateStep(5, base({ ...valid, incident_date: future }), config())).toHaveProperty('incident_date');
    const errors = validateStep(
      5,
      base({ ...valid, incident_date: '2026-05-10', incident_date_to: '2026-05-01' }),
      config(),
    );
    expect(errors.incident_date_to).toBeDefined();
  });

  it('accepts a valid incident range', () => {
    const errors = validateStep(
      5,
      base({ ...valid, incident_date: '2026-05-01', incident_date_to: '2026-05-10', is_ongoing: true }),
      config(),
    );
    expect(errors).toEqual({});
  });

  it('submits the consumer narrative unchanged', () => {
    const narrative = 'They took $250 from my account.\n\nNobody called me back.';
    const payload = buildPayload(base({ description: narrative }), config());
    expect(payload.description).toBe(narrative);
  });
});

describe('step 6 — prior contact with the business', () => {
  it('only sends prior-complaint details when the consumer raised it', () => {
    const off = buildPayload(base({ entity_complaint_reference: 'BUS-1' }), config());
    expect(off.intake_details.raised_with_entity).toBe(false);
    expect(off.intake_details.entity_complaint_reference).toBeNull();

    const on = buildPayload(
      base({
        raised_with_entity: true,
        entity_complaint_reference: 'BUS-1',
        acknowledgement_received: 'yes',
        final_response_received: 'no',
        redress_accepted: 'unsure',
      }),
      config(),
    );
    expect(on.intake_details.entity_complaint_reference).toBe('BUS-1');
    expect(on.intake_details.acknowledgement_received).toBe(true);
    expect(on.intake_details.final_response_received).toBe(false);
    expect(on.intake_details.redress_accepted).toBeNull();
  });

  it('rejects future prior-complaint dates', () => {
    const future = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const errors = validateStep(6, base({ raised_with_entity: true, raised_with_entity_date: future }), config());
    expect(errors.raised_with_entity_date).toBeDefined();
  });
});

describe('attachments — client screening', () => {
  it('rejects oversized, empty and unsupported files but accepts a valid PDF', () => {
    const cfg = config({ max_attachments: 2, max_attachment_bytes: 1024 });
    expect(validateClientFile({ name: 'big.pdf', size: 2048, type: 'application/pdf' }, 0, cfg)).toMatch(/larger/);
    expect(validateClientFile({ name: 'empty.pdf', size: 0, type: 'application/pdf' }, 0, cfg)).toMatch(/empty/);
    expect(validateClientFile({ name: 'app.exe', size: 100, type: 'application/x-msdownload' }, 0, cfg)).toMatch(/can accept/);
    expect(validateClientFile({ name: 'ok.pdf', size: 500, type: 'application/pdf' }, 0, cfg)).toBeNull();
  });

  it('respects the configured attachment count', () => {
    const cfg = config({ max_attachments: 1 });
    expect(validateClientFile({ name: 'a.pdf', size: 10, type: 'application/pdf' }, 1, cfg)).toMatch(/up to 1 files/);
  });
});

describe('step 7 — outcome and declarations', () => {
  it('requires an outcome, both acknowledgements and the declaration', () => {
    const errors = validateStep(7, base(), config());
    expect(errors.desired_outcomes).toBeDefined();
    expect(errors.privacy_notice_acknowledged).toBeDefined();
    expect(errors.information_sharing_acknowledged).toBeDefined();
    expect(errors.declaration_accepted).toBeDefined();
    expect(errors.respondent_contact_permitted).toBeDefined();
  });

  it('requires a description when "something else" is chosen', () => {
    const errors = validateStep(7, base({ desired_outcomes: ['other'] }), config());
    expect(errors.desired_outcome_other).toBeDefined();
  });

  it('passes a complete final step', () => {
    const errors = validateStep(
      7,
      base({
        desired_outcomes: ['refund'],
        privacy_notice_acknowledged: true,
        information_sharing_acknowledged: true,
        declaration_accepted: true,
        respondent_contact_permitted: 'yes',
      }),
      config(),
    );
    expect(errors).toEqual({});
  });

  it('skips the respondent contact question when configuration does not require it', () => {
    const errors = validateStep(
      7,
      base({
        desired_outcomes: ['refund'],
        privacy_notice_acknowledged: true,
        information_sharing_acknowledged: true,
        declaration_accepted: true,
      }),
      config({ require_respondent_contact_permission: false }),
    );
    expect(errors).toEqual({});
  });

  it('carries the configured privacy notice version through the payload', () => {
    const payload = buildPayload(base({ declaration_accepted: true }), config({ privacy_notice_version: 'v2.3' }));
    expect(payload.intake_details.privacy_notice_version).toBe('v2.3');
    expect(payload.intake_details.declaration_accepted).toBe(true);
  });
});

describe('payload shape', () => {
  it('keeps structured data out of the narrative', () => {
    const payload = buildPayload(
      base({
        description: 'What happened, in my words.',
        subject: 'Unexpected charges',
        desired_outcomes: ['refund'],
        respondents: [{ ...newRespondent('not_found'), legal_name: 'QuickCash' }],
      }),
      config(),
    );
    expect(payload.description).toBe('What happened, in my words.');
    expect(payload).not.toHaveProperty('product_service');
    expect(payload).not.toHaveProperty('outcome_sought');
    expect(payload).not.toHaveProperty('entity_response');
    expect(payload.intake_details.desired_outcomes).toEqual(['refund']);
    expect(payload.contact_preference).toBeDefined();
    expect(payload.support_declaration).toBeDefined();
  });
});

describe('backend field errors', () => {
  it('maps aliases and returns the earliest owning step', () => {
    const { errors, firstStep } = mapBackendFieldErrors({
      email: 'A valid email address is required for contact by email.',
      declaration_accepted: 'Please confirm your declaration.',
    });
    expect(errors.contact_email).toBeDefined();
    expect(errors.declaration_accepted).toBeDefined();
    expect(firstStep).toBe(2);
  });

  it('routes respondent errors back to step 3', () => {
    const { firstStep } = mapBackendFieldErrors({ respondents: 'Please tell us who the complaint is about.' });
    expect(firstStep).toBe(3);
  });
});
