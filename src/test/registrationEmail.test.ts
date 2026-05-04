import { describe, it, expect } from 'vitest';
import { resolveRegistrationEmail, isValidEmail } from '@/lib/registrationEmail';
import type { RegFormSchema } from '@/types/registrationForm';

const schema: RegFormSchema = [
  {
    id: 's1',
    title: 'Contact',
    rows: [
      {
        id: 'r1',
        columns: [
          {
            span: 12,
            field: {
              id: 'f1',
              type: 'email',
              label: 'Contact Email',
              fieldName: 'business_email',
              required: true,
            },
          },
        ],
      },
    ],
  },
];

describe('resolveRegistrationEmail', () => {
  it('returns trimmed lowercased static email when present', () => {
    expect(resolveRegistrationEmail('  User@Example.COM ', {})).toBe('user@example.com');
  });

  it('falls back to common dynamic key "email"', () => {
    expect(resolveRegistrationEmail('', { email: 'a@b.co' })).toBe('a@b.co');
  });

  it('falls back to common dynamic key "contact_email"', () => {
    expect(resolveRegistrationEmail('', { contact_email: 'c@d.io' })).toBe('c@d.io');
  });

  it('finds email in dynamic schema by type=email', () => {
    expect(resolveRegistrationEmail('', { business_email: 'X@Y.com' }, schema)).toBe('x@y.com');
  });

  it('returns empty string when nothing provided', () => {
    expect(resolveRegistrationEmail('', {})).toBe('');
    expect(resolveRegistrationEmail(undefined, { email: '   ' })).toBe('');
  });

  it('static email wins over dynamic', () => {
    expect(resolveRegistrationEmail('static@x.com', { email: 'dyn@y.com' })).toBe('static@x.com');
  });
});

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
  });
  it('rejects invalid emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });
});
