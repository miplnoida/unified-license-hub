export const REGISTRATION_PREVIEW_STORAGE_KEY = 'registration-form-preview';

export interface RegistrationPreviewPayload {
  name?: string;
  schema: any;
  documentTypes: any;
  declarations: any;
  requireOtp: boolean;
  requireCaptcha: boolean;
  requireDocuments: boolean;
}

export function storeRegistrationPreview(payload: RegistrationPreviewPayload) {
  localStorage.setItem(REGISTRATION_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
}

export function readStoredRegistrationPreview(): RegistrationPreviewPayload | null {
  const raw = localStorage.getItem(REGISTRATION_PREVIEW_STORAGE_KEY) ?? sessionStorage.getItem(REGISTRATION_PREVIEW_STORAGE_KEY);
  if (!raw) return null;

  return JSON.parse(raw) as RegistrationPreviewPayload;
}

export function buildRegistrationPreviewUrl(configId?: string) {
  if (!configId) return '/admin/registration-forms/preview';
  return `/admin/registration-forms/preview?configId=${encodeURIComponent(configId)}`;
}