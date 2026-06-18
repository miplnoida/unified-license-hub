import { useEffect, useMemo, useState } from 'react';

export type SlaStatus = 'healthy' | 'warning' | 'breached' | 'unknown';

export interface UseWorkflowSLAInput {
  /** When the step (or workflow) clock started — ISO string. */
  startedAt: string | null | undefined;
  /** Total SLA hours for the step. */
  slaHours: number | null | undefined;
  /** Warning threshold as a percent of consumption (e.g. 80 = warn at 80%). */
  warningThresholdPercent?: number | null;
  /** Escalation kicks in this many hours after the deadline (or after start, see escalationBasis). */
  escalationAfterHours?: number | null;
  /** Whether the SLA clock is paused (e.g. RFI sent). */
  paused?: boolean;
  /**
   * Where escalation hours are measured from:
   *   - 'deadline' (default): escalation triggers `escalationAfterHours` after the SLA deadline.
   *   - 'start': escalation triggers `escalationAfterHours` after `startedAt`.
   */
  escalationBasis?: 'deadline' | 'start';
}

export interface WorkflowSLAResult {
  status: SlaStatus;
  /** ISO string — SLA deadline. Null when sla hours / start unknown. */
  deadline: string | null;
  /** Hours remaining until deadline. Negative when breached. */
  remainingHours: number;
  /** SLA consumption (0–100+). */
  percentConsumed: number;
  /** Hours breached past deadline (>=0). 0 when not breached. */
  breachedByHours: number;
  /** Whether escalation threshold has been reached. */
  escalationTriggered: boolean;
  /** Human-friendly remaining label, e.g. "12h left" / "Overdue 4h". */
  label: string;
}

const HOUR_MS = 60 * 60 * 1000;

function diffHours(aMs: number, bMs: number) {
  return (aMs - bMs) / HOUR_MS;
}

function formatHoursLabel(remaining: number): string {
  if (remaining >= 0) {
    if (remaining >= 24) return `${Math.floor(remaining / 24)}d ${Math.round(remaining % 24)}h left`;
    if (remaining >= 1) return `${Math.floor(remaining)}h ${Math.round((remaining % 1) * 60)}m left`;
    return `${Math.max(1, Math.round(remaining * 60))}m left`;
  }
  const over = Math.abs(remaining);
  if (over >= 24) return `Overdue ${Math.floor(over / 24)}d ${Math.round(over % 24)}h`;
  if (over >= 1) return `Overdue ${Math.floor(over)}h`;
  return `Overdue ${Math.max(1, Math.round(over * 60))}m`;
}

export function computeWorkflowSLA(
  input: UseWorkflowSLAInput,
  now: Date = new Date(),
): WorkflowSLAResult {
  const { startedAt, slaHours, warningThresholdPercent, escalationAfterHours, paused, escalationBasis = 'deadline' } = input;

  if (!startedAt || !slaHours || slaHours <= 0) {
    return {
      status: 'unknown',
      deadline: null,
      remainingHours: 0,
      percentConsumed: 0,
      breachedByHours: 0,
      escalationTriggered: false,
      label: '—',
    };
  }

  const startMs = new Date(startedAt).getTime();
  const nowMs = now.getTime();
  const deadlineMs = startMs + slaHours * HOUR_MS;
  const remainingHours = diffHours(deadlineMs, nowMs);
  const elapsedHours = Math.max(0, diffHours(nowMs, startMs));
  const percentConsumed = Math.min(999, (elapsedHours / slaHours) * 100);
  const breachedByHours = remainingHours < 0 ? Math.abs(remainingHours) : 0;

  const warnPct = warningThresholdPercent ?? 80;
  let status: SlaStatus = 'healthy';
  if (paused) {
    status = 'healthy';
  } else if (remainingHours < 0) {
    status = 'breached';
  } else if (percentConsumed >= warnPct) {
    status = 'warning';
  }

  let escalationTriggered = false;
  if (escalationAfterHours && escalationAfterHours > 0 && !paused) {
    const basisMs = escalationBasis === 'start' ? startMs : deadlineMs;
    escalationTriggered = nowMs >= basisMs + escalationAfterHours * HOUR_MS;
  }

  return {
    status,
    deadline: new Date(deadlineMs).toISOString(),
    remainingHours,
    percentConsumed,
    breachedByHours,
    escalationTriggered,
    label: paused ? 'Paused' : formatHoursLabel(remainingHours),
  };
}

/**
 * Reactive SLA computation that ticks every `tickMs` (default 60s) so countdowns
 * stay accurate without re-fetching the underlying workflow data.
 */
export function useWorkflowSLA(input: UseWorkflowSLAInput, tickMs: number = 60_000): WorkflowSLAResult {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!input.startedAt || !input.slaHours) return;
    const id = window.setInterval(() => setNow(new Date()), tickMs);
    return () => window.clearInterval(id);
  }, [input.startedAt, input.slaHours, tickMs]);

  return useMemo(
    () => computeWorkflowSLA(input, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      input.startedAt,
      input.slaHours,
      input.warningThresholdPercent,
      input.escalationAfterHours,
      input.paused,
      input.escalationBasis,
      now,
    ],
  );
}
