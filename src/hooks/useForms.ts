import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FormSection } from '@/types/formBuilder';

export interface DbForm {
  id: string;
  name: string;
  description: string;
  form_type: string;
  category: string;
  service: string;
  sector: string;
  sub_sector: string;
  status: 'draft' | 'published' | 'archived';
  version: number;
  parent_form_id: string | null;
  regulator_id: string | null;
  rows: FormSection[];
  created_at: string;
  updated_at: string;
}

export function useForms(formType?: string, regulatorId?: string | null) {
  return useQuery({
    queryKey: ['forms', formType, regulatorId],
    queryFn: async () => {
      let query = supabase
        .from('forms')
        .select('*')
        .order('created_at', { ascending: false });
      if (formType) query = query.eq('form_type', formType);
      if (regulatorId) query = query.eq('regulator_id', regulatorId);
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
      const { data, error } = await supabase
        .from('forms')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as DbForm | null;
    },
    enabled: !!id,
  });
}

export function useFormVersions(parentId: string | null) {
  return useQuery({
    queryKey: ['forms', 'versions', parentId],
    queryFn: async () => {
      if (!parentId) return [];
      const { data, error } = await supabase
        .from('forms')
        .select('*')
        .or(`id.eq.${parentId},parent_form_id.eq.${parentId}`)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DbForm[];
    },
    enabled: !!parentId,
  });
}

export function useLatestPublishedForm(parentId: string | null) {
  return useQuery({
    queryKey: ['forms', 'latest-published', parentId],
    queryFn: async () => {
      if (!parentId) return null;
      const { data, error } = await supabase
        .from('forms')
        .select('*')
        .or(`id.eq.${parentId},parent_form_id.eq.${parentId}`)
        .eq('status', 'published')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as DbForm | null;
    },
    enabled: !!parentId,
  });
}

export function useSaveForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: Omit<DbForm, 'created_at' | 'updated_at'>) => {
      const { error } = await supabase.from('forms').upsert({
        id: form.id,
        name: form.name,
        description: form.description,
        form_type: form.form_type,
        category: form.category,
        service: form.service,
        sector: form.sector,
        sub_sector: form.sub_sector,
        status: form.status,
        version: form.version,
        parent_form_id: form.parent_form_id,
        regulator_id: form.regulator_id || null,
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

export function useCreateNewVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceForm: DbForm) => {
      const parentId = sourceForm.parent_form_id || sourceForm.id;
      const { data: versions } = await supabase
        .from('forms')
        .select('version')
        .or(`id.eq.${parentId},parent_form_id.eq.${parentId}`)
        .order('version', { ascending: false })
        .limit(1);
      const maxVersion = (versions?.[0] as any)?.version || sourceForm.version;

      const newId = crypto.randomUUID();
      const { error } = await supabase.from('forms').insert({
        id: newId,
        name: sourceForm.name,
        description: sourceForm.description,
        form_type: sourceForm.form_type,
        category: sourceForm.category,
        service: sourceForm.service,
        sector: sourceForm.sector,
        sub_sector: sourceForm.sub_sector,
        status: 'draft',
        version: maxVersion + 1,
        parent_form_id: parentId,
        regulator_id: sourceForm.regulator_id || null,
        rows: JSON.parse(JSON.stringify(sourceForm.rows)),
      } as any);
      if (error) throw error;
      return newId;
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
