import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  confidenceLabel,
  riskLevelLabel,
  sectionStatusLabel,
  severityLabel,
  toEvidenceFact,
  toEvidenceFacts,
} from '@/lib/licensing/aiAssessmentLabels';

describe('aiAssessmentLabels', () => {
  it('maps severity codes to business words', () => {
    expect(severityLabel('critical')).toBe('Blocking');
    expect(severityLabel('HIGH')).toBe('Needs attention');
    expect(severityLabel('low')).toBe('Minor');
    expect(severityLabel(undefined)).toBe('Observation');
  });

  it('humanises categories', () => {
    expect(categoryLabel('financial')).toBe('Financial');
    expect(categoryLabel('aml_cft')).toBe('AML / CFT');
    expect(categoryLabel('some_other_topic')).toBe('Some Other Topic');
    expect(categoryLabel('')).toBe('');
  });

  it('maps section status and risk level', () => {
    expect(sectionStatusLabel('pass')).toBe('Satisfied');
    expect(sectionStatusLabel('missing_info')).toBe('Information missing');
    expect(riskLevelLabel('low')).toBe('Low risk');
    expect(riskLevelLabel('high risk')).toBe('High risk');
  });

  it('phrases confidence in words', () => {
    expect(confidenceLabel(0.95)).toBe('High confidence (95%)');
    expect(confidenceLabel(0.7)).toBe('Moderate confidence (70%)');
    expect(confidenceLabel(0.2)).toBe('Low confidence (20%)');
    expect(confidenceLabel(null)).toBe('');
  });

  it('splits path: value evidence into labelled facts', () => {
    const fact = toEvidenceFact('submitted_forms[0].response_data.amount_paid: 46');
    expect(fact?.value).toBe('46');
    expect(fact?.label).not.toContain('response_data');
    expect(fact?.label).toContain('Amount Paid');
    expect(fact?.raw).toContain('submitted_forms[0]');
  });

  it('passes free-text evidence through unchanged', () => {
    expect(toEvidenceFact('Board resolution was not signed')?.label).toBe(
      'Board resolution was not signed',
    );
    expect(toEvidenceFact('   ')).toBeNull();
    expect(toEvidenceFacts(null)).toEqual([]);
  });
});
