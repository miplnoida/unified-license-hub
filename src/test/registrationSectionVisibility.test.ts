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
      documentTypes: [{ label: 'A', required: true }],
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

  it('blocks saving a hidden documents section while documents are required', () => {
    const res = validateSecurityVisibility({
      require_documents: true,
      documents_section_visible: false,
    });
    expect(res.ok).toBe(false);
    expect(res.message).toBe(DOCUMENTS_SECTION_REQUIRED_BUT_HIDDEN_MESSAGE);
  });

  it('blocks hiding declarations when a required verification renders there', () => {
    const captcha = validateSecurityVisibility({
      require_captcha: true,
      declarations_section_visible: false,
    });
    expect(captcha.ok).toBe(false);
    expect(captcha.message).toBe(DECLARATIONS_SECTION_HIDDEN_BLOCKS_VERIFICATION_MESSAGE);

    const otpElsewhere = validateSecurityVisibility({
      require_otp: true,
      email_verification_step_id: 'entity',
      declarations_section_visible: false,
    });
    expect(otpElsewhere.ok).toBe(true);
  });

  it('leaves legacy configs (no flags) fully visible', () => {
    expect(validateSecurityVisibility({ require_otp: true, require_captcha: true }).ok).toBe(true);
    expect(isDeclarationsStepVisible({ declarations: null })).toBe(true);
  });
});
