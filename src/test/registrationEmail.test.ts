import { describe, it, expect } from 'vitest';
import { resolveRegistrationEmail, resolveRegistrationPassword, isValidEmail } from '@/lib/registrationEmail';
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

  it('finds email in dynamic schema by label or fieldName even when saved as text', () => {
    const textEmailSchema: RegFormSchema = [{
      id: 's1',
      title: 'Contact',
      rows: [{
        id: 'r1',
        columns: [{
          span: 12,
          field: {
            id: 'f1',
            type: 'text',
            label: 'Primary Email Address',
            fieldName: 'primary_contact',
            required: true,
          },
        }],
      }],
    }];
    expect(resolveRegistrationEmail('', { primary_contact: 'Legacy@Email.test' }, textEmailSchema)).toBe('legacy@email.test');
  });

  it('returns empty string when nothing provided', () => {
    expect(resolveRegistrationEmail('', {})).toBe('');
    expect(resolveRegistrationEmail(undefined, { email: '   ' })).toBe('');
  });

  it('static email wins over dynamic', () => {
    expect(resolveRegistrationEmail('static@x.com', { email: 'dyn@y.com' })).toBe('static@x.com');
  });
});

describe('resolveRegistrationPassword', () => {
  it('returns static password when present', () => {
    expect(resolveRegistrationPassword('Secret123!', {})).toBe('Secret123!');
  });

  it('falls back to common dynamic password keys', () => {
    expect(resolveRegistrationPassword('', { primary_user_password: 'Secret123!' })).toBe('Secret123!');
    expect(resolveRegistrationPassword('', { login_password: 'Secret456!' })).toBe('Secret456!');
  });

  it('finds password by type=password', () => {
    const passwordSchema: RegFormSchema = [{
      id: 's1',
      title: 'Account',
      rows: [{
        id: 'r1',
        columns: [{
          span: 12,
          field: {
            id: 'f1',
            type: 'password',
            label: 'Login Password',
            fieldName: 'custom_login_secret',
            required: true,
          },
        }],
      }],
    }];
    expect(resolveRegistrationPassword('', { custom_login_secret: 'Secret123!' }, passwordSchema)).toBe('Secret123!');
  });

  it('finds password by label or fieldName when legacy config saved it as text', () => {
    const legacyPasswordSchema: RegFormSchema = [{
      id: 's1',
      title: 'Account',
      rows: [{
        id: 'r1',
        columns: [
          {
            span: 6,
            field: {
              id: 'f1',
              type: 'text',
              label: 'Login Password',
              fieldName: 'account_secret',
              required: true,
            },
          },
          {
            span: 6,
            field: {
              id: 'f2',
              type: 'text',
              label: 'Confirm Password',
              fieldName: 'confirm_password_text',
              required: true,
            },
          },
        ],
      }],
    }];
    expect(resolveRegistrationPassword('', {
      account_secret: 'Secret123!',
      confirm_password_text: 'WrongValue!',
    }, legacyPasswordSchema)).toBe('Secret123!');
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
