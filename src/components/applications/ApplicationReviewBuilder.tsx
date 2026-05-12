import { useMemo } from 'react';
import { useLatestPublishedVersion, useVersionSections, useFormVersion } from '@/hooks/useFormTemplates';
import { ReviewAcknowledgement } from './ReviewAcknowledgement';
import { Badge } from '@/components/ui/badge';
import { isAttachmentValue } from '@/components/registration/AttachmentDisplay';
import type { FormSection, FormField, ConditionalRule } from '@/types/formBuilder';

interface TemplateLite {
  id: string;
  name: string;
}

interface Props {
  templates: TemplateLite[];
  formProgressMap: Record<string, { data: Record<string, any> }>;
  /** Optional pinned version per template (overrides latest published) */
  versionIdByTemplate?: Record<string, string>;
  mode: 'readonly' | 'editable';
  loading?: boolean;
  onAcknowledge: () => void;
  onEdit?: (templateIndex: number) => void;
  title?: string;
  description?: string;
}

/**
 * Wrapper that loads the published schema for each form template and renders
 * the ReviewAcknowledgement with proper field labels (instead of raw keys).
 */
export function ApplicationReviewBuilder(props: Props) {
  return (
    <ReviewBuilderInner {...props} />
  );
}

function ReviewBuilderInner({
  templates, formProgressMap, versionIdByTemplate, mode, loading, onAcknowledge, onEdit, title, description,
}: Props) {
  // Review must use the pinned form version (versionIdByTemplate) used to fill the application
  // to avoid mismatched dynamic field keys. Latest is only a fallback for legacy/no-pinned cases.
  const templateSections = templates.map(t =>
    useTemplateSections(t.id, versionIdByTemplate?.[t.id])
  );

  const sections = useMemo(() => {
    return templates.map((t, idx) => {
      const { sections: secs, versionLabel } = templateSections[idx] || { sections: [], versionLabel: null };
      const data = formProgressMap[t.id]?.data || {};
      const allFields = secs.flatMap((sec: FormSection) => sec.fields || []);
      const fields: Array<{ label: string; value: any; type?: 'attachment' }> = [];

      secs.forEach((sec: FormSection) => {
        if (!isConditionalTargetVisible(sec.conditionalLogic, data, allFields)) return;

        (sec.fields || []).forEach((f: FormField) => {
          if (f.type === 'paragraph' || f.type === 'heading') return;
          if (!f.label && !f.fieldName) return;
          if (!isConditionalTargetVisible(f.conditionalLogic, data, allFields)) return;

          const raw = resolveDynamicFieldValue(data, f);
          if (import.meta.env.DEV && raw === undefined && Object.keys(data).length > 0) {
            // eslint-disable-next-line no-console
            console.debug('[ReviewBuilder] Missing value for field', {
              label: f.label,
              fieldName: f.fieldName,
              id: f.id,
              availableKeys: Object.keys(data),
            });
          }
          const formatted = formatValue(raw, f);
          fields.push({
            label: f.label || f.fieldName,
            value: formatted,
            type: f.type === 'file' || isAttachmentValue(formatted) ? 'attachment' : undefined,
          });
        });
      });

      // Fallback: if no schema fields resolved yet, dump raw entries
      if (fields.length === 0) {
        Object.entries(data)
          .filter(([k]) => !k.startsWith('_') && k.trim().length > 0)
          .forEach(([k, v]) => {
            fields.push({
              label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              value: typeof v === 'object' && v !== null ? JSON.stringify(v) : (v as any),
            });
          });
      }

      const titleNode = versionLabel ? (
        <span className="flex items-center gap-2">
          {t.name}
          <Badge variant="outline" className="text-[10px]">v{versionLabel}</Badge>
        </span>
      ) : t.name;

      return { title: titleNode as any, fields };
    });
  }, [templates, templateSections, formProgressMap]);

  return (
    <ReviewAcknowledgement
      mode={mode}
      loading={loading}
      onAcknowledge={onAcknowledge}
      onEdit={onEdit}
      title={title}
      description={description}
      sections={sections}
    />
  );
}

function useTemplateSections(templateId: string, pinnedVersionId?: string) {
  const { data: latest } = useLatestPublishedVersion(templateId);
  const resolvedVersionId = pinnedVersionId || latest?.id || null;
  const { data: sections = [] } = useVersionSections(resolvedVersionId);
  const { data: versionInfo } = useFormVersion(resolvedVersionId);
  const versionLabel = versionInfo?.semantic_version || (versionInfo?.version ? String(versionInfo.version) : null);
  return { sections, versionLabel };
}

function formatValue(value: any, field: FormField): any {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (field.type === 'table') {
      return `${value.length} row(s)`;
    }
    return value.join(', ');
  }
  if (typeof value === 'object') {
    if ((value as any).fileName) return (value as any).fileName;
    if ((value as any).name) return (value as any).name;
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value;
  return value;
}

function normalizeKey(value: any): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getConditionalRuleValue(rule: ConditionalRule, data: Record<string, any>, allFields: FormField[]) {
  const watchedField = allFields.find((candidate) => candidate.id === rule.fieldId);
  if (!watchedField) return undefined;
  return resolveDynamicFieldValue(data, watchedField);
}

function evaluateConditionalRule(rule: ConditionalRule, data: Record<string, any>, allFields: FormField[]) {
  const rawValue = getConditionalRuleValue(rule, data, allFields);
  const normalizedString = Array.isArray(rawValue)
    ? rawValue.map((item) => String(item)).join(',')
    : rawValue == null ? '' : String(rawValue);

  switch (rule.operator) {
    case 'equals': return normalizedString === String(rule.value || '');
    case 'not_equals': return normalizedString !== String(rule.value || '');
    case 'contains':
      return Array.isArray(rawValue)
        ? rawValue.map((item) => String(item)).includes(String(rule.value || ''))
        : normalizedString.includes(String(rule.value || ''));
    case 'not_contains':
      return Array.isArray(rawValue)
        ? !rawValue.map((item) => String(item)).includes(String(rule.value || ''))
        : !normalizedString.includes(String(rule.value || ''));
    case 'greater_than': return Number(rawValue) > Number(rule.value || 0);
    case 'less_than': return Number(rawValue) < Number(rule.value || 0);
    case 'is_empty':
      return rawValue == null
        || rawValue === ''
        || (Array.isArray(rawValue) && rawValue.length === 0);
    case 'is_not_empty':
      return !(
        rawValue == null
        || rawValue === ''
        || (Array.isArray(rawValue) && rawValue.length === 0)
      );
    default:
      return false;
  }
}

function isConditionalTargetVisible(
  conditionalLogic: ConditionalRule[] | undefined,
  data: Record<string, any>,
  allFields: FormField[],
) {
  if (!conditionalLogic?.length) return true;
  for (const rule of conditionalLogic) {
    const result = evaluateConditionalRule(rule, data, allFields);
    if (rule.action === 'show' && !result) return false;
    if (rule.action === 'hide' && result) return false;
  }
  return true;
}

function resolveDynamicFieldValue(data: Record<string, any>, field: FormField): any {
  if (!data || !field) return undefined;
  const legacyAliases = [
    ...(Array.isArray((field as any).aliases) ? (field as any).aliases : []),
    ...(Array.isArray((field as any).legacyAliases) ? (field as any).legacyAliases : []),
    ...(Array.isArray((field as any).metadata?.aliases) ? (field as any).metadata.aliases : []),
  ];
  const candidates = [
    field.fieldName,
    field.id,
    (field as any).field_name,
    field.fieldName ? normalizeKey(field.fieldName) : null,
    field.label ? normalizeKey(field.label) : null,
    field.label,
    ...legacyAliases,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0);

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return data[key];
    }
  }
  // Case-insensitive fallback
  const lowerMap: Record<string, string> = {};
  Object.keys(data).forEach(k => { lowerMap[k.toLowerCase()] = k; });
  for (const key of candidates) {
    const hit = lowerMap[String(key).toLowerCase()];
    if (hit) return data[hit];
  }
  return undefined;
}

