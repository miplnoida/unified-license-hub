/**
 * MC-01 public complaint intake — pure wizard logic.
 *
 * Kept free of React so the conditional rules (who is filing, which contact
 * details are required, unmatched respondents, declarations) can be unit
 * tested. The server remains authoritative for every rule expressed here.
 */
import type {
  FilerRole,
  IntakeConfig,
  RespondentDraft,
  RespondentKind,
  StagedFile,
  WizardState,
} from './types';

export const STEP_TITLES = [
  'About you',
  'How we can contact and support you',
  'Who the complaint is about',
  'Product, service and how you dealt with them',
  'What happened',
  'What you have already done',
  'What outcome you are seeking',
] as const;

export const TOTAL_STEPS = STEP_TITLES.length;

export const FILER_ROLE_OPTIONS: Array<{ value: FilerRole; label: string }> = [
  { value: 'affected_consumer', label: 'I am the person affected' },
  { value: 'representative', label: 'I am making the complaint for someone else' },
  { value: 'business_representative', label: 'I represent a business' },
  { value: 'attorney_or_authorised_agent', label: 'I am an attorney or authorised representative' },
  { value: 'guardian_or_carer', label: 'I am a guardian or carer' },
  { value: 'other_authorised_representative', label: 'Other authorised representative' },
];

export const RESPONDENT_KIND_OPTIONS: Array<{ value: RespondentKind; label: string; help: string }> = [
  {
    value: 'regulated',
    label: 'A business we currently regulate',
    help: 'Search our register and choose the business.',
  },
  {
    value: 'previously_regulated',
    label: 'A business we regulated in the past',
    help: 'Being previously regulated does not mean the business has done anything wrong.',
  },
  {
    value: 'not_found',
    label: 'I cannot find the business in the list',
    help: 'Tell us as much as you know about them instead.',
  },
  {
    value: 'unsure',
    label: 'I am unsure whether the business is regulated',
    help: 'That is fine — we will check for you.',
  },
  {
    value: 'unauthorised',
    label: 'I believe it may be providing services without authorisation',
    help: 'Give us any details you have, including websites or social media accounts.',
  },
  {
    value: 'intermediary',
    label: 'An agent, broker or intermediary',
    help: 'You can also tell us the main business they act for, if you know it.',
  },
];

const MATCH_STATE_BY_KIND: Record<RespondentKind, string> = {
  regulated: 'MATCHED_REGULATED',
  previously_regulated: 'MATCHED_PREVIOUSLY_REGULATED',
  not_found: 'UNMATCHED',
  unsure: 'PENDING_MATCH',
  unauthorised: 'SUSPECTED_UNAUTHORISED',
  intermediary: 'INTERMEDIARY',
};

export const CUSTOMER_SEGMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'individual', label: 'Personal customer' },
  { value: 'joint', label: 'Joint customer' },
  { value: 'sole_trader', label: 'Sole trader' },
  { value: 'small_business', label: 'Small business' },
  { value: 'not_a_customer', label: 'I was not a customer' },
  { value: 'unsure', label: 'Not sure' },
];

export const CONTACT_METHOD_OPTIONS: Array<{ value: 'email' | 'phone' | 'post'; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'post', label: 'Post' },
];

export const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const ACCEPTED_FILE_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx';

export const DEFAULT_CONFIG: IntakeConfig = {
  captcha: { required: false, misconfigured: false },
  allow_anonymous: false,
  allow_confidential: true,
  support_categories: [],
  desired_outcome_options: [],
  channel_options: [],
  privacy_notice_version: 'v1.0',
  privacy_notice_text: null,
  declaration_text: null,
  require_respondent_contact_permission: true,
  max_attachments: 5,
  max_attachment_bytes: 5 * 1024 * 1024,
};

let respondentSeq = 0;
export function newRespondent(kind: RespondentKind = 'regulated'): RespondentDraft {
  respondentSeq += 1;
  return {
    key: `r${respondentSeq}`,
    kind,
    licensee_id: null,
    selected_name: null,
    selected_state: null,
    legal_name: '',
    trading_name: '',
    website: '',
    email: '',
    phone: '',
    address: '',
    country: '',
    online_reference: '',
    service_offered: '',
    agent_name: '',
    related_principal_licensee_id: null,
    related_principal_name: '',
    consumer_notes: '',
  };
}

export function createInitialState(): WizardState {
  return {
    filer_role: 'affected_consumer',
    anonymous: false,
    confidential: false,
    filer_name: '',
    filer_email: '',
    filer_phone: '',
    filer_business_name: '',
    filer_position: '',
    relationship_to_consumer: '',
    authority_basis: '',
    authority_confirmed: false,
    affected_name: '',
    affected_email: '',
    affected_phone: '',

    preferred_method: 'email',
    alternative_method: 'none',
    contact_email: '',
    contact_phone: '',
    postal_address_line1: '',
    postal_address_line2: '',
    city: '',
    region: '',
    postal_code: '',
    country: '',
    preferred_language: 'English',
    accessibility_needs: '',
    safe_contact_instructions: '',
    support_required: false,
    support_categories: [],
    support_notes: '',

    respondents: [newRespondent('regulated')],

    sector_id: '',
    product_id: '',
    product_other: '',
    service_description: '',
    channel_id: '',
    channel_code: '',
    channel_other: '',
    customer_segment: '',
    complaint_type_id: '',

    subject: '',
    description: '',
    incident_date: '',
    incident_date_to: '',
    is_ongoing: false,
    location: '',
    transaction_reference: '',
    amount_involved: '',
    currency: 'XCD',
    amount_disputed: '',
    claimed_loss: '',
    continuing_loss: false,
    urgent_funds_access: false,
    suspected_fraud: false,

    raised_with_entity: false,
    entity_complaint_reference: '',
    raised_with_entity_date: '',
    raised_with_entity_channel: '',
    acknowledgement_received: 'unsure',
    final_response_received: 'unsure',
    final_response_date: '',
    outcome_offered: '',
    redress_offered: '',
    redress_offered_amount: '',
    redress_accepted: 'unsure',
    still_dissatisfied_reason: '',
    attachments: [],

    desired_outcomes: [],
    desired_outcome_other: '',
    desired_amount: '',
    privacy_notice_acknowledged: false,
    declaration_accepted: false,
    information_sharing_acknowledged: false,
    respondent_contact_permitted: '',
  };
}

export const isRepresentativeRole = (role: FilerRole) => role !== 'affected_consumer';
export const needsPositionTitle = (role: FilerRole) =>
  role === 'business_representative' || role === 'attorney_or_authorised_agent';
export const needsAuthority = (role: FilerRole) => isRepresentativeRole(role);
export const respondentNeedsSearch = (kind: RespondentKind) =>
  kind === 'regulated' || kind === 'previously_regulated';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const trimmed = (v: string | null | undefined) => (v ?? '').trim();
export const isEmail = (v: string) => EMAIL_RE.test(trimmed(v));

export function respondentDisplayName(r: RespondentDraft): string {
  return (
    trimmed(r.selected_name) ||
    trimmed(r.legal_name) ||
    trimmed(r.trading_name) ||
    trimmed(r.agent_name) ||
    'Business not yet identified'
  );
}

/** Field-level validation for a single wizard step. Empty object = step may advance. */
export function validateStep(step: number, s: WizardState, config: IntakeConfig): Record<string, string> {
  const e: Record<string, string> = {};

  if (step === 1) {
    const anonymous = config.allow_anonymous && s.anonymous;
    if (!anonymous && !trimmed(s.filer_name)) {
      e.filer_name = 'Please tell us your name, or choose to file anonymously if that option is offered.';
    }
    if (isRepresentativeRole(s.filer_role)) {
      if (s.filer_role !== 'business_representative' && !trimmed(s.affected_name) && !anonymous) {
        e.affected_name = 'Please tell us who the complaint is being made for.';
      }
      if (!trimmed(s.relationship_to_consumer) && s.filer_role !== 'business_representative') {
        e.relationship_to_consumer = 'Please tell us your relationship to the person affected.';
      }
      if (needsPositionTitle(s.filer_role) && !trimmed(s.filer_position)) {
        e.filer_position = 'Please give your position or title.';
      }
      if (s.filer_role === 'business_representative' && !trimmed(s.filer_business_name)) {
        e.filer_business_name = 'Please give the name of the business you represent.';
      }
      if (!trimmed(s.authority_basis)) {
        e.authority_basis = 'Please tell us on what basis you are acting.';
      }
      if (!s.authority_confirmed) {
        e.authority_confirmed = 'Please confirm you are authorised to make this complaint.';
      }
    }
  }

  if (step === 2) {
    if (!s.preferred_method) {
      e.preferred_method = 'Please choose how you would like us to contact you.';
    }
    if (s.preferred_method === 'email' && !isEmail(s.contact_email)) {
      e.contact_email = 'Please give a valid email address so we can contact you by email.';
    }
    if (s.preferred_method === 'phone' && !trimmed(s.contact_phone)) {
      e.contact_phone = 'Please give a phone number so we can contact you by phone.';
    }
    if (s.preferred_method === 'post') {
      if (!trimmed(s.postal_address_line1)) e.postal_address_line1 = 'Please give your street address.';
      if (!trimmed(s.city)) e.city = 'Please give your town or city.';
    }
    if (s.alternative_method === 'email' && !isEmail(s.contact_email)) {
      e.contact_email = 'Please give a valid email address, or choose a different alternative method.';
    }
    if (s.alternative_method === 'phone' && !trimmed(s.contact_phone)) {
      e.contact_phone = 'Please give a phone number, or choose a different alternative method.';
    }
    if (s.support_required && s.support_categories.length === 0) {
      e.support_categories = 'Please tell us what kind of support you need.';
    }
  }

  if (step === 3) {
    if (s.respondents.length === 0) {
      e.respondents = 'Please tell us who your complaint is about.';
    }
    s.respondents.forEach((r, i) => {
      if (respondentNeedsSearch(r.kind)) {
        if (!r.licensee_id) e[`respondent_${i}_business`] = 'Please choose a business from the list.';
      } else if (!trimmed(r.legal_name) && !trimmed(r.trading_name) && !trimmed(r.website) && !trimmed(r.online_reference)) {
        e[`respondent_${i}_business`] =
          'Please give a name, website or other detail so we can identify the business.';
      }
    });
  }

  if (step === 5) {
    if (trimmed(s.subject).length < 5) e.subject = 'Please give a short summary of your complaint.';
    if (trimmed(s.description).length < 30) {
      e.description = 'Please describe what happened, using at least 30 characters.';
    }
    const today = new Date().toISOString().slice(0, 10);
    if (s.incident_date && s.incident_date > today) e.incident_date = 'The date cannot be in the future.';
    if (s.incident_date_to && s.incident_date_to > today) e.incident_date_to = 'The date cannot be in the future.';
    if (s.incident_date && s.incident_date_to && s.incident_date_to < s.incident_date) {
      e.incident_date_to = 'The end date cannot be before the start date.';
    }
  }

  if (step === 6) {
    if (s.raised_with_entity) {
      const today = new Date().toISOString().slice(0, 10);
      if (s.raised_with_entity_date && s.raised_with_entity_date > today) {
        e.raised_with_entity_date = 'The date cannot be in the future.';
      }
      if (s.final_response_date && s.final_response_date > today) {
        e.final_response_date = 'The date cannot be in the future.';
      }
    }
  }

  if (step === 7) {
    if (s.desired_outcomes.length === 0) {
      e.desired_outcomes = 'Please tell us what outcome you are hoping for.';
    }
    if (s.desired_outcomes.includes('other') && !trimmed(s.desired_outcome_other)) {
      e.desired_outcome_other = 'Please describe the outcome you are seeking.';
    }
    if (!s.privacy_notice_acknowledged) {
      e.privacy_notice_acknowledged = 'Please confirm you have read how we use your information.';
    }
    if (!s.information_sharing_acknowledged) {
      e.information_sharing_acknowledged =
        'Please confirm you understand we may share details with the business concerned.';
    }
    if (!s.declaration_accepted) e.declaration_accepted = 'Please confirm your declaration.';
    if (config.require_respondent_contact_permission && !s.respondent_contact_permitted) {
      e.respondent_contact_permitted = 'Please tell us whether we may contact the business about your complaint.';
    }
  }

  return e;
}

/** Client-side file screening for a good experience. The server re-checks everything. */
export function validateClientFile(
  file: { name: string; size: number; type: string },
  currentCount: number,
  config: IntakeConfig,
): string | null {
  if (currentCount >= config.max_attachments) {
    return `You can attach up to ${config.max_attachments} files.`;
  }
  if (file.size > config.max_attachment_bytes) {
    return `${file.name} is larger than the ${formatBytes(config.max_attachment_bytes)} limit.`;
  }
  if (file.size === 0) return `${file.name} appears to be empty.`;
  if (file.type && !ACCEPTED_FILE_TYPES.includes(file.type)) {
    return `${file.name} is not a file type we can accept.`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

const orNull = (v: string) => (trimmed(v) ? trimmed(v) : null);
const triState = (v: 'yes' | 'no' | 'unsure' | '') => (v === 'yes' ? true : v === 'no' ? false : null);

/**
 * Maps wizard state onto the structured MC-01 submission contract.
 * Structured information is never flattened back into the narrative.
 */
export function buildPayload(
  s: WizardState,
  config: IntakeConfig,
  extras: { captchaVerificationId?: string | null; idempotencyKey?: string | null } = {},
) {
  const anonymous = config.allow_anonymous && s.anonymous;
  const confidentiality = anonymous
    ? 'anonymous'
    : config.allow_confidential && s.confidential
      ? 'confidential'
      : 'standard';

  const isRep = isRepresentativeRole(s.filer_role);
  const parties: Array<Record<string, unknown>> = [];

  parties.push({
    party_role: isRep ? s.filer_role : 'affected_consumer',
    party_type: s.filer_role === 'business_representative' ? 'business' : 'individual',
    is_primary_contact: true,
    full_name: anonymous ? null : orNull(s.filer_name),
    business_name: orNull(s.filer_business_name),
    position_or_title: orNull(s.filer_position),
    relationship_to_consumer: orNull(s.relationship_to_consumer),
    authority_basis: orNull(s.authority_basis),
    authority_confirmed: isRep ? s.authority_confirmed : false,
    email: anonymous ? null : orNull(s.filer_email || s.contact_email),
    phone: anonymous ? null : orNull(s.filer_phone || s.contact_phone),
    confidentiality,
  });

  if (isRep && (trimmed(s.affected_name) || trimmed(s.affected_email) || trimmed(s.affected_phone))) {
    parties.push({
      party_role: 'affected_consumer',
      party_type: s.filer_role === 'business_representative' ? 'business' : 'individual',
      is_primary_contact: false,
      full_name: anonymous ? null : orNull(s.affected_name),
      email: anonymous ? null : orNull(s.affected_email),
      phone: anonymous ? null : orNull(s.affected_phone),
      relationship_to_consumer: orNull(s.relationship_to_consumer),
      confidentiality,
    });
  }

  const respondents = s.respondents.map((r, i) => ({
    is_primary: i === 0,
    match_state: MATCH_STATE_BY_KIND[r.kind],
    respondent_role: r.kind === 'intermediary' ? 'intermediary' : 'provider',
    // Never fabricate a licensee id for a business the consumer could not match.
    licensee_id: respondentNeedsSearch(r.kind) ? r.licensee_id : null,
    legal_name: respondentNeedsSearch(r.kind) ? orNull(r.selected_name ?? '') : orNull(r.legal_name),
    trading_name: orNull(r.trading_name),
    website: orNull(r.website),
    email: orNull(r.email),
    phone: orNull(r.phone),
    address: orNull(r.address),
    country: orNull(r.country),
    online_reference: orNull(r.online_reference),
    service_offered: orNull(r.service_offered),
    agent_name: orNull(r.agent_name),
    related_principal_licensee_id: r.related_principal_licensee_id,
    related_principal_name: orNull(r.related_principal_name),
    consumer_notes: orNull(r.consumer_notes),
  }));

  return {
    subject: trimmed(s.subject),
    // The consumer's own words, submitted exactly as entered.
    description: s.description.trim(),
    anonymous,
    complaint_type_id: orNull(s.complaint_type_id),
    parties,
    respondents,
    contact_preference: {
      preferred_method: s.preferred_method,
      alternative_method: s.alternative_method === 'none' ? null : s.alternative_method,
      email: orNull(s.contact_email),
      phone: orNull(s.contact_phone),
      postal_address_line1: orNull(s.postal_address_line1),
      postal_address_line2: orNull(s.postal_address_line2),
      city: orNull(s.city),
      region: orNull(s.region),
      postal_code: orNull(s.postal_code),
      country: orNull(s.country),
      preferred_language: orNull(s.preferred_language) ?? 'English',
      accessibility_needs: orNull(s.accessibility_needs),
      safe_contact_instructions: orNull(s.safe_contact_instructions),
    },
    support_declaration: {
      support_required: s.support_required && s.support_categories.length > 0,
      categories: s.support_categories,
      consumer_notes: orNull(s.support_notes),
    },
    intake_details: {
      sector_id: orNull(s.sector_id),
      product_id: orNull(s.product_id),
      product_other: orNull(s.product_other),
      service_description: orNull(s.service_description),
      channel_id: orNull(s.channel_id),
      channel_code: orNull(s.channel_code),
      channel_other: orNull(s.channel_other),
      customer_segment: orNull(s.customer_segment),
      incident_date: orNull(s.incident_date),
      incident_date_to: orNull(s.incident_date_to),
      is_ongoing: s.is_ongoing,
      location: orNull(s.location),
      transaction_reference: orNull(s.transaction_reference),
      amount_involved: orNull(s.amount_involved),
      currency: orNull(s.currency) ?? 'XCD',
      amount_disputed: orNull(s.amount_disputed),
      claimed_loss: orNull(s.claimed_loss),
      continuing_loss: s.continuing_loss,
      urgent_funds_access: s.urgent_funds_access,
      suspected_fraud: s.suspected_fraud,
      raised_with_entity: s.raised_with_entity,
      entity_complaint_reference: s.raised_with_entity ? orNull(s.entity_complaint_reference) : null,
      raised_with_entity_date: s.raised_with_entity ? orNull(s.raised_with_entity_date) : null,
      raised_with_entity_channel: s.raised_with_entity ? orNull(s.raised_with_entity_channel) : null,
      acknowledgement_received: s.raised_with_entity ? triState(s.acknowledgement_received) : null,
      final_response_received: s.raised_with_entity ? triState(s.final_response_received) : null,
      final_response_date: s.raised_with_entity ? orNull(s.final_response_date) : null,
      outcome_offered: s.raised_with_entity ? orNull(s.outcome_offered) : null,
      redress_offered: s.raised_with_entity ? orNull(s.redress_offered) : null,
      redress_offered_amount: s.raised_with_entity ? orNull(s.redress_offered_amount) : null,
      redress_accepted: s.raised_with_entity ? triState(s.redress_accepted) : null,
      still_dissatisfied_reason: orNull(s.still_dissatisfied_reason),
      desired_outcomes: s.desired_outcomes,
      desired_outcome_other: orNull(s.desired_outcome_other),
      desired_amount: orNull(s.desired_amount),
      declaration_accepted: s.declaration_accepted,
      privacy_notice_version: config.privacy_notice_version,
      privacy_notice_acknowledged: s.privacy_notice_acknowledged,
      information_sharing_acknowledged: s.information_sharing_acknowledged,
      respondent_contact_permitted: s.respondent_contact_permitted
        ? s.respondent_contact_permitted === 'yes'
        : null,
    },
    attachments: s.attachments.map((f: StagedFile) => ({
      name: f.name,
      content_type: f.content_type,
      data: f.data,
    })),
    captcha_verification_id: extras.captchaVerificationId ?? null,
    idempotency_key: extras.idempotencyKey ?? null,
  };
}

/** Maps a backend field error key back to the wizard step that owns it. */
const FIELD_STEP: Record<string, number> = {
  filer_name: 1,
  authority_basis: 1,
  authority_confirmed: 1,
  affected_name: 1,
  preferred_method: 2,
  email: 2,
  contact_email: 2,
  phone: 2,
  contact_phone: 2,
  postal_address_line1: 2,
  city: 2,
  support_categories: 2,
  respondents: 3,
  subject: 5,
  description: 5,
  incident_date: 5,
  declaration_accepted: 7,
  privacy_notice_acknowledged: 7,
  desired_outcomes: 7,
};

export function stepForBackendField(field: string): number {
  if (FIELD_STEP[field]) return FIELD_STEP[field];
  if (field.startsWith('respondent')) return 3;
  if (field.startsWith('party') || field.startsWith('parties')) return 1;
  if (field.startsWith('contact')) return 2;
  return 7;
}

/** Normalises backend field errors into wizard field keys. */
export function mapBackendFieldErrors(fields: Record<string, string>): {
  errors: Record<string, string>;
  firstStep: number;
} {
  const alias: Record<string, string> = { email: 'contact_email', phone: 'contact_phone' };
  const errors: Record<string, string> = {};
  let firstStep: number = TOTAL_STEPS;
  for (const [field, message] of Object.entries(fields)) {
    errors[alias[field] ?? field] = message;
    firstStep = Math.min(firstStep, stepForBackendField(field));
  }
  return { errors, firstStep };
}
