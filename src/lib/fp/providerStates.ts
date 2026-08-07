/**
 * Phase 3C — canonical screening/AI provider state vocabulary.
 *
 * A non-success state must NEVER be rendered as "no adverse findings". These
 * labels are deliberately explicit so an unavailable provider can never be
 * mistaken for a clean subject.
 */
export type FpProviderState =
  | 'SUCCESS_HIT'
  | 'SUCCESS_NO_MATCH'
  | 'NOT_CONFIGURED'
  | 'SANDBOX'
  | 'PROVIDER_FAILURE'
  | 'TRANSPORT_FAILURE'
  | 'RATE_LIMITED'
  | 'MANUAL';

export const FP_PROVIDER_STATE_META: Record<
  FpProviderState,
  { label: string; className: string; conclusive: boolean; help: string }
> = {
  SUCCESS_HIT: {
    label: 'Success — result found',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
    conclusive: true,
    help: 'Provider returned one or more candidate matches requiring review.',
  },
  SUCCESS_NO_MATCH: {
    label: 'Success — no match',
    className: 'bg-success/15 text-success border-success/30',
    conclusive: true,
    help: 'Provider responded and returned no candidate matches.',
  },
  NOT_CONFIGURED: {
    label: 'Provider not configured',
    className: 'bg-warning/15 text-warning border-warning/30',
    conclusive: false,
    help: 'No provider connection is configured — this check was not performed.',
  },
  SANDBOX: {
    label: 'Sandbox',
    className: 'bg-primary/10 text-primary border-primary/30',
    conclusive: false,
    help: 'Result produced by a sandbox provider — not valid regulatory evidence.',
  },
  PROVIDER_FAILURE: {
    label: 'Provider failure',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
    conclusive: false,
    help: 'Provider responded with an error — the check did not complete.',
  },
  TRANSPORT_FAILURE: {
    label: 'Transport failure',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
    conclusive: false,
    help: 'The provider could not be reached — the check did not complete.',
  },
  RATE_LIMITED: {
    label: 'Rate limited',
    className: 'bg-warning/15 text-warning border-warning/30',
    conclusive: false,
    help: 'Provider rate limit reached — retry required before relying on this check.',
  },
  MANUAL: {
    label: 'Manual result',
    className: 'bg-muted text-muted-foreground border-border',
    conclusive: true,
    help: 'Result recorded manually by a reviewer, not by an external provider.',
  },
};

const ALIASES: Record<string, FpProviderState> = {
  hit: 'SUCCESS_HIT',
  hits: 'SUCCESS_HIT',
  match: 'SUCCESS_HIT',
  success: 'SUCCESS_HIT',
  clean: 'SUCCESS_NO_MATCH',
  no_match: 'SUCCESS_NO_MATCH',
  no_hit: 'SUCCESS_NO_MATCH',
  not_configured: 'NOT_CONFIGURED',
  unconfigured: 'NOT_CONFIGURED',
  sandbox: 'SANDBOX',
  failed: 'PROVIDER_FAILURE',
  failure: 'PROVIDER_FAILURE',
  provider_error: 'PROVIDER_FAILURE',
  transport_error: 'TRANSPORT_FAILURE',
  network_error: 'TRANSPORT_FAILURE',
  timeout: 'TRANSPORT_FAILURE',
  rate_limited: 'RATE_LIMITED',
  throttled: 'RATE_LIMITED',
  manual: 'MANUAL',
};

/** Map any legacy/free-form outcome string onto the canonical vocabulary. */
export function normalizeProviderState(raw: unknown): FpProviderState {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return 'NOT_CONFIGURED';
  const upper = key.toUpperCase() as FpProviderState;
  if (upper in FP_PROVIDER_STATE_META) return upper;
  return ALIASES[key] ?? 'PROVIDER_FAILURE';
}

/** True only when the state proves the check actually completed. */
export function isConclusive(state: FpProviderState): boolean {
  return FP_PROVIDER_STATE_META[state].conclusive;
}
