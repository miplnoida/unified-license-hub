import { describe, expect, it } from 'vitest';
import { renderBrandedEmail, stripUnresolvedTemplateTokens } from '../../supabase/functions/_shared/email-layout';

const REQUIRED_RETURN_EVENT_KEYS = [
  'return.submitted',
  'return.submitted.confirmation',
  'return.resubmitted',
  'return.resubmitted.confirmation',
  'return.edit_requested',
  'return.approved',
  'return.rejected',
  'return.send_back',
  'return.approved_step',
  'return.workflow_action_taken',
  'return.comment_added',
] as const;

function renderTemplate(tpl: string, vars: Record<string, unknown>) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

describe('return notification template utilities', () => {
  it('keeps the required return event key set in sync with acceptance criteria', () => {
    expect(REQUIRED_RETURN_EVENT_KEYS).toHaveLength(11);
    expect(new Set(REQUIRED_RETURN_EVENT_KEYS)).toContain('return.submitted.confirmation');
    expect(new Set(REQUIRED_RETURN_EVENT_KEYS)).toContain('return.comment_added');
  });

  it('removes unresolved template variables safely', () => {
    const rendered = renderTemplate('Hello {{name}} {{missing}}', { name: 'Amina' });
    expect(stripUnresolvedTemplateTokens(rendered)).toBe('Hello Amina');
  });

  it('renders branded email with OTP-style chrome and CTA', () => {
    const html = renderBrandedEmail({
      appName: 'Unified License Hub',
      heading: 'Return Submitted',
      paragraphs: ['Your return was submitted successfully.'],
      ctaUrl: 'https://example.com/returns/1',
      ctaLabel: 'View Return',
      supportEmail: 'support@example.com',
    });

    expect(html).toContain('Unified License Hub');
    expect(html).toContain('background:#1E3A8A');
    expect(html).toContain('View Return');
    expect(html).toContain('support@example.com');
    expect(html).toContain('Please do not reply to this email');
    expect(html).toContain('max-width:520px');
  });
});
