/**
 * Item-level "Visible to applicant" semantics for registration document types,
 * declarations and the security/verification controls.
 *
 * Backward compatibility rule (same as section visibility): configs saved before
 * this feature carry no `visible` property, so only an explicit `false` hides an
 * item. `required` flags are never rewritten — callers simply skip hidden items.
 */

export interface VisibilityFlagged {
  visible?: boolean;
  required?: boolean;
}

/** True unless the admin explicitly hid the item. */
export function isItemVisible(item: VisibilityFlagged | null | undefined): boolean {
  return !!item && item.visible !== false;
}

/** Required only when the applicant can actually see (and satisfy) the item. */
export function isEffectiveRequired(item: VisibilityFlagged | null | undefined): boolean {
  return isItemVisible(item) && item?.required === true;
}

export function visibleItems<T extends VisibilityFlagged>(items: T[] | null | undefined): T[] {
  return (items || []).filter(isItemVisible);
}

/** Convenience aliases so call sites read clearly. */
export const visibleDocumentTypes = visibleItems;
export const visibleDeclarations = visibleItems;

export function requiredVisibleItems<T extends VisibilityFlagged>(items: T[] | null | undefined): T[] {
  return (items || []).filter(isEffectiveRequired);
}

export const OTP_REQUIRED_BUT_HIDDEN_MESSAGE =
  'Email verification is required for registration and cannot be hidden from applicants. Disable the requirement first or make it visible.';

export const CAPTCHA_REQUIRED_BUT_HIDDEN_MESSAGE =
  'CAPTCHA is required and cannot be hidden from applicants. Disable CAPTCHA first or make it visible.';

export interface SecurityVisibilityConfig {
  require_otp?: boolean | null;
  otp_visible_to_applicant?: boolean | null;
  require_captcha?: boolean | null;
  captcha_visible_to_applicant?: boolean | null;
}

export interface SecurityVisibilityResult {
  ok: boolean;
  message?: string;
}

/**
 * A verification control that is required must remain visible, otherwise the
 * applicant could never satisfy it. Shared by the builder save path and the
 * registration edge function.
 */
export function validateSecurityVisibility(config: SecurityVisibilityConfig): SecurityVisibilityResult {
  if (config.require_otp === true && config.otp_visible_to_applicant === false) {
    return { ok: false, message: OTP_REQUIRED_BUT_HIDDEN_MESSAGE };
  }
  if (config.require_captcha === true && config.captcha_visible_to_applicant === false) {
    return { ok: false, message: CAPTCHA_REQUIRED_BUT_HIDDEN_MESSAGE };
  }
  return { ok: true };
}
