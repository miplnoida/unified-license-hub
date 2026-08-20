/**
 * RDM-ENTITY-001 — declarative field schema for the Phase 1 metadata tables.
 *
 * The admin UI is generated from this schema so adding a configurable
 * attribute is a one-line change here, not a new screen.
 */
import type { RdmTable } from '@/hooks/useRegulatoryDataModel';

export type RdmFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'date';

export interface RdmField {
  name: string;
  label: string;
  type: RdmFieldType;
  required?: boolean;
  options?: string[];
  /** Show in the list view (all fields always show in the editor). */
  inList?: boolean;
  help?: string;
  /** Editable on create, locked afterwards (DB-enforced immutability). */
  immutable?: boolean;
  /** Computed by the database (generated column) — displayed, never submitted. */
  derived?: boolean;
}


export interface RdmTableSchema {
  table: RdmTable;
  title: string;
  description: string;
  singular: string;
  fields: RdmField[];
}

const KEY_FIELD: RdmField = {
  name: 'key',
  label: 'Key',
  type: 'text',
  required: true,
  inList: true,
  immutable: true,
  help: 'Stable machine key referenced by workflows, rules and integrations. Immutable once created — retire the row and create a new key instead.',
};
const LABEL_FIELD: RdmField = { name: 'label', label: 'Label', type: 'text', required: true, inList: true };
const DESC_FIELD: RdmField = { name: 'description', label: 'Description', type: 'textarea' };
const ORDER_FIELD: RdmField = { name: 'sort_order', label: 'Sort order', type: 'number', inList: true };
const ACTIVE_FIELD: RdmField = { name: 'is_active', label: 'Active', type: 'boolean', inList: true };


export const RDM_SCHEMAS: Record<string, RdmTableSchema> = {
  classification_schemes: {
    table: 'classification_schemes',
    title: 'Classification Schemes',
    description: 'Named taxonomies that can be applied to entities, licences or applications.',
    singular: 'scheme',
    fields: [
      KEY_FIELD, LABEL_FIELD, DESC_FIELD,
      { name: 'applies_to', label: 'Applies to', type: 'select', options: ['entity', 'license', 'application', 'individual', 'form'], required: true, inList: true },
      { name: 'is_hierarchical', label: 'Hierarchical', type: 'boolean', inList: true },
      { name: 'allow_multiple', label: 'Allow multiple values', type: 'boolean', inList: true },
      ORDER_FIELD, ACTIVE_FIELD,
    ],
  },
  classification_values: {
    table: 'classification_values',
    title: 'Classification Values',
    description: 'Values inside the selected scheme, optionally effective-dated.',
    singular: 'value',
    fields: [
      KEY_FIELD, LABEL_FIELD,
      { name: 'code', label: 'Code', type: 'text', inList: true },
      DESC_FIELD,
      { name: 'effective_from', label: 'Effective from', type: 'date' },
      { name: 'effective_to', label: 'Effective to', type: 'date' },
      ORDER_FIELD, ACTIVE_FIELD,
    ],
  },
  lifecycle_stages: {
    table: 'lifecycle_stages',
    title: 'Lifecycle Stages',
    description: 'Separate vocabularies per domain: entity lifecycle, licence status and application status are never mixed. An entity holding several licences keeps one entity stage while each licence carries its own status.',
    singular: 'stage',
    fields: [
      KEY_FIELD, LABEL_FIELD, DESC_FIELD,
      { name: 'domain', label: 'Domain', type: 'select', options: ['entity', 'license', 'application', 'individual'], required: true, inList: true, help: 'Entity = organisation lifecycle. License = per-licence status. Application = case status. Individual = person status.' },
      { name: 'is_terminal', label: 'Terminal stage', type: 'boolean', inList: true, help: 'Terminal within its own domain only. An application or licence ending never terminates the entity.' },
      ORDER_FIELD, ACTIVE_FIELD,
    ],
  },

  entity_identity_statuses: {
    table: 'entity_identity_statuses',
    title: 'Identity Statuses',
    description: 'Verification state of an entity’s legal identity — separate from its regulatory status.',
    singular: 'status',
    fields: [
      KEY_FIELD, LABEL_FIELD, DESC_FIELD,
      { name: 'requires_verification', label: 'Requires verification', type: 'boolean', inList: true },
      { name: 'blocks_licensing', label: 'Blocks licensing actions', type: 'boolean', inList: true },
      ORDER_FIELD, ACTIVE_FIELD,
    ],
  },
  relationship_types: {
    table: 'relationship_types',
    title: 'Relationship Types',
    description: 'Typed entity-to-entity and entity-to-person relationships. Ownership relationships are graph semantics only — shareholding percentages, voting rights and beneficial-ownership history belong to the future ownership model, not here.',
    singular: 'relationship type',
    fields: [
      KEY_FIELD, LABEL_FIELD, DESC_FIELD,
      { name: 'category', label: 'Category', type: 'select', options: ['group', 'ownership', 'control', 'structure', 'commercial'], required: true, inList: true },
      { name: 'is_ownership', label: 'Ownership', type: 'boolean', inList: true },
      { name: 'is_group', label: 'Group structure', type: 'boolean', inList: true },
      { name: 'inverse_key', label: 'Inverse relationship', type: 'text', inList: true, help: 'Key of the mirrored relationship. Must resolve to an existing relationship type — the database stores the resolved reference and rejects unknown keys.' },
      ORDER_FIELD, ACTIVE_FIELD,
    ],

  },
  role_types: {
    table: 'role_types',
    title: 'Role Types',
    description: 'Regulated roles an individual can hold at an entity, and whether Fit & Proper applies.',
    singular: 'role type',
    fields: [
      KEY_FIELD, LABEL_FIELD, DESC_FIELD,
      { name: 'category', label: 'Category', type: 'select', options: ['board', 'executive', 'key_function', 'governance', 'administrative'], required: true, inList: true },
      { name: 'is_governance', label: 'Governance role', type: 'boolean', inList: true },
      { name: 'requires_fit_and_proper', label: 'Requires Fit & Proper', type: 'boolean', inList: true },
      ORDER_FIELD, ACTIVE_FIELD,
    ],
  },
  form_purposes: {
    table: 'form_purposes',
    title: 'Form Purposes',
    description: 'Why a form exists in regulatory terms, replacing hardcoded form-type strings.',
    singular: 'purpose',
    fields: [
      KEY_FIELD, LABEL_FIELD, DESC_FIELD,
      { name: 'domain', label: 'Domain', type: 'text', inList: true },
      { name: 'legacy_form_type', label: 'Legacy form_type', type: 'text', inList: true, help: 'Existing form_template.form_type value this purpose maps to.' },
      ORDER_FIELD, ACTIVE_FIELD,
    ],
  },
  form_trigger_types: {
    table: 'form_trigger_types',
    title: 'Form Trigger Types',
    description: 'What causes a form instance to be created.',
    singular: 'trigger type',
    fields: [KEY_FIELD, LABEL_FIELD, DESC_FIELD, ORDER_FIELD, ACTIVE_FIELD],
  },
  data_domains: {
    table: 'data_domains',
    title: 'Data Domains & Ownership',
    description: 'Which system is authoritative for each class of regulatory data. Legal identity is deployment-configured (no external registry is assumed); regulatory status is always owned by this platform.',
    singular: 'data domain',
    fields: [
      KEY_FIELD, LABEL_FIELD, DESC_FIELD,
      { name: 'default_authority', label: 'Authoritative source', type: 'select', options: ['SUPTECH', 'EXTERNAL_REGISTRY', 'DEPLOYMENT_CONFIGURED'], required: true, inList: true, help: 'DEPLOYMENT_CONFIGURED means the deployment chooses via an entity resolution policy.' },
      ORDER_FIELD, ACTIVE_FIELD,
    ],
  },

  entity_identifier_types: {
    table: 'entity_identifier_types',
    title: 'Entity Identifier Types',
    description: 'Identifiers an entity can carry and the scope in which each value must be unique. Company and taxpayer numbers are unique per jurisdiction, never globally.',
    singular: 'identifier type',
    fields: [
      KEY_FIELD, LABEL_FIELD, DESC_FIELD,
      { name: 'issuer', label: 'Issuer', type: 'text', inList: true },
      { name: 'uniqueness_scope', label: 'Uniqueness scope', type: 'select', options: ['NONE', 'GLOBAL', 'JURISDICTION', 'ISSUER', 'REGULATOR'], required: true, inList: true, help: 'GLOBAL = unique worldwide (e.g. LEI). JURISDICTION = unique per issuing country/registry. ISSUER = unique per issuing body. REGULATOR = unique within this deployment. NONE = no uniqueness enforced.' },
      { name: 'scope_requires_jurisdiction', label: 'Requires jurisdiction', type: 'boolean', inList: true, derived: true },
      { name: 'scope_requires_issuer', label: 'Requires issuer', type: 'boolean', derived: true },
      { name: 'scope_requires_regulator', label: 'Requires regulator', type: 'boolean', derived: true },
      { name: 'normalization_rule', label: 'Normalisation rule', type: 'text', help: 'How a value is normalised before comparison or uniqueness checks.' },
      { name: 'is_unique_global', label: 'Globally unique (legacy)', type: 'boolean', derived: true, help: 'Compatibility flag only — derived from uniqueness scope GLOBAL.' },

      { name: 'validation_regex', label: 'Validation pattern', type: 'text' },
      ORDER_FIELD, ACTIVE_FIELD,
    ],
  },

  entity_resolution_policies: {
    table: 'entity_resolution_policies',
    title: 'Entity Resolution Policies',
    description: 'How the platform decides whether an incoming organisation is an existing entity, and who owns legal identity.',
    singular: 'policy',
    fields: [
      KEY_FIELD, LABEL_FIELD, DESC_FIELD,
      { name: 'registry_authority_mode', label: 'Authority mode', type: 'select', options: ['LOCAL_AUTHORITATIVE', 'EXTERNAL_AUTHORITATIVE', 'HYBRID_AUTHORITY'], required: true, inList: true },
      { name: 'on_exact_match', label: 'On exact match', type: 'select', options: ['REUSE_LOCAL_ENTITY', 'MANUAL_REVIEW'], required: true, inList: true },
      { name: 'on_possible_match', label: 'On possible match', type: 'select', options: ['CREATE_RESOLUTION_CASE', 'BLOCK', 'MANUAL_REVIEW'], required: true, inList: true },
      { name: 'on_no_match', label: 'On no match', type: 'select', options: ['CREATE_LOCAL_ENTITY', 'CREATE_VIA_EXTERNAL_API', 'BLOCK', 'ALLOW_PROVISIONAL', 'MANUAL_REVIEW'], required: true, inList: true },
      { name: 'allow_provisional_entity', label: 'Allow provisional entity', type: 'boolean', inList: true },
      { name: 'is_default', label: 'Default policy', type: 'boolean', inList: true },
      ACTIVE_FIELD,
    ],
  },
  entity_registry_failure_policies: {
    table: 'entity_registry_failure_policies',
    title: 'Registry Failure Policies',
    description: 'Behaviour when an external registry is unavailable — never silent, always governed.',
    singular: 'failure policy',
    fields: [
      KEY_FIELD, LABEL_FIELD, DESC_FIELD,
      { name: 'on_provider_unavailable', label: 'On provider unavailable', type: 'select', options: ['ALLOW_LAST_VERIFIED', 'BLOCK', 'ALLOW_PROVISIONAL', 'MANUAL_REVIEW'], required: true, inList: true },
      { name: 'allow_last_verified_projection', label: 'Allow last verified projection', type: 'boolean', inList: true },
      { name: 'max_staleness_hours', label: 'Max staleness (hours)', type: 'number', inList: true },
      { name: 'is_default', label: 'Default policy', type: 'boolean', inList: true },
      ACTIVE_FIELD,
    ],
  },
};
