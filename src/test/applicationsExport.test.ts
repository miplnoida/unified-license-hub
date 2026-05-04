import { describe, it, expect } from 'vitest';
import { escapeCsv, buildCsvRow, buildCsv, CSV_HEADER, type CsvLookups, type CsvAppRow } from '@/lib/applicationsExport';

const lookups: CsvLookups = {
  applicantNameById: (id) => id === 'u1' ? 'Acme Corp' : '—',
  sectorNameById: { s1: 'Telecom' },
  subSectorNameById: { ss1: 'Mobile' },
  categoryNameById: { c1: 'Operator' },
  serviceNameById: { svc1: 'License Renewal' },
  statusLabelById: { approved: 'Approved', submitted: 'Submitted' },
};

describe('escapeCsv', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv(undefined)).toBe('');
  });
  it('passes simple values through unchanged', () => {
    expect(escapeCsv('hello')).toBe('hello');
    expect(escapeCsv(42)).toBe('42');
  });
  it('quotes values containing comma, quote, or newline', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('he said "hi"')).toBe('"he said ""hi"""');
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('buildCsvRow', () => {
  it('builds a Pre Licensee row with category lookup and embedded payment', () => {
    const app: CsvAppRow = {
      application_number: 'APP-001',
      applicant_id: 'u1',
      applicant_name: 'Acme Corp',
      applicant_email: 'ops@acme.test',
      status: 'submitted',
      submitted_at: '2026-01-02T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      data: { sector_id: 's1', sub_sector_id: 'ss1', category_id: 'c1' },
      payment_status: 'success',
      payment_amount: 250,
      payment_currency: 'USD',
      payment_paid_at: '2026-01-02T01:00:00Z',
    };
    const cells = buildCsvRow(app, lookups).split(',');
    expect(cells[0]).toBe('APP-001');
    expect(cells[1]).toBe('Acme Corp');
    expect(cells[2]).toBe('ops@acme.test');
    expect(cells[3]).toBe('Pre Licensee');
    expect(cells[4]).toBe('Telecom');
    expect(cells[5]).toBe('Mobile');
    expect(cells[6]).toBe('Operator');
    expect(cells[7]).toBe(''); // service
    expect(cells[8]).toBe('success');
    expect(cells[9]).toBe('250');
    expect(cells[10]).toBe('USD');
    expect(cells[12]).toBe('Submitted');
  });

  it('builds a Post Licensee row when service_id is present', () => {
    const app: CsvAppRow = {
      application_number: 'APP-002',
      applicant_id: 'u1',
      status: 'approved',
      data: { service_id: 'svc1' },
    };
    const cells = buildCsvRow(app, lookups).split(',');
    expect(cells[3]).toBe('Post Licensee');
    expect(cells[7]).toBe('License Renewal');
  });

  it('falls back to id when lookup is missing', () => {
    const app: CsvAppRow = {
      application_number: 'APP-003',
      applicant_id: 'u1',
      status: 'submitted',
      data: { sector_id: 'unknown-id' },
    };
    expect(buildCsvRow(app, lookups).split(',')[4]).toBe('unknown-id');
  });

  it('escapes commas in applicant names', () => {
    const app: CsvAppRow = {
      application_number: 'APP-004',
      applicant_id: 'u1',
      status: 'submitted',
      data: {},
    };
    const customLookups = { ...lookups, applicantNameById: () => 'Smith, John' };
    expect(buildCsvRow(app, customLookups)).toContain('"Smith, John"');
  });

  it('never emits raw data JSON', () => {
    const secretBlob = { ssn: '123-45-6789', secret_token: 'leak-me' };
    const app: CsvAppRow = {
      application_number: 'APP-005',
      applicant_id: 'u1',
      status: 'submitted',
      data: { sector_id: 's1', ...secretBlob },
    };
    const row = buildCsvRow(app, lookups);
    expect(row).not.toContain('123-45-6789');
    expect(row).not.toContain('leak-me');
    expect(row).not.toContain('ssn');
    expect(row).not.toContain('secret_token');
  });

  it('prefers embedded RPC labels over data lookups', () => {
    const app: CsvAppRow = {
      application_number: 'APP-006',
      applicant_id: 'u1',
      status: 'approved',
      data: { sector_id: 's1' },
      sector_name: 'Embedded Sector',
    };
    expect(buildCsvRow(app, lookups).split(',')[4]).toBe('Embedded Sector');
  });
});

describe('buildCsv', () => {
  it('emits header + rows separated by newlines', () => {
    const apps: CsvAppRow[] = [
      { application_number: 'A1', applicant_id: 'u1', status: 'submitted', data: {} },
      { application_number: 'A2', applicant_id: 'u1', status: 'approved', data: {} },
    ];
    const csv = buildCsv(apps, lookups);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith('A1,')).toBe(true);
    expect(lines[2].startsWith('A2,')).toBe(true);
  });

  it('returns just the header for empty input', () => {
    expect(buildCsv([], lookups)).toBe(CSV_HEADER.join(','));
  });

  it('header contains payment summary columns but no raw data column', () => {
    expect(CSV_HEADER).toContain('Payment Status');
    expect(CSV_HEADER).toContain('Payment Amount');
    expect(CSV_HEADER).toContain('Applicant Email');
    expect(CSV_HEADER).not.toContain('Data');
    expect(CSV_HEADER).not.toContain('Raw Data');
  });
});
