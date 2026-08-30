/**
 * Entity 360 section catalogue.
 *
 * Every supervisory domain declares:
 *  - which navigation group it belongs to (so the profile reads as a small set
 *    of meaningful areas rather than a 19-tab strip);
 *  - a business title and a one-line purpose statement;
 *  - a semantic column model for its records, so a regulator sees named
 *    business attributes instead of raw database keys.
 *
 * Columns are declared with the shared `GridColumn` contract, so every section
 * inherits sorting, filtering, column choice and export from the enterprise
 * grid. Sections not returned by `entity360_overview.sections` are never shown.
 */
import type { ReactNode } from 'react';
import {
  Banknote, BookUser, Boxes, Building2, FileText, Gavel, IdCard, LineChart,
  Mail, MessageSquareWarning, Network, ScrollText, ShieldAlert, ShieldCheck,
  Siren, Stamp, TrendingUp, UserCheck, Users, type LucideIcon,
} from 'lucide-react';
import { StatusBadge } from '@/components/presentation/StatusBadge';
import { humanize, titleCase } from '@/lib/presentation/statusLabels';
import {
  EMPTY, formatCount, formatDate, formatNumber, formatPercent, formatTemporal,
  formatTimestamp, isBlank,
} from '@/lib/presentation/format';
import type { GridColumn } from '@/components/data-grid';
import type { E360SectionKey } from '@/hooks/useEntity360';

export type SectionRow = Record<string, any>;
export type SectionColumn = GridColumn<SectionRow>;

export type E360GroupKey =
  | 'identity' | 'ownership' | 'obligations' | 'risk' | 'conduct' | 'oversight' | 'records';

export interface E360Group {
  key: E360GroupKey;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const E360_GROUPS: E360Group[] = [
  { key: 'identity', label: 'Identity & authorisation', description: 'Who the entity is and what it is licensed to do.', icon: IdCard },
  { key: 'ownership', label: 'Ownership & control', description: 'Who owns, controls and directs the entity.', icon: Users },
  { key: 'obligations', label: 'Reporting & obligations', description: 'What the entity must file and whether it has filed it.', icon: ScrollText },
  { key: 'risk', label: 'Prudential & risk', description: 'Financial soundness, risk rating and supervisory judgement.', icon: TrendingUp },
  { key: 'conduct', label: 'Conduct & financial crime', description: 'Customer treatment, market conduct and AML/CFT.', icon: ShieldAlert },
  { key: 'oversight', label: 'Supervisory action', description: 'Examinations, enforcement and outstanding requests.', icon: Gavel },
  { key: 'records', label: 'Records & provenance', description: 'Evidence, correspondence and the audit of where data came from.', icon: FileText },
];

/* ------------------------------------------------------------------ */
/* Column builders                                                     */
/* ------------------------------------------------------------------ */

const text = (id: string, header: string, opts: Partial<SectionColumn> = {}): SectionColumn => ({
  id,
  header,
  accessor: (r) => r[id],
  sortable: true,
  priority: 1,
  ...opts,
});

const status = (id: string, header = 'Status', opts: Partial<SectionColumn> = {}): SectionColumn => ({
  id,
  header,
  accessor: (r) => r[id],
  cell: (r) => <StatusBadge code={r[id]} label={r[`${id}_label`]} />,
  sortable: true,
  filterable: true,
  filterType: 'multiEnum',
  priority: 1,
  ...opts,
});

const date = (id: string, header: string, opts: Partial<SectionColumn> = {}): SectionColumn => ({
  id,
  header,
  accessor: (r) => r[id],
  cell: (r) => (isBlank(r[id]) ? <span className="text-muted-foreground">{EMPTY}</span> : formatDate(r[id])),
  sortable: true,
  filterable: true,
  filterType: 'dateRange',
  priority: 2,
  ...opts,
});

const timestamp = (id: string, header: string, opts: Partial<SectionColumn> = {}): SectionColumn => ({
  id,
  header,
  accessor: (r) => r[id],
  cell: (r) => (isBlank(r[id]) ? <span className="text-muted-foreground">{EMPTY}</span> : formatTimestamp(r[id])),
  sortable: true,
  priority: 3,
  ...opts,
});

const num = (id: string, header: string, opts: Partial<SectionColumn> = {}): SectionColumn => ({
  id,
  header,
  accessor: (r) => (isBlank(r[id]) ? null : Number(r[id])),
  cell: (r) => formatNumber(r[id]),
  align: 'right',
  sortable: true,
  priority: 2,
  ...opts,
});

const percent = (id: string, header: string, opts: Partial<SectionColumn> = {}): SectionColumn => ({
  id,
  header,
  accessor: (r) => (isBlank(r[id]) ? null : Number(r[id])),
  cell: (r) => formatPercent(r[id]),
  align: 'right',
  sortable: true,
  priority: 1,
  ...opts,
});

const count = (id: string, header: string, opts: Partial<SectionColumn> = {}): SectionColumn => ({
  id,
  header,
  accessor: (r) => (isBlank(r[id]) ? null : Number(r[id])),
  cell: (r) => formatCount(r[id]),
  align: 'right',
  sortable: true,
  priority: 2,
  ...opts,
});

const bool = (id: string, header: string, opts: Partial<SectionColumn> = {}): SectionColumn => ({
  id,
  header,
  accessor: (r) => r[id] === true,
  cell: (r) => (
    r[id] === true
      ? <StatusBadge code="yes" label="Yes" tone="warning" />
      : <span className="text-muted-foreground">No</span>
  ),
  sortable: true,
  filterable: true,
  filterType: 'boolean',
  priority: 2,
  ...opts,
});

/** Free-text narrative — clamped, full value on hover. */
const note = (id: string, header: string): SectionColumn => ({
  id,
  header,
  accessor: (r) => r[id],
  sortable: false,
  truncate: true,
  priority: 3,
  minWidth: '14rem',
  defaultVisible: false,
});

/* ------------------------------------------------------------------ */
/* Section definitions                                                 */
/* ------------------------------------------------------------------ */

export interface E360SectionDef {
  key: E360SectionKey;
  group: E360GroupKey;
  label: string;
  /** One line telling the regulator what this section answers. */
  purpose: string;
  icon: LucideIcon;
  /** Replays recorded state at the selected "as at" date. */
  temporal?: boolean;
  /** Semantic columns; unknown extra fields are appended automatically. */
  columns: SectionColumn[];
  /** Primary business label used in mobile/expanded summaries. */
  titleField?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rendered as a compact record list rather than a grid. */
  layout?: 'grid' | 'cards' | 'timeline';
}

export const E360_SECTIONS: E360SectionDef[] = [
  {
    key: 'identity',
    group: 'identity',
    label: 'Identity',
    purpose: 'Registered names, identifiers and identity verification state.',
    icon: IdCard,
    temporal: true,
    titleField: 'name',
    columns: [
      text('name', 'Name', { sticky: 'left', minWidth: '16rem', filterable: true, filterType: 'text' }),
      text('identifier_type', 'Identifier type', { filterable: true, filterType: 'enum' }),
      text('identifier_value', 'Identifier'),
      text('issuing_authority', 'Issued by', { priority: 2 }),
      status('verification_status', 'Verification'),
      date('valid_from', 'Valid from'),
      date('valid_to', 'Valid to'),
    ],
  },
  {
    key: 'licences',
    group: 'identity',
    label: 'Licences',
    purpose: 'Every authorisation held, with its scope, conditions and validity.',
    icon: Stamp,
    temporal: true,
    titleField: 'licence_number',
    columns: [
      text('licence_number', 'Licence number', { sticky: 'left', minWidth: '12rem', filterable: true, filterType: 'text' }),
      text('licence_type', 'Type', { filterable: true, filterType: 'multiEnum' }),
      status('status', 'Licence status'),
      text('regulator', 'Regulator', { priority: 2 }),
      date('effective_from', 'Effective from'),
      date('effective_to', 'Expires'),
      count('conditions', 'Conditions'),
      note('scope', 'Permitted scope'),
    ],
  },
  {
    key: 'business_profile',
    group: 'identity',
    label: 'Business profile',
    purpose: 'Activities, products, channels and operating footprint.',
    icon: Building2,
    temporal: true,
    titleField: 'activity',
    columns: [
      text('activity', 'Activity', { sticky: 'left', minWidth: '14rem', filterable: true, filterType: 'text' }),
      text('product', 'Product', { filterable: true, filterType: 'enum' }),
      text('channel', 'Channel', { filterable: true, filterType: 'enum' }),
      text('jurisdiction', 'Jurisdiction', { filterable: true, filterType: 'enum' }),
      status('status'),
      date('valid_from', 'From'),
      date('valid_to', 'To'),
    ],
  },
  {
    key: 'ownership',
    group: 'ownership',
    label: 'Ownership',
    purpose: 'Shareholders, controllers and ultimate beneficial owners.',
    icon: Boxes,
    temporal: true,
    titleField: 'owner_name',
    columns: [
      text('owner_name', 'Owner', { sticky: 'left', minWidth: '16rem', filterable: true, filterType: 'text' }),
      text('owner_kind', 'Owner type', { filterable: true, filterType: 'enum' }),
      text('ownership_type', 'Ownership type', { filterable: true, filterType: 'enum' }),
      percent('economic_interest_percentage', 'Economic %'),
      percent('voting_rights_percentage', 'Voting %'),
      percent('beneficial_interest_percentage', 'Beneficial %'),
      bool('is_direct', 'Direct'),
      bool('is_controller', 'Controller'),
      bool('recorded_ubo', 'Recorded UBO'),
      status('approval_status', 'Approval'),
      text('source', 'Source', { filterable: true, filterType: 'enum' }),
      date('valid_from', 'Held from'),
      date('valid_to', 'Held to'),
    ],
  },
  {
    key: 'governance',
    group: 'ownership',
    label: 'Governance',
    purpose: 'Directors, senior officers and approved appointments.',
    icon: BookUser,
    temporal: true,
    titleField: 'person_name',
    columns: [
      text('person_name', 'Individual', { sticky: 'left', minWidth: '16rem', filterable: true, filterType: 'text' }),
      text('role', 'Role', { filterable: true, filterType: 'multiEnum' }),
      status('approval_status', 'Approval'),
      date('appointed_on', 'Appointed'),
      date('resigned_on', 'Ceased'),
      bool('is_executive', 'Executive'),
    ],
  },
  {
    key: 'relationships',
    group: 'ownership',
    label: 'Group relationships',
    purpose: 'Parents, subsidiaries and affiliates in the regulatory group.',
    icon: Network,
    temporal: true,
    titleField: 'related_entity_name',
    columns: [
      text('related_entity_name', 'Related party', { sticky: 'left', minWidth: '16rem', filterable: true, filterType: 'text' }),
      text('related_party_kind', 'Party type', { filterable: true, filterType: 'enum' }),
      text('relationship_type', 'Relationship', { filterable: true, filterType: 'multiEnum' }),
      text('perspective', 'Direction', { filterable: true, filterType: 'enum' }),
      status('status'),
      text('source', 'Source', { filterable: true, filterType: 'enum' }),
      date('valid_from', 'From'),
      date('valid_to', 'To'),
    ],
  },
  {
    key: 'fit_and_proper',
    group: 'ownership',
    label: 'Fit & proper',
    purpose: 'Assessment outcomes for controllers and senior individuals.',
    icon: UserCheck,
    titleField: 'person_name',
    columns: [
      text('person_name', 'Individual', { sticky: 'left', minWidth: '16rem', filterable: true, filterType: 'text' }),
      text('role', 'Proposed role', { filterable: true, filterType: 'enum' }),
      status('assessment_status', 'Assessment'),
      status('determination', 'Determination'),
      date('submitted_on', 'Submitted'),
      date('determined_on', 'Determined'),
      note('rationale', 'Rationale'),
    ],
  },
  {
    key: 'returns',
    group: 'obligations',
    label: 'Return filings',
    purpose: 'Filing history against every reporting obligation.',
    icon: ScrollText,
    titleField: 'return_name',
    columns: [
      text('return_name', 'Return', { sticky: 'left', minWidth: '16rem', filterable: true, filterType: 'text' }),
      text('period_key', 'Period', { filterable: true, filterType: 'text' }),
      text('frequency', 'Frequency', { filterable: true, filterType: 'enum' }),
      status('status', 'Filing status'),
      date('due_date', 'Due'),
      date('submitted_at', 'Submitted'),
      num('version', 'Version', { priority: 3 }),
    ],
  },
  {
    key: 'prudential',
    group: 'risk',
    label: 'Prudential',
    purpose: 'Capital, liquidity and asset-quality assessment outcomes.',
    icon: Banknote,
    titleField: 'metric_name',
    columns: [
      text('metric_name', 'Measure', { sticky: 'left', minWidth: '16rem', filterable: true, filterType: 'text' }),
      text('period_key', 'Period', { filterable: true, filterType: 'text' }),
      num('value', 'Reported value'),
      num('threshold', 'Threshold'),
      status('assessment_status', 'Assessment'),
      status('rating', 'Rating'),
      date('assessment_date', 'Assessed'),
      note('commentary', 'Supervisory commentary'),
    ],
  },
  {
    key: 'risk',
    group: 'risk',
    label: 'Risk rating',
    purpose: 'Composite risk score, band and the drivers behind it.',
    icon: LineChart,
    titleField: 'period_key',
    columns: [
      text('period_key', 'Period', { sticky: 'left', minWidth: '10rem', filterable: true, filterType: 'text' }),
      status('band', 'Risk band'),
      num('score', 'Score'),
      text('methodology', 'Methodology', { priority: 3 }),
      timestamp('computed_at', 'Computed'),
      note('drivers', 'Key drivers'),
    ],
  },
  {
    key: 'supervision',
    group: 'risk',
    label: 'Supervision',
    purpose: 'Assigned supervisor, plan cycle and outstanding actions.',
    icon: ShieldCheck,
    titleField: 'plan_name',
    columns: [
      text('plan_name', 'Plan / action', { sticky: 'left', minWidth: '16rem', filterable: true, filterType: 'text' }),
      text('supervisor_name', 'Owner', { filterable: true, filterType: 'text' }),
      text('team', 'Team', { filterable: true, filterType: 'enum' }),
      status('status'),
      date('cycle_start', 'Cycle start'),
      date('cycle_end', 'Cycle end'),
      date('due_date', 'Action due'),
    ],
  },
  {
    key: 'market_conduct',
    group: 'conduct',
    label: 'Market conduct',
    purpose: 'Complaints, conduct alerts and customer-outcome issues.',
    icon: MessageSquareWarning,
    titleField: 'reference',
    columns: [
      text('reference', 'Reference', { sticky: 'left', minWidth: '12rem', filterable: true, filterType: 'text' }),
      text('subject', 'Subject', { truncate: true, minWidth: '16rem' }),
      text('category', 'Category', { filterable: true, filterType: 'multiEnum' }),
      status('status'),
      status('outcome', 'Outcome'),
      date('received_at', 'Received'),
      date('closed_at', 'Closed'),
    ],
  },
  {
    key: 'aml',
    group: 'conduct',
    label: 'AML/CFT',
    purpose: 'Financial-crime risk assessment and open findings.',
    icon: ShieldAlert,
    titleField: 'assessment_reference',
    columns: [
      text('assessment_reference', 'Assessment', { sticky: 'left', minWidth: '14rem', filterable: true, filterType: 'text' }),
      status('inherent_rating', 'Inherent risk'),
      status('control_effectiveness', 'Control effectiveness'),
      status('residual_rating', 'Residual risk'),
      count('open_findings', 'Open findings'),
      date('assessment_date', 'Assessed'),
      date('next_review_date', 'Next review'),
    ],
  },
  {
    key: 'aml_confidential',
    group: 'conduct',
    label: 'AML restricted',
    purpose: 'Restricted financial-crime intelligence, shown only to cleared staff.',
    icon: Siren,
    columns: [
      text('subject', 'Subject', { sticky: 'left', minWidth: '16rem' }),
      status('classification', 'Classification'),
      timestamp('recorded_at', 'Recorded'),
      note('detail', 'Detail'),
    ],
  },
  {
    key: 'resilience',
    group: 'conduct',
    label: 'Operational resilience',
    purpose: 'Outsourcing, critical providers and incident history.',
    icon: Boxes,
    titleField: 'arrangement_name',
    columns: [
      text('arrangement_name', 'Arrangement', { sticky: 'left', minWidth: '16rem', filterable: true, filterType: 'text' }),
      text('provider_name', 'Provider', { filterable: true, filterType: 'text' }),
      text('service_type', 'Service', { filterable: true, filterType: 'enum' }),
      bool('is_critical', 'Critical'),
      status('status'),
      date('start_date', 'Start'),
      date('end_date', 'End'),
    ],
  },
  {
    key: 'examinations',
    group: 'oversight',
    label: 'Examinations',
    purpose: 'Onsite and offsite examinations with their findings.',
    icon: ShieldCheck,
    titleField: 'examination_reference',
    columns: [
      text('examination_reference', 'Examination', { sticky: 'left', minWidth: '14rem', filterable: true, filterType: 'text' }),
      text('examination_type', 'Type', { filterable: true, filterType: 'multiEnum' }),
      status('status'),
      date('start_date', 'Started'),
      date('end_date', 'Concluded'),
      count('open_findings', 'Open findings'),
      note('scope', 'Scope'),
    ],
  },
  {
    key: 'enforcement',
    group: 'oversight',
    label: 'Enforcement',
    purpose: 'Directions, sanctions and penalties issued to the entity.',
    icon: Gavel,
    titleField: 'case_reference',
    columns: [
      text('case_reference', 'Case', { sticky: 'left', minWidth: '14rem', filterable: true, filterType: 'text' }),
      text('action_type', 'Action', { filterable: true, filterType: 'multiEnum' }),
      status('status'),
      num('penalty_amount', 'Penalty'),
      date('issued_on', 'Issued'),
      date('closed_on', 'Closed'),
      note('grounds', 'Grounds'),
    ],
  },
  {
    key: 'regulatory_requests',
    group: 'oversight',
    label: 'Regulatory requests',
    purpose: 'Information requests and controlled change submissions.',
    icon: Mail,
    titleField: 'reference',
    columns: [
      text('reference', 'Reference', { sticky: 'left', minWidth: '12rem', filterable: true, filterType: 'text' }),
      text('request_type', 'Type', { filterable: true, filterType: 'multiEnum' }),
      text('subject', 'Subject', { truncate: true, minWidth: '16rem' }),
      status('status'),
      date('requested_on', 'Requested'),
      date('due_date', 'Response due'),
      date('responded_on', 'Responded'),
    ],
  },
  {
    key: 'documents',
    group: 'records',
    label: 'Documents',
    purpose: 'Evidence on file, with version and validity.',
    icon: FileText,
    temporal: true,
    titleField: 'document_name',
    columns: [
      text('document_name', 'Document', { sticky: 'left', minWidth: '18rem', filterable: true, filterType: 'text' }),
      text('document_type', 'Type', { filterable: true, filterType: 'multiEnum' }),
      status('status'),
      num('version', 'Version', { priority: 3 }),
      date('valid_from', 'Valid from'),
      date('valid_to', 'Valid to'),
      timestamp('uploaded_at', 'Uploaded'),
    ],
  },
  {
    key: 'correspondence',
    group: 'records',
    label: 'Correspondence',
    purpose: 'Formal communications exchanged with the entity.',
    icon: Mail,
    titleField: 'subject',
    columns: [
      text('subject', 'Subject', { sticky: 'left', minWidth: '18rem', filterable: true, filterType: 'text' }),
      text('direction', 'Direction', { filterable: true, filterType: 'enum' }),
      text('channel', 'Channel', { filterable: true, filterType: 'enum' }),
      status('status'),
      timestamp('sent_at', 'Sent'),
      text('recipient', 'Recipient', { priority: 3 }),
    ],
  },
  {
    key: 'provenance',
    group: 'records',
    label: 'Provenance',
    purpose: 'Where each canonical value came from and when it changed.',
    icon: ScrollText,
    titleField: 'attribute',
    columns: [
      text('attribute', 'Attribute', { sticky: 'left', minWidth: '14rem', filterable: true, filterType: 'text' }),
      text('source_system', 'Source', { filterable: true, filterType: 'enum' }),
      text('source_reference', 'Source reference', { priority: 3 }),
      status('confidence', 'Confidence'),
      timestamp('recorded_at', 'Recorded'),
      text('recorded_by_name', 'Recorded by', { priority: 3 }),
    ],
  },
];

export const SECTION_BY_KEY = new Map(E360_SECTIONS.map((s) => [s.key, s]));

/** Technical keys never shown to a business user. */
export const TECHNICAL_KEYS = new Set([
  'id', 'entity_id', 'owner_party_id', 'person_party_id', 'related_entity_id',
  'fp_individual_id', 'change_set_id', 'file_path', 'party_id', 'created_by',
  'updated_by', 'organization_id', 'licence_id', 'filing_id', 'obligation_id',
  'source_id', 'source_table', 'tenant_id', 'regulator_id',
]);

/**
 * Builds the effective column set for a section: declared semantic columns
 * first, then any additional returned business fields (labelled from their key)
 * so nothing the backend provides is silently lost.
 */
export function resolveSectionColumns(
  def: E360SectionDef | undefined,
  rows: SectionRow[],
): SectionColumn[] {
  const declared = def?.columns ?? [];
  const declaredIds = new Set<string>(declared.map((c) => c.id));
  // label companions are consumed by their status column
  declared.forEach((c) => declaredIds.add(`${c.id}_label`));

  const present = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => present.add(k)));

  const used = declared.filter((c) => present.size === 0 || present.has(c.id));

  const extras: SectionColumn[] = [];
  present.forEach((key) => {
    if (declaredIds.has(key) || TECHNICAL_KEYS.has(key) || key.endsWith('_id')) return;
    if (key.endsWith('_label')) return;
    extras.push({
      id: key,
      header: titleCase(key),
      accessor: (r) => r[key],
      cell: (r) => {
        const v = r[key];
        if (isBlank(v)) return <span className="text-muted-foreground">{EMPTY}</span>;
        if (typeof v === 'boolean') return v ? 'Yes' : 'No';
        if (typeof v === 'object') return <span className="text-muted-foreground">Structured value</span>;
        if (typeof v === 'string' && /_/.test(v) && v === v.toLowerCase() && v.length < 40) return humanize(v);
        return formatTemporal(v);
      },
      sortable: true,
      priority: 3,
      defaultVisible: false,
    });
  });

  return [...used, ...extras.sort((a, b) => a.header.localeCompare(b.header))];
}

/** Best-effort business label for one record, used in expanded row summaries. */
export function sectionRowTitle(def: E360SectionDef | undefined, row: SectionRow): ReactNode {
  const field = def?.titleField;
  if (field && !isBlank(row[field])) return String(row[field]);
  for (const candidate of ['name', 'subject', 'reference', 'title']) {
    if (!isBlank(row[candidate])) return String(row[candidate]);
  }
  return def?.label ?? 'Record';
}
