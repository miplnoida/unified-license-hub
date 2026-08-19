import type { FormSection, FormField, ConditionalRule } from '@/types/formBuilder';
import type { RegStep } from '@/types/registrationForm';

/**
 * Static (admin-configured) section/step visibility.
 *
 * Backward compatibility is critical: schemas saved before this feature have no
 * `isVisible` property at all, and those sections must remain visible. Hence the
 * `!== false` check rather than `=== true`.
 */
export function isSectionConfiguredVisible(section: { isVisible?: boolean } | null | undefined): boolean {
  return !!section && section.isVisible !== false;
}

/** Same semantics for registration builder steps. */
export function isRegStepConfiguredVisible(step: { isVisible?: boolean } | null | undefined): boolean {
  return !!step && step.isVisible !== false;
}

/** Filters registration steps down to the ones an applicant may see. */
export function visibleRegSteps<T extends { isVisible?: boolean }>(steps: T[] | null | undefined): T[] {
  return (steps || []).filter(isRegStepConfiguredVisible);
}

export type ConditionEvaluator = (
  rule: ConditionalRule,
  data: Record<string, any>,
  allFields: FormField[],
) => boolean;

/**
 * Resolves existing conditional-logic rules for a section. Kept separate so the
 * static visibility flag and the conditional rules stay independent concerns.
 */
export function isConditionallyVisible(
  rules: ConditionalRule[] | undefined,
  data: Record<string, any>,
  allFields: FormField[],
  evaluate: ConditionEvaluator,
): boolean {
  if (!rules?.length) return true;
  for (const rule of rules) {
    const result = evaluate(rule, data, allFields);
    if (rule.action === 'show' && !result) return false;
    if (rule.action === 'hide' && result) return false;
  }
  return true;
}

/**
 * effectiveVisible = configured visible AND conditional rules allow it.
 *
 * A section hidden by the admin is always hidden, regardless of conditional
 * rules. Field `required` flags are never rewritten — callers simply skip
 * validation for sections this returns false for.
 */
export function isSectionEffectivelyVisible(
  section: FormSection,
  data: Record<string, any>,
  allFields: FormField[],
  evaluate: ConditionEvaluator,
): boolean {
  if (!isSectionConfiguredVisible(section)) return false;
  return isConditionallyVisible(section.conditionalLogic, data, allFields, evaluate);
}

/** Convenience helper for review/progress code paths. */
export function visibleSectionsOnly(sections: FormSection[] | null | undefined): FormSection[] {
  return (sections || []).filter(isSectionConfiguredVisible);
}
