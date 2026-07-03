/**
 * Sector-specific F&P decision rules (Phase 6 · Gap 2).
 *
 * Resolution order (most specific → least):
 *   1. sector + sub_sector + role_type
 *   2. sector + sub_sector
 *   3. sector + role_type
 *   4. sector
 *
 * A `criteria` blob supports:
 *   { min_score?: number, mandatory_checks?: string[], disqualifiers?: string[], warnings?: string[] }
 */
import { supabase } from '@/integrations/supabase/client';

export interface FpSectorRule {
  id: string;
  sector_id: string;
  sub_sector_id: string | null;
  role_type: string | null;
  name: string;
  criteria: {
    min_score?: number;
    mandatory_checks?: string[];
    disqualifiers?: string[];
    warnings?: string[];
  };
  rationale_template_id: string | null;
  is_active: boolean;
}

export interface RuleContext {
  sectorId: string | null;
  subSectorId?: string | null;
  roleType?: string | null;
}

export async function resolveFpSectorRule(ctx: RuleContext): Promise<FpSectorRule | null> {
  if (!ctx.sectorId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('fp_sector_decision_rules') as any)
    .select('*')
    .eq('sector_id', ctx.sectorId)
    .eq('is_active', true);
  if (error || !Array.isArray(data)) return null;
  const rows = data as FpSectorRule[];

  const score = (r: FpSectorRule) => {
    let s = 0;
    if (r.sub_sector_id && r.sub_sector_id === ctx.subSectorId) s += 4;
    else if (!r.sub_sector_id) s += 1;
    if (r.role_type && r.role_type === ctx.roleType) s += 2;
    else if (!r.role_type) s += 1;
    return s;
  };

  const sorted = rows
    .filter((r) => !r.sub_sector_id || r.sub_sector_id === ctx.subSectorId)
    .filter((r) => !r.role_type || r.role_type === ctx.roleType)
    .sort((a, b) => score(b) - score(a));

  return sorted[0] ?? null;
}

export interface CriteriaEvaluation {
  passed: boolean;
  failed: string[];
  warned: string[];
  disqualifiers: string[];
  minScoreOk: boolean | null;
}

/** Evaluate a candidate's screening results against the resolved sector rule. */
export function evaluateFpCriteria(
  rule: FpSectorRule | null,
  input: { score: number | null; completedChecks: string[] },
): CriteriaEvaluation {
  if (!rule) {
    return { passed: true, failed: [], warned: [], disqualifiers: [], minScoreOk: null };
  }
  const c = rule.criteria ?? {};
  const failed: string[] = [];
  const warned: string[] = [];
  const disq: string[] = [];

  (c.mandatory_checks ?? []).forEach((chk) => {
    if (!input.completedChecks.includes(chk)) failed.push(chk);
  });
  (c.warnings ?? []).forEach((chk) => {
    if (!input.completedChecks.includes(chk)) warned.push(chk);
  });
  (c.disqualifiers ?? []).forEach((chk) => {
    if (input.completedChecks.includes(chk)) disq.push(chk);
  });

  let minScoreOk: boolean | null = null;
  if (typeof c.min_score === 'number') {
    minScoreOk = input.score !== null && input.score >= c.min_score;
  }

  const passed = failed.length === 0 && disq.length === 0 && (minScoreOk ?? true);
  return { passed, failed, warned, disqualifiers: disq, minScoreOk };
}
