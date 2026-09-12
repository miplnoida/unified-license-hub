import { useMemo } from 'react';
import { useLatestPublishedVersion, useVersionSections, useFormVersion } from '@/hooks/useFormTemplates';
import { ReviewAcknowledgement } from './ReviewAcknowledgement';
import { Badge } from '@/components/ui/badge';
import { isAttachmentValue } from '@/components/registration/AttachmentDisplay';
import type { FormSection, FormField, ConditionalRule } from '@/types/formBuilder';
import { isDisplayOnlyField, resolveDisplayKind, resolveDisplayOnlyFieldText } from '@/lib/registrationDisplayTypes';
import { deepEqualField, diffRepeatable, type DiffPair } from '@/lib/formDiff';
import { isSectionConfiguredVisible } from '@/lib/sectionVisibility';

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
  /**
   * Per-section edit. Receives the template index plus the id of the form
   * section the applicant asked to correct, so the wizard can open that exact
   * section. Falls back to `onEdit` when not provided.
   */
  onEditSection?: (templateIndex: number, sectionId: string) => void;
  /** When true (default), each form section is shown as its own review block. */
  splitSections?: boolean;
  title?: string;
  description?: string;
  /**
   * Renewal flow: baseline data per template (keyed by templateId). When
   * provided, each field is compared against this baseline and rendered with
   * a "Changed" badge + the prior value when it differs.
   */
  originalFormsData?: Record<string, Record<string, any>>;
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

type ReviewFieldEntry = { label: string; value: any; type?: 'attachment' | 'display' | 'table' | string; displayKind?: 'heading' | 'info' | 'divider'; headingLevel?: 1 | 2 | 3 | 4 | 5 | 6; placeholder?: string; defaultValue?: string; helpText?: string; originalValue?: any; changed?: boolean; tableColumns?: { id: string; label: string }[]; tablePairs?: DiffPair<Record<string, any>>[] };

function ReviewBuilderInner({
  templates, formProgressMap, versionIdByTemplate, mode, loading, onAcknowledge, onEdit, onEditSection,
  splitSections = true, title, description, originalFormsData,
}: Props) {
  // Review must use the pinned form version (versionIdByTemplate) used to fill the application
  // to avoid mismatched dynamic field keys. Latest is only a fallback for legacy/no-pinned cases.
  const templateSections = templates.map(t =>
    useTemplateSections(t.id, versionIdByTemplate?.[t.id])
  );

  const sections = useMemo(() => {
    return templates.flatMap((t, idx) => {
      const { sections: secs } = templateSections[idx] || { sections: [] };
      const data = formProgressMap[t.id]?.data || {};
      const originalData = originalFormsData?.[t.id] || null;
      const allFields = secs.flatMap((sec: FormSection) => sec.fields || []);
      const perSection: Array<{ sectionId: string; sectionTitle: string; fields: ReviewFieldEntry[] }> = [];

      secs.forEach((sec: FormSection) => {
        const fields: ReviewFieldEntry[] = [];

        // Admin-hidden sections never appear in the review summary.
        if (!isSectionConfiguredVisible(sec)) return;
        if (!isConditionalTargetVisible(sec.conditionalLogic, data, allFields)) return;

        (sec.fields || []).forEach((f: FormField) => {
          if (!f.label && !f.fieldName) return;
          if (!isConditionalTargetVisible(f.conditionalLogic, data, allFields)) return;

          if (isDisplayOnlyField(f)) {
            const kind = resolveDisplayKind(f.type);
            fields.push({
              label: f.label || '',
              value: resolveDisplayOnlyFieldText(f),
              type: 'display',
              displayKind: kind,
              headingLevel: f.headingLevel,
              placeholder: f.placeholder,
              defaultValue: f.defaultValue,
              helpText: f.helpText,
            });
            return;
          }

          const raw = resolveDynamicFieldValue(data, f);
          if (import.meta.env.DEV && raw === undefined && Object.keys(data).length > 0) {
             
            console.debug('[ReviewBuilder] Missing value for field', {
              label: f.label,
              fieldName: f.fieldName,
              id: f.id,
              availableKeys: Object.keys(data),
            });
          }
          const formatted = formatValue(raw, f);
          const originalRaw = originalData ? resolveDynamicFieldValue(originalData, f) : undefined;
          const originalFormatted = originalData ? formatValue(originalRaw, f) : undefined;
          const isAttachment = f.type === 'file' || isAttachmentValue(formatted);
          const changed = !!originalData && !deepEqualField(raw, originalRaw);

          // Tables: emit structured pairs so the review screen can render
          // per-row status badges (added/deleted/edited/reordered) instead
          // of a single "N row(s)" string.
          if (f.type === 'table') {
            const cols = (f.tableColumns || []).map((c) => ({ id: c.id, label: c.label }));
            const currentRows = Array.isArray(raw) ? raw : [];
            const originalRows = Array.isArray(originalRaw) ? originalRaw : [];
            const diff = originalData ? diffRepeatable(currentRows, originalRows) : null;
            fields.push({
              label: f.label || f.fieldName,
              value: `${currentRows.length} row(s)`,
              type: 'table',
              tableColumns: cols,
              tablePairs: diff
                ? diff.pairs as DiffPair<Record<string, any>>[]
                : currentRows.map((r, i) => ({ current: r as Record<string, any>, original: null, currentIndex: i, originalIndex: null, status: 'unchanged' as const })),
              changed,
            });
            return;
          }

          fields.push({
            label: f.label || f.fieldName,
            value: formatted,
            type: isAttachment ? 'attachment' : undefined,
            originalValue: originalFormatted,
            changed,
          });
        });

        perSection.push({
          sectionId: sec.id,
          sectionTitle: sec.title || 'Section',
          fields,
        });
      });

      const totalFields = perSection.reduce((sum, s) => sum + s.fields.length, 0);

      // Fallback: if no schema fields resolved yet, dump raw entries
      if (totalFields === 0) {
        const fallback: ReviewFieldEntry[] = [];
        Object.entries(data)
          .filter(([k]) => !k.startsWith('_') && k.trim().length > 0)
          .forEach(([k, v]) => {
            fallback.push({
              label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              value: typeof v === 'object' && v !== null ? JSON.stringify(v) : (v as any),
            });
          });
        return [{ title: t.name, fields: fallback, editRef: { templateIndex: idx } }];
      }

      if (!splitSections || perSection.length <= 1) {
        return [{
          title: t.name,
          fields: perSection.flatMap((s) => s.fields),
          editRef: { templateIndex: idx, sectionId: perSection.length === 1 ? perSection[0].sectionId : undefined },
        }];
      }

      return perSection.map((s) => ({
        title: `${t.name} — ${s.sectionTitle}`,
        fields: s.fields,
        editRef: { templateIndex: idx, sectionId: s.sectionId },
      }));
    });
  }, [templates, templateSections, formProgressMap, originalFormsData, splitSections]);


  return (
    <ReviewAcknowledgement
      mode={mode}
      loading={loading}
      onAcknowledge={onAcknowledge}
      onEdit={(sectionIndex, editRef) => {
        const templateIndex = editRef?.templateIndex ?? sectionIndex;
        if (editRef?.sectionId && onEditSection) {
          onEditSection(templateIndex, editRef.sectionId);
          return;
        }
        onEdit?.(templateIndex);
      }}
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
  if (field.type === 'file' || isAttachmentValue(value)) return value;
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
    field.id ? normalizeKey(field.id) : null,
    field.label ? normalizeKey(field.label) : null,
    field.label,
    ...legacyAliases,
    ...legacyAliases.map((alias: string) => normalizeKey(alias)),
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

