import { useState, useCallback, useEffect } from 'react';
import type { AddressData } from '@/components/registration/AddressSection';

const STORAGE_KEY = 'pre-licensee-registration-form';

export interface DocumentMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  path: string;
  label: string;
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

  // Step 4: Declarations
  termsAccepted: boolean;
  privacyAccepted: boolean;
  dataProtectionAccepted: boolean;
  captchaChecked: boolean;
  emailVerified: boolean;
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

function loadFromStorage(): RegistrationFormData {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...initialState, ...parsed, password: '', confirmPassword: '', emailVerified: false };
    }
  } catch {}
  return initialState;
}

export function useRegistrationForm() {
  const [form, setForm] = useState<RegistrationFormData>(loadFromStorage);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const { password, confirmPassword, ...safe } = form;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  }, [form]);

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
    setForm(prev => ({ ...prev, sectorId: value, subSectorId: '', categoryId: '', entitySpecificData: {} }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.sectorId;
      return next;
    });
  }, []);

  const setSubSectorId = useCallback((value: string) => {
    setForm(prev => ({ ...prev, subSectorId: value, categoryId: '' }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.subSectorId;
      return next;
    });
  }, []);

  const addDocument = useCallback((doc: DocumentMeta) => {
    setForm(prev => ({ ...prev, documents: [...prev.documents, doc] }));
  }, []);

  const removeDocument = useCallback((docId: string) => {
    setForm(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== docId) }));
  }, []);

  const validateStep = useCallback((step: number): boolean => {
    const errs: Record<string, string> = {};

    if (step === 0) {
      // Entity Details
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
      // Primary User Details
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
      if (!form.password) {
        errs.password = 'Password is required';
      } else if (form.password.length < 8) {
        errs.password = 'Password must be at least 8 characters';
      }
      if (!form.confirmPassword) {
        errs.confirmPassword = 'Please confirm your password';
      } else if (form.password !== form.confirmPassword) {
        errs.confirmPassword = 'Passwords do not match';
      }
    } else if (step === 2) {
      // Supporting Documents - no strict requirement for now
    } else if (step === 3) {
      // Declarations
      if (!form.termsAccepted) errs.termsAccepted = 'You must accept the Terms & Conditions';
      if (!form.privacyAccepted) errs.privacyAccepted = 'You must accept the Privacy Policy';
      if (!form.dataProtectionAccepted) errs.dataProtectionAccepted = 'You must accept the Data Protection Notice';
      if (!form.captchaChecked) errs.captcha = 'Please verify the captcha';
      if (!form.emailVerified) errs.emailVerified = 'Email verification is required';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  const validate = useCallback((): boolean => {
    // Validate all steps
    for (let i = 0; i < 4; i++) {
      if (!validateStep(i)) return false;
    }
    return true;
  }, [validateStep]);

  const reset = useCallback(() => {
    setForm(initialState);
    setErrors({});
    sessionStorage.removeItem(STORAGE_KEY);
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
    reset,
  };
}
