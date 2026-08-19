import { describe, it, expect } from 'vitest';
import {
  effectiveDeclarations,
  effectiveDocumentTypes,
  isDeclarationsStepVisible,
  isDocumentsStepVisible,
  validateSecurityVisibility,
  DOCUMENTS_SECTION_REQUIRED_BUT_HIDDEN_MESSAGE,
  DECLARATIONS_SECTION_HIDDEN_BLOCKS_VERIFICATION_MESSAGE,
} from '@/lib/registrationItemVisibility';

describe('registration section-level visibility', () => {
  it('section hidden overrides visible rows', () => {
    const docs = [{ label: 'A', required: true, visible: true }];
    expect(effectiveDocumentTypes(docs, false)).toEqual([]);
    expect(effectiveDeclarations(docs, false)).toEqual([]);
    expect(effectiveDocumentTypes(docs, true)).toHaveLength(1);
  });

  it('omits the documents step when the section is hidden or every row is hidden', () => {
    expect(isDocumentsStepVisible({
      requireDocuments: true,
      documentsSectionVisible: false,
      documentTypes: [{ required: true }],
    })).toBe(false);

    expect(isDocumentsStepVisible({
      requireDocuments: true,
      documentsSectionVisible: true,
      documentTypes: [{ visible: false, required: true }],
    })).toBe(false);

    expect(isDocumentsStepVisible({
      requireDocuments: true,
      documentsSectionVisible: true,
      documentTypes: [{ visible: true, required: false }],
    })).toBe(true);

    // No configured list at all → built-in defaults are shown.
    expect(isDocumentsStepVisible({ requireDocuments: true, documentTypes: null })).toBe(true);
  });

  it('keeps the declarations step when a visible verification control lives on it', () => {
    expect(isDeclarationsStepVisible({
      declarationsSectionVisible: false,
      declarations: [{ required: true }],
      captchaOnDeclarations: true,
    })).toBe(true);

    expect(isDeclarationsStepVisible({
      declarationsSectionVisible: false,
      declarations: [{ required: true }],
    })).toBe(false);

    expect(isDeclarationsStepVisible({
      declarationsSectionVisible: true,
      declarations: [{ required: true, visible: false }],
    })).toBe(false);
  });

  it('allows hiding a section even when items inside are required', () => {
    expect(validateSecurityVisibility({
      require_documents: true,
      documents_section_visible: false,
    }).ok).toBe(true);

    expect(validateSecurityVisibility({
      require_captcha: true,
      declarations_section_visible: false,
    }).ok).toBe(true);

    expect(validateSecurityVisibility({
      require_otp: true,
      email_verification_step_id: 'entity',
      declarations_section_visible: false,
    }).ok).toBe(true);
  });

  it('still blocks an individually hidden required verification control', () => {
    expect(validateSecurityVisibility({
      require_otp: true,
      otp_visible_to_applicant: false,
    }).ok).toBe(false);
    expect(validateSecurityVisibility({
      require_captcha: true,
      captcha_visible_to_applicant: false,
    }).ok).toBe(false);
  });


  it('leaves legacy configs (no flags) fully visible', () => {
    expect(validateSecurityVisibility({ require_otp: true, require_captcha: true }).ok).toBe(true);
    expect(isDeclarationsStepVisible({ declarations: null })).toBe(true);
  });
});
