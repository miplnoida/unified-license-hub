import { useState, useCallback, useEffect } from 'react';
import type { AddressData } from '@/components/registration/AddressSection';

const STORAGE_KEY = 'pre-licensee-registration-form';

export interface RegistrationFormData {
  sectorId: string;
  subSectorId: string;
  categoryId: string;
  applicantName: string;
  applicantNameAlt: string;
  mailingAddress: AddressData;
  physicalAddress: AddressData;
  sameAsMailing: boolean;
  firstName: string;
  lastName: string;
  telephone: string;
  email: string;
  password: string;
  confirmPassword: string;
  captchaChecked: boolean;
}

const emptyAddress: AddressData = { street: '', city: '', state: '', country: '' };

const initialState: RegistrationFormData = {
  sectorId: '',
  subSectorId: '',
  categoryId: '',
  applicantName: '',
  applicantNameAlt: '',
  mailingAddress: { ...emptyAddress },
  physicalAddress: { ...emptyAddress },
  sameAsMailing: false,
  firstName: '',
  lastName: '',
  telephone: '',
  email: '',
  password: '',
  confirmPassword: '',
  captchaChecked: false,
};

function loadFromStorage(): RegistrationFormData {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Don't restore passwords from storage
      return { ...parsed, password: '', confirmPassword: '' };
    }
  } catch {}
  return initialState;
}

export function useRegistrationForm() {
  const [form, setForm] = useState<RegistrationFormData>(loadFromStorage);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Don't persist passwords
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
    setForm(prev => ({ ...prev, sectorId: value, subSectorId: '', categoryId: '' }));
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

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};

    if (!form.sectorId) errs.sectorId = 'Sector is required';
    if (!form.subSectorId) errs.subSectorId = 'Sub-sector is required';
    if (!form.categoryId) errs.categoryId = 'Category is required';
    if (!form.applicantName.trim()) errs.applicantName = 'Applicant name is required';

    // Mailing address
    if (!form.mailingAddress.street.trim()) errs['mailing.street'] = 'Street is required';
    if (!form.mailingAddress.city.trim()) errs['mailing.city'] = 'City is required';
    if (!form.mailingAddress.state.trim()) errs['mailing.state'] = 'State is required';
    if (!form.mailingAddress.country) errs['mailing.country'] = 'Country is required';

    // Physical address (only if not same as mailing)
    if (!form.sameAsMailing) {
      if (!form.physicalAddress.street.trim()) errs['physical.street'] = 'Street is required';
      if (!form.physicalAddress.city.trim()) errs['physical.city'] = 'City is required';
      if (!form.physicalAddress.state.trim()) errs['physical.state'] = 'State is required';
      if (!form.physicalAddress.country) errs['physical.country'] = 'Country is required';
    }

    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    if (!form.telephone.trim()) errs.telephone = 'Telephone is required';
    if (!form.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Invalid email address';
    }

    // Password validation
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

    if (!form.captchaChecked) errs.captcha = 'Please verify the captcha';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  const reset = useCallback(() => {
    setForm(initialState);
    setErrors({});
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    form,
    errors,
    setField,
    setMailingField,
    setPhysicalField,
    setSectorId,
    setSubSectorId,
    validate,
    reset,
  };
}
