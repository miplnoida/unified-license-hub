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

export const DOCUMENTS_SECTION_REQUIRED_BUT_HIDDEN_MESSAGE =
  'Documents are required for registration and the section cannot be hidden. Disable the requirement first or make the section visible.';

export const DECLARATIONS_SECTION_HIDDEN_BLOCKS_VERIFICATION_MESSAGE =
  'The Declarations section carries a required verification control (OTP or CAPTCHA) and cannot be hidden. Move or disable the verification first.';

export interface SecurityVisibilityConfig {
  require_otp?: boolean | null;
  otp_visible_to_applicant?: boolean | null;
  require_captcha?: boolean | null;
  captcha_visible_to_applicant?: boolean | null;
  require_documents?: boolean | null;
  documents_section_visible?: boolean | null;
  declarations_section_visible?: boolean | null;
  /** Resolved placement of email OTP ('before_submission' means declarations step). */
  email_verification_step_id?: string | null;
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
  if (config.require_documents === true && config.documents_section_visible === false) {
    return { ok: false, message: DOCUMENTS_SECTION_REQUIRED_BUT_HIDDEN_MESSAGE };
  }
  if (config.declarations_section_visible === false) {
    const captchaOnDeclarations =
      config.require_captcha === true && config.captcha_visible_to_applicant !== false;
    const otpOnDeclarations =
      config.require_otp === true
      && config.otp_visible_to_applicant !== false
      && (!config.email_verification_step_id
        || config.email_verification_step_id === 'before_submission'
        || config.email_verification_step_id === 'declarations');
    if (captchaOnDeclarations || otpOnDeclarations) {
      return { ok: false, message: DECLARATIONS_SECTION_HIDDEN_BLOCKS_VERIFICATION_MESSAGE };
    }
  }
  return { ok: true };
}

export interface StepVisibilityConfig {
  requireDocuments?: boolean;
  documentsSectionVisible?: boolean;
  declarationsSectionVisible?: boolean;
  documentTypes?: VisibilityFlagged[] | null;
  declarations?: VisibilityFlagged[] | null;
  /** Whether a visible OTP block lands on the declarations step. */
  otpOnDeclarations?: boolean;
  /** Whether a visible CAPTCHA renders on the declarations step. */
  captchaOnDeclarations?: boolean;
}

/** Document types the applicant may actually see (section flag wins). */
export function effectiveDocumentTypes<T extends VisibilityFlagged>(
  types: T[] | null | undefined,
  sectionVisible = true,
): T[] {
  if (sectionVisible === false) return [];
  return visibleItems(types);
}

/** Declarations the applicant may actually see (section flag wins). */
export function effectiveDeclarations<T extends VisibilityFlagged>(
  declarations: T[] | null | undefined,
  sectionVisible = true,
): T[] {
  if (sectionVisible === false) return [];
  return visibleItems(declarations);
}

/**
 * The Supporting Documents step renders only when documents are enabled, the
 * section is visible and at least one document type remains visible. A config
 * with no document type list at all falls back to the built-in defaults.
 */
export function isDocumentsStepVisible(cfg: StepVisibilityConfig): boolean {
  if (cfg.requireDocuments === false) return false;
  if (cfg.documentsSectionVisible === false) return false;
  if (!cfg.documentTypes) return true;
  return visibleItems(cfg.documentTypes).length > 0;
}

/**
 * The Declarations step renders when at least one visible declaration remains,
 * or when a visible verification control (OTP/CAPTCHA) is placed on it.
 */
export function isDeclarationsStepVisible(cfg: StepVisibilityConfig): boolean {
  if (cfg.otpOnDeclarations || cfg.captchaOnDeclarations) return true;
  if (cfg.declarationsSectionVisible === false) return false;
  if (!cfg.declarations) return true;
  return visibleItems(cfg.declarations).length > 0;
}

