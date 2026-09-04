import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePpoc } from '@/contexts/PpocContext';
import { toast } from 'sonner';
import { configDelete, configRetire, configSave } from '@/lib/configWriter';
import { legacyReturnCreate, legacyReturnSaveDraft, legacyReturnSubmit, legacyReturnDeleteDraft } from '@/lib/supervisoryGovernedOps';


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
        await configSave('return_types', payload, { entityLabel: 'return type' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_types'] }); toast.success('Return type created'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        await configSave('return_types', payload, { id, entityLabel: 'return type' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_types'] }); toast.success('Return type updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await configRetire('return_types', id, { entityLabel: 'return type' });
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
        return await configSave('return_configs', payload, { entityLabel: 'return configuration' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_configs'] }); toast.success('Configuration created'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        await configSave('return_configs', payload, { id, entityLabel: 'return configuration' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_configs'] }); toast.success('Configuration updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await configRetire('return_configs', id, { entityLabel: 'return configuration' });
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
        // GAP-F1-03: replace the assignment set through the governed writer so
        // each removal/addition carries before/after audit evidence.
        const { data: existing } = await (supabase as any)
          .from('return_config_forms').select('id').eq('return_configuration_id', configId);
        for (const row of (existing ?? []) as { id: string }[]) {
          await configDelete('return_config_forms', row.id, { entityLabel: 'return form assignment' });
        }
        for (const [i, f] of forms.entries()) {
          await configSave('return_config_forms', {
            return_configuration_id: configId,
            form_id: f.form_id,
            tab_name: f.tab_name || 'General',
            display_order: f.display_order ?? i,
            status: 'active',
          }, { entityLabel: 'return form assignment' });
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
        return await legacyReturnCreate(payload);
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
        const status = String((payload as any)?.workflow_status || '').toUpperCase();
        if (status === 'SUB') {
          await legacyReturnSubmit(id, (payload as any)?.ontime_status ?? null);
        } else {
          await legacyReturnSaveDraft(id, payload);
        }
      },
      onSuccess: (_: any, vars: any) => { invalidateReturnQueries(vars?.id); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await legacyReturnDeleteDraft(id, 'Draft return deleted by filer');
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
      const { error } = await (supabase as any).rpc('return_activity_log_append', { _entry: payload });
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

// ─── Applicant Edit Requests (licensee-initiated) ───
export function useReturnEditRequests(returnId: string | undefined) {
  return useQuery({
    queryKey: ['return_edit_requests', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('return_edit_requests')
        .select('*')
        .eq('return_id', returnId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

export function useRequestReturnEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ returnId, reason }: { returnId: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc('request_return_edit', {
        _return_id: returnId,
        _reason: reason,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['return_edit_requests', vars.returnId] });
      qc.invalidateQueries({ queryKey: ['return_audit_log', vars.returnId] });
      toast.success('Edit request submitted. Admin will review your request.');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to submit edit request'),
  });
}

export function useDecideReturnEditRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, decision, comment, returnId }: { requestId: string; decision: 'allowed' | 'denied'; comment: string; returnId: string }) => {
      const { data, error } = await (supabase as any).rpc('decide_return_edit_request', {
        _request_id: requestId,
        _decision: decision,
        _comment: comment,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['return_edit_requests', vars.returnId] });
      qc.invalidateQueries({ queryKey: ['returns_filed'] });
      qc.invalidateQueries({ queryKey: ['returns_filed', vars.returnId] });
      qc.invalidateQueries({ queryKey: ['return_requests', vars.returnId] });
      qc.invalidateQueries({ queryKey: ['return_audit_log', vars.returnId] });
      toast.success(vars.decision === 'allowed' ? 'Edit allowed — return reopened for licensee' : 'Edit request denied');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to decide edit request'),
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
        await configSave('return_cutoff_config', payload, { entityLabel: 'cutoff configuration' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_cutoff_config'] }); toast.success('Cutoff config created'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        await configSave('return_cutoff_config', payload, { id, entityLabel: 'cutoff configuration' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_cutoff_config'] }); toast.success('Updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await configDelete('return_cutoff_config', id, { entityLabel: 'cutoff configuration' });
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
        return await configSave('late_fee_structures', payload, { entityLabel: 'late fee structure' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['late_fee_structures'] }); toast.success('Late fee created'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        await configSave('late_fee_structures', payload, { id, entityLabel: 'late fee structure' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['late_fee_structures'] }); toast.success('Updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await configRetire('late_fee_structures', id, { entityLabel: 'late fee structure' });
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
        await configSave('late_fee_penalty_tiers', payload, { entityLabel: 'penalty tier' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['late_fee_penalty_tiers'] }); toast.success('Tier added'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        await configSave('late_fee_penalty_tiers', payload, { id, entityLabel: 'penalty tier' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['late_fee_penalty_tiers'] }); toast.success('Tier updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await configDelete('late_fee_penalty_tiers', id, { entityLabel: 'penalty tier' });
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
        await configSave('return_notification_templates', payload, { entityLabel: 'notification template' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_notification_templates'] }); toast.success('Template created'); },
      onError: (e: any) => toast.error(e.message),
    }),
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        await configSave('return_notification_templates', payload, { id, entityLabel: 'notification template' });
      },
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['return_notification_templates'] }); toast.success('Template updated'); },
      onError: (e: any) => toast.error(e.message),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await configRetire('return_notification_templates', id, { entityLabel: 'notification template' });
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

// ─── Live Return Notification Event Configs (active system) ───
export function useReturnEventConfigs() {
  return useQuery({
    queryKey: ['return_event_configs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('notification_event_configs')
        .select('*')
        .like('event_key', 'return.%')
        .order('event_key');
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useMutateReturnEventConfig() {
  const qc = useQueryClient();
  return {
    update: useMutation({
      mutationFn: async ({ id, ...payload }: any) => {
        await configSave('notification_event_configs', payload, { id, entityLabel: 'notification event configuration' });
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['return_event_configs'] });
        toast.success('Template updated');
      },
      onError: (e: any) => toast.error(e.message),
    }),
  };
}

// ─── Live Return Dispatch Log (active system) ───
export function useReturnDispatchLog(filters?: { status?: string; channel?: string; eventKey?: string }) {
  return useQuery({
    queryKey: ['return_dispatch_log', filters],
    queryFn: async () => {
      let q = (supabase as any)
        .from('notification_dispatch_log')
        .select('*')
        .like('event_key', 'return.%')
        .order('created_at', { ascending: false })
        .limit(500);
      if (filters?.status) q = q.eq('status', filters.status);
      if (filters?.channel) q = q.eq('channel', filters.channel);
      if (filters?.eventKey) q = q.eq('event_key', filters.eventKey);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

