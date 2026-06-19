import { useState, useCallback, useEffect, useRef } from 'react';
import type { AddressData } from '@/components/registration/AddressSection';

const STORAGE_KEY = 'pre-licensee-registration-form';

export interface DocumentMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  path: string;
  label: string;
  documentKey?: string;
}

export interface RegistrationFormData {
  // Step 1: Entity Details
  sectorId: string;
  subSectorId: string;
  categoryId: string;
  applicantName: string;
  applicantNameAlt: string;
  registrationNumber: string;
  mailingAddress: AddressData;
  physicalAddress: AddressData;
  sameAsMailing: boolean;
  entitySpecificData: Record<string, string>;

  // Step 2: Primary User Details
  firstName: string;
  lastName: string;
  telephone: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;

  // Step 3: Supporting Documents
  documents: DocumentMeta[];

  // Step 4: Declarations (dynamic keys stored here)
  termsAccepted: boolean;
  privacyAccepted: boolean;
  dataProtectionAccepted: boolean;
  captchaChecked: boolean;
  emailVerified: boolean;

  // Dynamic declaration keys
  [key: string]: unknown;
}

const emptyAddress: AddressData = { street: '', city: '', state: '', country: '' };

const initialState: RegistrationFormData = {
  sectorId: '',
  subSectorId: '',
  categoryId: '',
  applicantName: '',
  applicantNameAlt: '',
  registrationNumber: '',
  mailingAddress: { ...emptyAddress },
  physicalAddress: { ...emptyAddress },
  sameAsMailing: false,
  entitySpecificData: {},
  firstName: '',
  lastName: '',
  telephone: '',
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  documents: [],
  termsAccepted: false,
  privacyAccepted: false,
  dataProtectionAccepted: false,
  captchaChecked: false,
  emailVerified: false,
};

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

function loadFromStorage(): RegistrationFormData {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...initialState, ...parsed, password: '', confirmPassword: '', emailVerified: false };
    }
  } catch {}
  return { ...initialState };
}

export function useRegistrationForm(options?: { updateMode?: boolean }) {
  const [form, setForm] = useState<RegistrationFormData>(() => options?.updateMode ? { ...initialState } : loadFromStorage());
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Mirrors the latest validator output synchronously so callers can build a
  // summary toast immediately after validateStep/validateDeclarations runs
  // (the `errors` state update is async and stale on the same tick).
  const lastErrorsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (options?.updateMode) return;
    const { password, confirmPassword, ...safe } = form;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  }, [form, options?.updateMode]);

  const setField = useCallback((field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const setEntityField = useCallback((field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      entitySpecificData: { ...prev.entitySpecificData, [field]: value },
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[`entity.${field}`];
      return next;
    });
  }, []);

  const setMailingField = useCallback((field: keyof AddressData, value: string) => {
    setForm(prev => ({
      ...prev,
      mailingAddress: { ...prev.mailingAddress, [field]: value },
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[`mailing.${field}`];
      return next;
    });
  }, []);

  const setPhysicalField = useCallback((field: keyof AddressData, value: string) => {
    setForm(prev => ({
      ...prev,
      physicalAddress: { ...prev.physicalAddress, [field]: value },
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[`physical.${field}`];
      return next;
    });
  }, []);

  const setSectorId = useCallback((value: string) => {
    setForm(prev => ({
      ...prev,
      sectorId: value,
      subSectorId: '',
      categoryId: '',
      entitySpecificData: options?.updateMode ? prev.entitySpecificData : {},
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.sectorId;
      return next;
    });
  }, [options?.updateMode]);

  const setSubSectorId = useCallback((value: string) => {
    setForm(prev => ({ ...prev, subSectorId: value, categoryId: '' }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.subSectorId;
      return next;
    });
  }, []);

  const getDocumentKey = (doc: Pick<DocumentMeta, 'label' | 'name'> & { documentKey?: string }) => (
    doc.documentKey || doc.label || doc.name || 'document'
  ).trim().toLowerCase().replace(/\s+/g, '_');

  const addDocument = useCallback((doc: DocumentMeta) => {
    setForm(prev => {
      const nextKey = getDocumentKey(doc);
      return {
        ...prev,
        documents: [...prev.documents.filter(d => getDocumentKey(d) !== nextKey), { ...doc, documentKey: nextKey }],
      };
    });
  }, []);

  const removeDocument = useCallback((docId: string) => {
    setForm(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== docId) }));
  }, []);

  const validateStep = useCallback((step: number): boolean => {
    const errs: Record<string, string> = {};

    if (step === 0) {
      if (!form.sectorId) errs.sectorId = 'Sector is required';
      if (!form.subSectorId) errs.subSectorId = 'Sub-sector is required';
      if (!form.categoryId) errs.categoryId = 'Category is required';
      if (!form.applicantName.trim()) errs.applicantName = 'Applicant name is required';
      if (!form.mailingAddress.street.trim()) errs['mailing.street'] = 'Street is required';
      if (!form.mailingAddress.city.trim()) errs['mailing.city'] = 'City is required';
      if (!form.mailingAddress.state.trim()) errs['mailing.state'] = 'State is required';
      if (!form.mailingAddress.country) errs['mailing.country'] = 'Country is required';
      if (!form.sameAsMailing) {
        if (!form.physicalAddress.street.trim()) errs['physical.street'] = 'Street is required';
        if (!form.physicalAddress.city.trim()) errs['physical.city'] = 'City is required';
        if (!form.physicalAddress.state.trim()) errs['physical.state'] = 'State is required';
        if (!form.physicalAddress.country) errs['physical.country'] = 'Country is required';
      }
    } else if (step === 1) {
      if (!form.firstName.trim()) errs.firstName = 'First name is required';
      if (!form.lastName.trim()) errs.lastName = 'Last name is required';
      if (!form.telephone.trim()) {
        errs.telephone = 'Telephone is required';
      } else if (!/^[+]?[\d\s\-()]{7,20}$/.test(form.telephone.trim())) {
        errs.telephone = 'Invalid phone number (7-20 digits)';
      }
      if (!form.email.trim()) {
        errs.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        errs.email = 'Invalid email address';
      }
      if (!options?.updateMode && !form.password) {
        errs.password = 'Password is required';
      } else if (!options?.updateMode && !PASSWORD_REGEX.test(form.password)) {
        errs.password = 'Password must be 8+ characters with uppercase, lowercase, number, and special character';
      }
      if (!options?.updateMode && !form.confirmPassword) {
        errs.confirmPassword = 'Please confirm your password';
      } else if (!options?.updateMode && form.password !== form.confirmPassword) {
        errs.confirmPassword = 'Passwords do not match';
      }
    } else if (step === 2) {
      // Documents — no strict requirement unless config says otherwise
    } else if (step === 3) {
      // Declarations
      if (!form.termsAccepted) errs.termsAccepted = 'You must accept the Terms & Conditions';
      if (!form.privacyAccepted) errs.privacyAccepted = 'You must accept the Privacy Policy';
      if (!form.dataProtectionAccepted) errs.dataProtectionAccepted = 'You must accept the Data Protection Notice';
      if (!form.captchaChecked) errs.captcha = 'Please verify the captcha';
      if (!options?.updateMode && !form.emailVerified) errs.emailVerified = 'Email verification is required';
    }

    setErrors(errs);
    lastErrorsRef.current = errs;
    return Object.keys(errs).length === 0;
  }, [form, options?.updateMode]);

  /**
   * Validate dynamic declarations by their computed field keys.
   * Called from the registration page when declarations come from config.
   */
  const validateDeclarations = useCallback((
    declarationKeys: { fieldKey: string; label: string; required: boolean }[],
    requireOtp: boolean,
    requireCaptcha: boolean,
  ): boolean => {
    const errs: Record<string, string> = {};

    for (const decl of declarationKeys) {
      if (decl.required && !form[decl.fieldKey]) {
        errs[decl.fieldKey] = `You must accept: ${decl.label}`;
      }
    }

    if (requireCaptcha && !form.captchaChecked) {
      errs.captcha = 'Please verify the captcha';
    }
    if (!options?.updateMode && requireOtp && !form.emailVerified) {
      errs.emailVerified = 'Email verification is required';
    }

    setErrors(errs);
    lastErrorsRef.current = errs;
    return Object.keys(errs).length === 0;
  }, [form, options?.updateMode]);

  const validate = useCallback((): boolean => {
    for (let i = 0; i < 4; i++) {
      if (!validateStep(i)) return false;
    }
    return true;
  }, [validateStep]);

  const reset = useCallback(() => {
    setForm({ ...initialState });
    setErrors({});
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const hydrate = useCallback((data: Partial<RegistrationFormData>) => {
    setForm({ ...initialState, ...data, password: '', confirmPassword: '' });
    setErrors({});
  }, []);

  return {
    form,
    errors,
    setField,
    setEntityField,
    setMailingField,
    setPhysicalField,
    setSectorId,
    setSubSectorId,
    addDocument,
    removeDocument,
    validate,
    validateStep,
    validateDeclarations,
    hydrate,
    reset,
  };
}
