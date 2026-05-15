import { describe, expect, it } from 'vitest';
import { isPrimaryEmailField, resolvePrimaryEmailField } from '@/lib/primaryEmailValidation';

describe('primary email validation helpers', () => {
  it('detects common and custom-labeled primary email fields', () => {
    expect(isPrimaryEmailField({ type: 'email', fieldName: 'contact_email', label: 'Contact Email', id: '1', required: false } as any)).toBe(true);
    expect(isPrimaryEmailField({ type: 'email', fieldName: 'primary_user_email', label: 'Work email', id: '0', required: false } as any)).toBe(true);
    expect(isPrimaryEmailField({ type: 'email', fieldName: 'custom_contact', label: 'Primary User Email', id: '2', required: false } as any)).toBe(true);
    expect(isPrimaryEmailField({ type: 'email', fieldName: 'custom_primary', label: 'Email', id: '4', required: false } as any)).toBe(true);
    expect(isPrimaryEmailField({ type: 'email', fieldName: 'support_alias', label: 'Support mailbox', id: '3', required: false } as any)).toBe(false);

    const resolved = resolvePrimaryEmailField([
      {
        id: 'step-1',
        title: 'Primary User',
        rows: [
          {
            id: 'row-1',
            columns: [
              { span: 12, field: { id: 'field-1', type: 'email', fieldName: 'custom_primary', label: 'Primary User Email', required: true } },
            ],
          },
        ],
      },
    ] as any);

    expect(resolved?.fieldName).toBe('custom_primary');
  });
});