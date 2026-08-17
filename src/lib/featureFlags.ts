/**
 * Central feature flags.
 *
 * Collaborative Review is fully implemented but hidden from the UI.
 * Flip this to `true` to re-expose it everywhere it is mounted.
 */
export const COLLAB_REVIEW_ENABLED = false;

/**
 * Triage History card on the complaint detail Overview tab.
 * Hidden per business request; the component is kept for future re-enablement.
 */
export const COMPLAINT_TRIAGE_HISTORY_ENABLED = false;

/**
 * Advisory AI interpretation on prudential risk scoring, ratio/peer analytics
 * and risk dashboards. Advisory only — deterministic scores, thresholds,
 * indicators, peer metrics and workflows are unaffected when this is off.
 */
export const PRUDENTIAL_ADVISORY_AI_ENABLED = true;

/**
 * Advisory AI interpretation, summarisation and draft-text assistance across
 * the remaining supervisory modules: examinations/inspections, enforcement,
 * complaints & market conduct, cross-module intelligence and executive
 * workbenches. Advisory only — every official status, rating, finding,
 * decision, workflow step and manual capability is unaffected when this is off.
 */
export const SUPERVISORY_ADVISORY_AI_ENABLED = true;

/**
 * Applicant panel "Bulk Fill via Excel or XML" section.
 * Hidden per business request; the component is kept for future re-enablement.
 */
export const APPLICATION_BULK_FILL_ENABLED = false;
