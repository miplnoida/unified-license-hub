import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ─── Return Types ───
export function useReturnTypes() {
  return useQuery({
    queryKey: ['return_types'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_types').select('*').order('name');
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useMutateReturnType() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (payload: any) => {
        const { error } = await (supabase as any).from('return_types').insert(payload);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_types'] }); toast.success('Return type created'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        const { error } = await (supabase as any).from('return_types').update(payload).eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_types'] }); toast.success('Return type updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await (supabase as any).from('return_types').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_types'] }); toast.success('Deleted'); },
      onError: (e: any) => toast.error(e.message),
    }),
  };
}

// ─── Return Configs ───
export function useReturnConfigs() {
  return useQuery({
    queryKey: ['return_configs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_configs').select('*, return_types(name), sectors(name), sub_sectors(name)').order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useReturnConfigById(id: string | undefined) {
  return useQuery({
    queryKey: ['return_configs', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_configs').select('*').eq('id', id).single();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useMutateReturnConfig() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (payload: any) => {
        const { data, error } = await (supabase as any).from('return_configs').insert(payload).select().single();
        if (error) throw error;
        return data;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_configs'] }); toast.success('Configuration created'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        const { error } = await (supabase as any).from('return_configs').update(payload).eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_configs'] }); toast.success('Configuration updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await (supabase as any).from('return_configs').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_configs'] }); toast.success('Deleted'); },
      onError: (e: any) => toast.error(e.message),
    }),
  };
}

// ─── Return Config Forms ───
export function useReturnConfigForms(configId: string | undefined) {
  return useQuery({
    queryKey: ['return_config_forms', configId],
    enabled: !!configId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_config_forms').select('*, form_templates(id, name, description, status)').eq('return_configuration_id', configId).order('display_order');
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useMutateReturnConfigForms() {
  const qc = useQueryClient();
  return {
    upsert: useMutation({
      mutationFn: async ({ configId, forms }: { configId: string; forms: any[] }) => {
        // Delete existing
        await (supabase as any).from('return_config_forms').delete().eq('return_configuration_id', configId);
        if (forms.length > 0) {
          const { error } = await (supabase as any).from('return_config_forms').insert(
            forms.map((f, i) => ({
              return_configuration_id: configId,
              form_id: f.form_id,
              tab_name: f.tab_name || 'General',
              display_order: f.display_order ?? i,
              status: 'active',
            }))
          );
          if (error) throw error;
        }
      },
      onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['return_config_forms', v.configId] }); toast.success('Forms assigned'); },
      onError: (e: any) => toast.error(e.message),
    }),
  };
}

// ─── Returns Filed ───
export function useReturnsFiled(filters?: { entityId?: string; status?: string; year?: number }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['returns_filed', filters],
    queryFn: async () => {
      let q = (supabase as any).from('returns_filed').select('*, return_configs(name, return_types(name, code)), sectors(name), licensees(name)').order('created_at', { ascending: false });
      if (filters?.entityId) q = q.eq('entity_id', filters.entityId);
      if (filters?.status) q = q.eq('workflow_status', filters.status);
      if (filters?.year) q = q.eq('return_year', filters.year);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useReturnById(id: string | undefined) {
  return useQuery({
    queryKey: ['returns_filed', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('returns_filed').select('*, return_configs(*, return_types(name, code)), sectors(name), licensees(name)').eq('id', id).single();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useMyReturns() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my_returns', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Resolve the set of entity (licensee) IDs the user can see returns for:
      //  - PPOC: all licensees they're actively mapped to
      //  - Regular user: their own profile.licensee_id
      const [{ data: mappings }, { data: prof }] = await Promise.all([
        (supabase as any).from('ppoc_entity_mappings').select('licensee_id').eq('ppoc_user_id', user!.id).eq('is_active', true),
        (supabase as any).from('profiles').select('licensee_id').eq('id', user!.id).maybeSingle(),
      ]);
      const entityIds = Array.from(new Set([
        ...((mappings || []).map((m: any) => m.licensee_id).filter(Boolean)),
        ...(prof?.licensee_id ? [prof.licensee_id] : []),
      ]));

      // Build OR filter: returns this user created OR for any entity they manage
      let query = (supabase as any)
        .from('returns_filed')
        .select('*, return_configs(name, return_types(name, code)), sectors(name), licensees(name)')
        .order('created_at', { ascending: false });

      if (entityIds.length > 0) {
        query = query.or(`created_by.eq.${user!.id},entity_id.in.(${entityIds.join(',')})`);
      } else {
        query = query.eq('created_by', user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useMutateReturn() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (payload: any) => {
        const { data, error } = await (supabase as any).from('returns_filed').insert(payload).select().single();
        if (error) throw error;
        return data;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['returns_filed'] }); qc.invalidateQueries({ queryKey: ['my_returns'] }); },
      onError: (e: any) => {
        const msg = (e?.message || '').toString();
        if (e?.code === '23505' || /duplicate key|unique constraint/i.test(msg)) {
          toast.error('A return for this entity, configuration, year and period already exists.');
        } else {
          toast.error(msg || 'Failed to create return');
        }
      },
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        const { error } = await (supabase as any).from('returns_filed').update(payload).eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['returns_filed'] }); qc.invalidateQueries({ queryKey: ['my_returns'] }); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await (supabase as any).from('returns_filed').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['returns_filed'] }); qc.invalidateQueries({ queryKey: ['my_returns'] }); toast.success('Return deleted'); },
      onError: (e: any) => toast.error(e.message),
    }),
  };
}

// ─── Return Form Data ───
export function useReturnFormData(returnId: string | undefined) {
  return useQuery({
    queryKey: ['return_form_data', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_form_data').select('*').eq('return_id', returnId);
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useSaveReturnFormData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ returnId, formId, fields }: { returnId: string; formId: string; fields: { field_id: string; field_name: string; field_value: string }[] }) => {
      for (const f of fields) {
        const { error } = await (supabase as any).from('return_form_data').upsert({
          return_id: returnId,
          form_id: formId,
          field_id: f.field_id,
          field_name: f.field_name,
          field_value: f.field_value,
        }, { onConflict: 'return_id,form_id,field_id' });
        if (error) throw error;
      }
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['return_form_data', v.returnId] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── Return Comments ───
export function useReturnComments(returnId: string | undefined) {
  return useQuery({
    queryKey: ['return_comments', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_comments').select('*').eq('return_id', returnId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useMutateReturnComment() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (payload: any) => {
        const { error } = await (supabase as any).from('return_comments').insert(payload);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_comments'] }); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        const { error } = await (supabase as any).from('return_comments').update(payload).eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_comments'] }); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await (supabase as any).from('return_comments').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_comments'] }); },
      onError: (e: any) => toast.error(e.message),
    }),
  };
}

// ─── Return Audit Log ───
export function useReturnAuditLog(returnId: string | undefined) {
  return useQuery({
    queryKey: ['return_audit_log', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_audit_log').select('*').eq('return_id', returnId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useInsertReturnAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await (supabase as any).from('return_audit_log').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_audit_log'] }); },
  });
}

// ─── Return Requests ───
export function useReturnRequests(returnId: string | undefined) {
  return useQuery({
    queryKey: ['return_requests', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_requests').select('*').eq('return_id', returnId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

// ─── Due Dates ───
export function useReturnDueDates(filters?: { year?: number; sectorId?: string }) {
  return useQuery({
    queryKey: ['return_due_dates', filters],
    queryFn: async () => {
      let q = (supabase as any).from('return_due_dates').select('*, return_configs(name, return_types(name)), licensees(name), sectors:return_configs(sector_id)').order('due_date');
      if (filters?.year) q = q.eq('return_year', filters.year);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

// ─── Cutoff Config ───
export function useCutoffConfigs() {
  return useQuery({
    queryKey: ['return_cutoff_config'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_cutoff_config').select('*, sectors(name), return_types(name)').order('created_at');
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useMutateCutoffConfig() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (payload: any) => {
        const { error } = await (supabase as any).from('return_cutoff_config').insert(payload);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_cutoff_config'] }); toast.success('Cutoff config created'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        const { error } = await (supabase as any).from('return_cutoff_config').update(payload).eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_cutoff_config'] }); toast.success('Updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await (supabase as any).from('return_cutoff_config').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_cutoff_config'] }); toast.success('Deleted'); },
      onError: (e: any) => toast.error(e.message),
    }),
  };
}

// ─── Late Fee Structures ───
export function useLateFeeStructures() {
  return useQuery({
    queryKey: ['late_fee_structures'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('late_fee_structures').select('*, sectors(name), return_types(name)').order('created_at');
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useMutateLateFee() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (payload: any) => {
        const { data, error } = await (supabase as any).from('late_fee_structures').insert(payload).select().single();
        if (error) throw error;
        return data;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['late_fee_structures'] }); toast.success('Late fee created'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        const { error } = await (supabase as any).from('late_fee_structures').update(payload).eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['late_fee_structures'] }); toast.success('Updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await (supabase as any).from('late_fee_structures').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['late_fee_structures'] }); toast.success('Deleted'); },
      onError: (e: any) => toast.error(e.message),
    }),
  };
}

// ─── Penalty Tiers ───
export function usePenaltyTiers(structureId: string | undefined) {
  return useQuery({
    queryKey: ['late_fee_penalty_tiers', structureId],
    enabled: !!structureId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('late_fee_penalty_tiers').select('*').eq('late_fee_structure_id', structureId).order('days_from');
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useMutatePenaltyTier() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (payload: any) => {
        const { error } = await (supabase as any).from('late_fee_penalty_tiers').insert(payload);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['late_fee_penalty_tiers'] }); toast.success('Tier added'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        const { error } = await (supabase as any).from('late_fee_penalty_tiers').update(payload).eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['late_fee_penalty_tiers'] }); toast.success('Tier updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await (supabase as any).from('late_fee_penalty_tiers').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['late_fee_penalty_tiers'] }); toast.success('Tier deleted'); },
      onError: (e: any) => toast.error(e.message),
    }),
  };
}

// ─── Notification Templates ───
export function useReturnNotificationTemplates() {
  return useQuery({
    queryKey: ['return_notification_templates'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_notification_templates').select('*').order('template_code');
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useMutateReturnNotifTemplate() {
  const qc = useQueryClient();
  return {
    create: useMutation({
      mutationFn: async (payload: any) => {
        const { error } = await (supabase as any).from('return_notification_templates').insert(payload);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_notification_templates'] }); toast.success('Template created'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        const { error } = await (supabase as any).from('return_notification_templates').update(payload).eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_notification_templates'] }); toast.success('Template updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await (supabase as any).from('return_notification_templates').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_notification_templates'] }); toast.success('Deleted'); },
      onError: (e: any) => toast.error(e.message),
    }),
  };
}

// ─── Notification Log ───
export function useReturnNotificationsLog(filters?: { templateCode?: string; status?: string }) {
  return useQuery({
    queryKey: ['return_notifications_log', filters],
    queryFn: async () => {
      let q = (supabase as any).from('return_notifications_log').select('*').order('created_at', { ascending: false }).limit(200);
      if (filters?.templateCode) q = q.eq('template_code', filters.templateCode);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}
