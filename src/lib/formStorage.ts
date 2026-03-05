export interface StoredForm {
  id: string;
  name: string;
  formType: 'pre_license' | 'post_license';
  category: string;
  service: string;
  sector: string;
  subSector: string;
  status: 'draft' | 'published' | 'archived';
  createdDate: string;
  fields: Array<{
    id: string;
    type: string;
    label: string;
    required: boolean;
    placeholder?: string;
  }>;
}

const STORAGE_KEY = 'app_forms';

export function getStoredForms(): StoredForm[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveForm(form: StoredForm): void {
  const forms = getStoredForms();
  forms.push(form);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
}

export function deleteForm(id: string): void {
  const forms = getStoredForms().filter((f) => f.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
}
