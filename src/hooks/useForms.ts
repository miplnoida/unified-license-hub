import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FormRow } from '@/types/formBuilder';

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

export function useForms(formType?: 'pre_license' | 'post_license') {
  return useQuery({
    queryKey: ['forms', formType],
    queryFn: async () => {
      let query = supabase.from('forms').select('*').order('created_at', { ascending: false });
      if (formType) query = query.eq('form_type', formType);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as DbForm[];
    },
  });
}

export function useForm(id: string | null) {
  return useQuery({
    queryKey: ['forms', 'detail', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from('forms').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as unknown as DbForm | null;
    },
    enabled: !!id,
  });
}

export function useSaveForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: Omit<DbForm, 'created_at' | 'updated_at'>) => {
      const { error } = await supabase.from('forms').upsert({
        id: form.id,
        name: form.name,
        form_type: form.form_type,
        category: form.category,
        service: form.service,
        sector: form.sector,
        sub_sector: form.sub_sector,
        status: form.status,
        rows: JSON.parse(JSON.stringify(form.rows)),
      } as any);
      if (error) throw error;
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
      const { error } = await supabase.from('forms').delete().eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase.from('forms').update({ status } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
    },
  });
}
