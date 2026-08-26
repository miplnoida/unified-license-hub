/**
 * MC-01 public complaint intake — shared types.
 *
 * These types mirror the live contract exposed by the
 * `public-complaint-intake` edge function (GET ?action=config / types /
 * taxonomy / entities, POST submission). Nothing here is authoritative: the
 * governed RPC behind the function remains the source of truth.
 */

export type OptionRow = { code: string; label: string };

export interface IntakeConfig {
  captcha: { required: boolean; misconfigured: boolean };
  allow_anonymous: boolean;
  allow_confidential: boolean;
  support_categories: OptionRow[];
  desired_outcome_options: OptionRow[];
  channel_options: OptionRow[];
  privacy_notice_version: string;
  privacy_notice_text: string | null;
  declaration_text: string | null;
  require_respondent_contact_permission: boolean;
  max_attachments: number;
  max_attachment_bytes: number;
}

export interface TaxonomyRow { id: string; name: string }

export interface Taxonomy {
  products: TaxonomyRow[];
  channels: TaxonomyRow[];
  sectors: TaxonomyRow[];
  channel_options: OptionRow[];
}

export interface EntityRow {
  id: string;
  name: string;
  sector_name: string | null;
  regulated_state: 'currently_regulated' | 'previously_regulated';
  regulated_label: string;
}

/** Who is lodging the complaint (step 1). */
export type FilerRole =
  | 'affected_consumer'
  | 'representative'
  | 'business_representative'
  | 'attorney_or_authorised_agent'
  | 'guardian_or_carer'
  | 'other_authorised_representative';

/** How the consumer describes the business the complaint is about (step 3). */
export type RespondentKind =
  | 'regulated'
  | 'previously_regulated'
  | 'not_found'
  | 'unsure'
  | 'unauthorised'
  | 'intermediary';

export interface RespondentDraft {
  key: string;
  kind: RespondentKind;
  /** Set only when the consumer picked a business from the register. */
  licensee_id: string | null;
  selected_name: string | null;
  selected_state: EntityRow['regulated_state'] | null;
  legal_name: string;
  trading_name: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  online_reference: string;
  service_offered: string;
  agent_name: string;
  related_principal_licensee_id: string | null;
  related_principal_name: string;
  consumer_notes: string;
}

export interface StagedFile {
  key: string;
  name: string;
  content_type: string;
  size: number;
  data: string;
}

export interface WizardState {
  // Step 1
  filer_role: FilerRole;
  anonymous: boolean;
  confidential: boolean;
  filer_name: string;
  filer_email: string;
  filer_phone: string;
  filer_business_name: string;
  filer_position: string;
  relationship_to_consumer: string;
  authority_basis: string;
  authority_confirmed: boolean;
  affected_name: string;
  affected_email: string;
  affected_phone: string;

  // Step 2
  preferred_method: 'email' | 'phone' | 'post' | '';
  alternative_method: 'email' | 'phone' | 'post' | 'none';
  contact_email: string;
  contact_phone: string;
  postal_address_line1: string;
  postal_address_line2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  preferred_language: string;
  accessibility_needs: string;
  safe_contact_instructions: string;
  support_required: boolean;
  support_categories: string[];
  support_notes: string;

  // Step 3
  respondents: RespondentDraft[];

  // Step 4
  sector_id: string;
  product_id: string;
  product_other: string;
  service_description: string;
  channel_id: string;
  channel_code: string;
  channel_other: string;
  customer_segment: string;
  complaint_type_id: string;

  // Step 5
  subject: string;
  description: string;
  incident_date: string;
  incident_date_to: string;
  is_ongoing: boolean;
  location: string;
  transaction_reference: string;
  amount_involved: string;
  currency: string;
  amount_disputed: string;
  claimed_loss: string;
  continuing_loss: boolean;
  urgent_funds_access: boolean;
  suspected_fraud: boolean;

  // Step 6
  raised_with_entity: boolean;
  entity_complaint_reference: string;
  raised_with_entity_date: string;
  raised_with_entity_channel: string;
  acknowledgement_received: 'yes' | 'no' | 'unsure';
  final_response_received: 'yes' | 'no' | 'unsure';
  final_response_date: string;
  outcome_offered: string;
  redress_offered: string;
  redress_offered_amount: string;
  redress_accepted: 'yes' | 'no' | 'unsure';
  still_dissatisfied_reason: string;
  attachments: StagedFile[];

  // Step 7
  desired_outcomes: string[];
  desired_outcome_other: string;
  desired_amount: string;
  privacy_notice_acknowledged: boolean;
  declaration_accepted: boolean;
  information_sharing_acknowledged: boolean;
  respondent_contact_permitted: 'yes' | 'no' | '';
}

export interface SubmissionResult {
  reference: string | null;
  tracking_access_code: string | null;
  submitted_at: string;
  duplicate: boolean;
  attachment_warnings: string[];
}
