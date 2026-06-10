import { describe, expect, it } from 'vitest';
import { renderBrandedEmail, stripUnresolvedTemplateTokens } from '../../supabase/functions/_shared/email-layout';

function renderTemplate(tpl: string, vars: Record<string, unknown>) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

describe('return notification template utilities', () => {
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
