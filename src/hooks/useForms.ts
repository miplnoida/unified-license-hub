import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormRow } from '@/types/formBuilder';
import { toast } from 'sonner';

export interface DbForm {
  id: string;
  name: string;
  form_type: 'pre_license' | 'post_license';
  category: string;
  service: string;
  sector: string;
  sub_sector: string;
  status: 'draft' | 'published' | 'archived';
  rows: FormRow[];
  created_at: string;
  updated_at: string;
}

const STORAGE_KEY = 'app_forms_db';

function getAllForms(): DbForm[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistForms(forms: DbForm[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
}

export function useForms(formType?: 'pre_license' | 'post_license') {
  return useQuery({
    queryKey: ['forms', formType],
    queryFn: async () => {
      let forms = getAllForms();
      if (formType) forms = forms.filter(f => f.form_type === formType);
      return forms.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

export function useForm(id: string | null) {
  return useQuery({
    queryKey: ['forms', 'detail', id],
    queryFn: async () => {
      if (!id) return null;
      return getAllForms().find(f => f.id === id) || null;
    },
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

export function useSaveForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: Omit<DbForm, 'created_at' | 'updated_at'>) => {
      const forms = getAllForms();
      const now = new Date().toISOString();
      const existing = forms.findIndex(f => f.id === form.id);
      if (existing >= 0) {
        forms[existing] = { ...forms[existing], ...form, updated_at: now };
      } else {
        forms.push({ ...form, created_at: now, updated_at: now });
      }
      persistForms(forms);
      return form;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}

export function useDeleteForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      persistForms(getAllForms().filter(f => f.id !== id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}

export function useUpdateFormStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'draft' | 'published' | 'archived' }) => {
      const forms = getAllForms().map(f =>
        f.id === id ? { ...f, status, updated_at: new Date().toISOString() } : f
      );
      persistForms(forms);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}
