/**
 * OS-02E — Continuous Detection & Trigger Governance.
 *
 * Detection truth is owned by the canonical supervisory spine:
 * `supervisory_signal` (condition identity, lifecycle, provenance),
 * `supervisory_signal_occurrence` (repeat observation history),
 * `supervisory_detector` (governed configuration) and
 * `supervisory_detector_run` (run assurance). The client only reads the
 * governed read models and asks the server to run detection; it never derives
 * a condition, a severity, a threshold or a risk rating.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export interface DetectedCondition {
  signal_id: string;
  entity_id: string | null;
  entity_name: string | null;
  domain_code: string;
  detector_code: string | null;
  source_kind: string;
  severity: string | null;
  summary: string | null;
  state: 'OPEN' | 'RESOLVED';
  first_detected_at: string | null;
  last_detected_at: string | null;
  occurrence_count: number;
  observed_value: number | null;
  threshold_value: number | null;
  comparator: string | null;
  materiality_reason: string | null;
  source_table: string | null;
  source_id: string | null;
  source_reference: string | null;
  config_provenance: Record<string, unknown>;
  resolved_at: string | null;
  resolution_reason: string | null;
  reviewed: boolean;
}

export interface DetectionRegister {
  generated_at: string;
  state: string;
  rows: DetectedCondition[];
}

export interface DetectorAssuranceRow {
  code: string;
  name: string;
  domain_code: string;
  source_object: string;
  execution_mode: string;
  config_owner: string;
  params: Record<string, unknown>;
  version: number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  open_signals: number;
  resolved_signals: number;
  last_run: {
    run_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    rows_scanned: number;
    signals_created: number;
    signals_updated: number;
    signals_resolved: number;
    error_text: string | null;
  } | null;
}

export interface DetectorAssurance {
  generated_at: string;
  detectors: DetectorAssuranceRow[];
}

export function useDetectionRegister(
  domain: string | null = null,
  state: 'OPEN' | 'RESOLVED' | 'ALL' = 'OPEN',
  limit = 200,
) {
  return useQuery({
    queryKey: ['supervisory_detection_register', domain, state, limit],
    queryFn: () => rpc<DetectionRegister>('supervisory_detection_register', {
      _domain: domain, _state: state, _limit: limit,
    }),
    staleTime: 30_000,
  });
}

export function useDetectorAssurance() {
  return useQuery({
    queryKey: ['supervisory_detector_assurance'],
    queryFn: () => rpc<DetectorAssurance>('supervisory_detector_assurance'),
    staleTime: 60_000,
  });
}

export function useEntityDetectedConditions(entityId?: string | null, domain: string | null = null) {
  return useQuery({
    queryKey: ['supervisory_entity_detected_conditions', entityId, domain],
    queryFn: () => rpc<{ entity_id: string; generated_at: string; open_conditions: DetectedCondition[] }>(
      'supervisory_entity_detected_conditions', { _entity_id: entityId, _domain: domain }),
    enabled: !!entityId,
    staleTime: 30_000,
  });
}

export function useRunDetection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (detectorCode?: string | null) =>
      rpc<{ generated_at: string; detectors: Array<Record<string, unknown>> }>(
        'supervisory_detect_run', { _detector_code: detectorCode ?? null, _trigger_kind: 'manual' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervisory_detection_register'] });
      qc.invalidateQueries({ queryKey: ['supervisory_detector_assurance'] });
      qc.invalidateQueries({ queryKey: ['supervisory_monitoring_register'] });
      qc.invalidateQueries({ queryKey: ['supervisory_detection_health'] });
    },
  });
}

export function formatDetected(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * OS-02F — operational health of the nightly detection run. The server keeps
 * "last attempted" and "last successful" strictly separate; the client never
 * infers success from an attempt.
 */
export interface DetectionRunRef {
  run_id: string;
  detector_code: string | null;
  trigger_kind?: string | null;
  status?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  error_text?: string | null;
}

export interface DetectionHealth {
  generated_at: string;
  schedule: string | null;
  schedule_timezone: string;
  next_scheduled_at: string | null;
  last_successful_scheduled_run: DetectionRunRef | null;
  last_attempted_run: DetectionRunRef | null;
  last_successful_run: DetectionRunRef | null;
  runs_in_progress: number;
  detectors_needing_attention: Array<{
    detector_code: string;
    name: string;
    status: string | null;
    started_at: string | null;
    error_text: string | null;
    reason: 'NEVER_RUN' | 'LAST_RUN_FAILED' | 'LAST_RUN_INCOMPLETE' | string;
  }>;
}

export function useDetectionHealth() {
  return useQuery({
    queryKey: ['supervisory_detection_health'],
    queryFn: () => rpc<DetectionHealth>('supervisory_detection_health'),
    staleTime: 60_000,
  });
}

export function formatDetectedAt(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';
}
