import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EPR-04 / P05 guardrails.
 *
 * The Fit & Proper process authority is the ASSESSMENT CASE (fp_assessments.id).
 * No active screen may re-derive the process from "the person's latest
 * assessment", and the person profile may not operate a case.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const SRC = join(process.cwd(), 'src');
const files = walk(SRC).filter((f) => !f.includes(`${'/'}test${'/'}`));

describe('F&P latest-assessment authority', () => {
  it('no active source resolves a "latest assessment"', () => {
    const offenders = files.filter((f) => {
      const s = readFileSync(f, 'utf8');
      return /latestAssessment|fp_latest_assessment/.test(s);
    });
    expect(offenders).toEqual([]);
  });

  it('no F&P screen orders fp_assessments by created_at desc to pick one row', () => {
    const offenders = files.filter((f) => {
      const s = readFileSync(f, 'utf8');
      if (!s.includes("from('fp_assessments')")) return false;
      return /order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)[\s\S]{0,120}?\.limit\(1\)/.test(s);
    });
    expect(offenders).toEqual([]);
  });

  it('the person profile does not host assessment-operating panels', () => {
    const profile = readFileSync(join(SRC, 'pages/fpa/FpaIndividualProfile.tsx'), 'utf8');
    expect(profile).not.toContain('FpScreeningPanel');
    expect(profile).not.toContain('FpDeterminationsPanel');
  });

  it('the assessment workspace is driven by the server-owned case model', () => {
    const ws = readFileSync(join(SRC, 'pages/fpa/FpaAssessmentWorkspace.tsx'), 'utf8');
    expect(ws).toContain('useFpAssessmentCase');
    const hook = readFileSync(join(SRC, 'hooks/useFpProcess.ts'), 'utf8');
    expect(hook).toContain('fp_assessment_case');
  });

  it('the process list routes to the assessment workspace', () => {
    const list = readFileSync(join(SRC, 'pages/fpa/FpaProcessList.tsx'), 'utf8');
    expect(list).toContain('/fpa/assessments/');
  });

  it('the /fpa/assessments/:id route renders the workspace, not a redirect', () => {
    const routes = readFileSync(join(SRC, 'routes/fpaRoutes.tsx'), 'utf8');
    expect(routes).toContain('FpaAssessmentWorkspace');
    expect(routes).not.toContain('FpaAssessmentRedirect');
  });
});
