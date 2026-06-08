import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
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
      let q = (supabase as any)
        .from('returns_filed')
        .select(`
          *,
          return_configs(name, return_types(name, code)),
          sectors(name),
          licensees:licensees!returns_filed_entity_id_fkey(name),
          on_behalf_of_licensees:licensees!returns_filed_on_behalf_of_licensee_id_fkey(name)
        `)
        .order('created_at', { ascending: false });
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
      const { data, error } = await (supabase as any)
        .from('returns_filed')
        .select(`
          *,
          return_configs(*, return_types(name, code)),
          sectors(name),
          licensees:licensees!returns_filed_entity_id_fkey(name),
          on_behalf_of_licensees:licensees!returns_filed_on_behalf_of_licensee_id_fkey(name)
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useMyReturns() {
  const { user } = useAuth();
  const { resolvedLicenseeId } = usePpoc();
  return useQuery({
    queryKey: ['my_returns', user?.id, resolvedLicenseeId],
    enabled: !!user?.id,
    queryFn: async () => {
      let targetLicenseeId = resolvedLicenseeId || user?.licenseeId || null;
      if (!targetLicenseeId && user?.id) {
        const { data: profile, error: profileError } = await (supabase as any)
          .from('profiles')
          .select('licensee_id')
          .eq('id', user.id)
          .maybeSingle();
        if (profileError) {
          console.error('[useMyReturns] Failed to resolve fallback licensee scope', profileError);
          throw profileError;
        }
        targetLicenseeId = profile?.licensee_id || null;
      }

      // Strictly scope returns to the currently active licensee entity.
      // PPOC users switching between mapped licensees must see only the
      // selected entity's returns — never an aggregated view across entities.
      let query = (supabase as any)
        .from('returns_filed')
        .select(`
          *,
          return_configs(name, return_types(name, code)),
          sectors(name),
          licensees:licensees!returns_filed_entity_id_fkey(name),
          on_behalf_of_licensees:licensees!returns_filed_on_behalf_of_licensee_id_fkey(name)
        `)
        .order('created_at', { ascending: false });

      if (targetLicenseeId) {
        query = query.or(`entity_id.eq.${targetLicenseeId},on_behalf_of_licensee_id.eq.${targetLicenseeId}`);
      } else {
        // No licensee context yet — fall back to personal scope only.
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
  const invalidateReturnQueries = (id?: string) => {
    qc.invalidateQueries({ queryKey: ['returns_filed'] });
    if (id) qc.invalidateQueries({ queryKey: ['returns_filed', id] });
    qc.invalidateQueries({ queryKey: ['my_returns'] });
    qc.invalidateQueries({ queryKey: ['licensee-metrics'] });
    qc.invalidateQueries({ queryKey: ['return_requests'] });
    qc.invalidateQueries({ queryKey: ['return_audit_log'] });
    qc.invalidateQueries({ queryKey: ['return_comments'] });
  };
  return {
    create: useMutation({
      mutationFn: async (payload: any) => {
        const { data, error } = await (supabase as any).from('returns_filed').insert(payload).select().single();
        if (error) throw error;
        return data;
      },
      onSuccess: (data: any) => { invalidateReturnQueries(data?.id); },
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
      onSuccess: (_: any, vars: any) => { invalidateReturnQueries(vars?.id); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await (supabase as any).from('returns_filed').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: (_: any, id: string) => { invalidateReturnQueries(id); toast.success('Return deleted'); },
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
    mutationFn: async ({ returnId, formId, fields, formVersionId }: { returnId: string; formId: string; fields: { field_id: string; field_name: string; field_value: string }[]; formVersionId?: string | null }) => {
      for (const f of fields) {
        const { error } = await (supabase as any).from('return_form_data').upsert({
          return_id: returnId,
          form_id: formId,
          field_id: f.field_id,
          field_name: f.field_name,
          field_value: f.field_value,
          form_version_id: formVersionId || null,
        }, { onConflict: 'return_id,form_id,field_id' });
        if (error) throw error;
      }
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['return_form_data', v.returnId] }); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── Return → form_version_id summary (for listings) ───
// Returns a map: return_id → { [form_id]: form_version_id }. Useful to show
// which version was used for each form in a listing without N+1 calls.
export function useReturnsVersionMap(returnIds: string[]) {
  const idsKey = [...returnIds].sort().join(',');
  return useQuery({
    queryKey: ['returns_version_map', idsKey],
    enabled: returnIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('return_form_data')
        .select('return_id, form_id, form_version_id')
        .in('return_id', returnIds)
        .not('form_version_id', 'is', null);
      if (error) throw error;
      const map: Record<string, Record<string, string>> = {};
      for (const row of (data || []) as any[]) {
        if (!map[row.return_id]) map[row.return_id] = {};
        // Last write wins for the same form (all rows share a version once pinned).
        map[row.return_id][row.form_id] = row.form_version_id;
      }
      return map;
    },
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
