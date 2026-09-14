/**
 * Plain-language vocabulary for the supervisory policy component editors.
 *
 * The field list itself always comes from the server's published content
 * contract. This file only supplies the regulator-facing wording for those
 * fields, and an honest statement of what each policy area does today. Nothing
 * here decides validity, authority or runtime behaviour.
 */

export interface AreaCopy {
  /** One sentence: what a regulator is configuring on this screen. */
  purpose: string;
  /** How the platform uses it today. */
  effect: string;
  /** True when supervision reads this area at runtime. */
  consumed: boolean;
}

export const AREA_COPY: Record<string, AreaCopy> = {
  EVIDENCE_POLICY: {
    purpose: 'The evidence an officer must attach before an assessment can be submitted.',
    effect: 'Used live: the assessment working file and submission checks apply these rules.',
    consumed: true,
  },
  JUDGEMENT_POLICY: {
    purpose: 'When an officer may depart from the calculated rating, by how much, and with whose approval.',
    effect: 'Used live: rating overrides are checked against these rules and refused when not permitted.',
    consumed: true,
  },
  RESPONSE_POLICY: {
    purpose: 'The supervisory responses expected, allowed or forbidden for each risk rating.',
    effect: 'Used live: recording a supervisory consequence is checked against these rules.',
    consumed: true,
  },
  SLA_POLICY: {
    purpose: 'How long each stage of supervisory work may take, and how breaches escalate.',
    effect: 'Used live: deadlines, pauses, breaches and escalation are calculated from these stages.',
    consumed: true,
  },
  SECTOR_OVERLAY: {
    purpose: 'Which sectors this policy package applies to, and where it applies with modifications.',
    effect: 'Recorded and governed, but supervision does not yet read it. It documents intent only.',
    consumed: false,
  },
  FACT_CONFIG: {
    purpose: 'The facts officers must record, and the form each fact takes.',
    effect: 'Recorded and governed, but the assessment fact register still follows the methodology.',
    consumed: false,
  },
  SOURCE_BINDING: {
    purpose: 'Where each fact is expected to come from — a return, a form, or manual entry.',
    effect: 'Recorded and governed, but facts are not yet pre-filled from these sources.',
    consumed: false,
  },
  MATERIALITY_POLICY: {
    purpose: 'The size thresholds at which a measure becomes material for supervision.',
    effect: 'Recorded and governed, but calculation still uses the methodology thresholds.',
    consumed: false,
  },
  DASHBOARD_POLICY: {
    purpose: 'The tiles each audience should see on supervisory dashboards.',
    effect: 'Recorded and governed, but dashboards are not yet built from it.',
    consumed: false,
  },
  NOTIFICATION_POLICY: {
    purpose: 'Who is told, and how, when a supervisory event happens.',
    effect: 'Recorded and governed, but notifications are still sent by the platform rules.',
    consumed: false,
  },
};

interface FieldCopy { label: string; help?: string }

/** Wording per component type and field. */
const FIELDS: Record<string, Record<string, FieldCopy>> = {
  SECTOR_OVERLAY: {
    sector_code: { label: 'Sector', help: 'Choose from the sectors your organisation supervises.' },
    applicability: {
      label: 'How it applies',
      help: 'Applicable, not applicable, or applicable with modifications for this sector.',
    },
    note: { label: 'Note', help: 'Optional explanation of the modification.' },
  },
  FACT_CONFIG: {
    fact_code: { label: 'Fact', help: 'Choose a fact already defined by the methodology.' },
    data_type: { label: 'Form of the answer', help: 'A number, a percentage, text, a date or yes/no.' },
    unit: { label: 'Unit', help: 'Optional, for example EC$ thousands.' },
  },
  SOURCE_BINDING: {
    fact_code: { label: 'Fact', help: 'The fact this source provides.' },
    source_kind: { label: 'Kind of source', help: 'A regulatory return, a form, manual entry, an external feed, or derived.' },
    source_reference: { label: 'Source reference', help: 'The name or code of the return, form or feed.' },
  },
  MATERIALITY_POLICY: {
    measure: { label: 'Measure', help: 'The fact or calculation parameter being tested.' },
    operator: { label: 'Comparison', help: 'Greater than, at least, less than, at most, or equal to.' },
    value: { label: 'Threshold', help: 'The figure at which the measure becomes material.' },
    unit: { label: 'Unit', help: 'Optional unit for the threshold.' },
  },
  DASHBOARD_POLICY: {
    tile_key: { label: 'Tile reference', help: 'A short code identifying the tile, for example HIGH_RISK_COUNT.' },
    metric: { label: 'Metric', help: 'Choose from the metrics already defined on the platform.' },
    audience: { label: 'Who sees it', help: 'The supervisory audience this tile is intended for.' },
  },
  NOTIFICATION_POLICY: {
    event: { label: 'Event', help: 'The supervisory event that triggers the message.' },
    channels: { label: 'How it is sent', help: 'Choose one or more delivery channels.' },
    recipients: { label: 'Who is told', help: 'Choose one or more recipient groups.' },
  },
  SLA_POLICY: {
    rule_code: { label: 'Rule reference', help: 'A short code identifying this stage rule.' },
    stage: { label: 'Stage', help: 'The stage of supervisory work this duration applies to.' },
    duration_days: { label: 'Days allowed', help: 'How long the stage may take before it is overdue.' },
    calendar_mode: { label: 'Day basis', help: 'Calendar days or business days.' },
    applies_to_action: { label: 'Applies to action', help: 'Optional: limit this stage to one supervisory action.' },
    risk_band: { label: 'Applies to rating', help: 'Optional: limit this stage to one risk rating.' },
    warning_percentage: { label: 'Early warning at', help: 'Percentage of the period after which a warning is raised.' },
    breach_severity: { label: 'Severity if breached', help: 'How serious an overrun is treated as being.' },
    escalation_tier_profile: { label: 'Escalation profile', help: 'Which escalation ladder to use on breach.' },
    pause_permitted: { label: 'Clock may be paused', help: 'Allow the stage clock to stop while waiting on the institution.' },
    policy_note: { label: 'Note' },
  },
  RESPONSE_POLICY: {
    rule_code: { label: 'Rule reference' },
    risk_band: { label: 'Risk rating', help: 'The rating this expectation applies to.' },
    action: { label: 'Supervisory action', help: 'The response the policy speaks to.' },
    response_level: {
      label: 'Policy expectation',
      help: 'Required, recommended, permitted, or forbidden for this rating.',
    },
    advisory_timeframe_days: { label: 'Advisory timeframe (days)', help: 'Guidance only — deadlines are owned by SLA policy.' },
    rationale_required: { label: 'Reason required' },
    deferral_allowed: { label: 'May be deferred' },
    policy_note: { label: 'Note' },
  },
  JUDGEMENT_POLICY: {
    rule_code: { label: 'Rule reference' },
    direction: { label: 'Permitted direction', help: 'May the officer move the rating up, down, or either way.' },
    max_band_steps: { label: 'Maximum steps', help: 'How many rating bands the officer may move.' },
    override_permitted: { label: 'Override allowed' },
    rationale_required: { label: 'Reason required' },
    rationale_min_length: { label: 'Minimum reason length' },
    applies_to_ratings: { label: 'Applies to calculated ratings' },
    prohibited_target_ratings: { label: 'Ratings that may never be chosen' },
  },
};

const GENERIC: Record<string, FieldCopy> = {
  rule_code: { label: 'Rule reference', help: 'A short code identifying this entry.' },
  note: { label: 'Note' },
  policy_note: { label: 'Note' },
};

export function fieldCopy(componentType: string | null | undefined, field: string): FieldCopy | null {
  return FIELDS[componentType ?? '']?.[field] ?? GENERIC[field] ?? null;
}
