import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { dispatchNotificationEvent } from '@/lib/notificationEvents';

export interface LicenseAppeal {
  id: string;
  appeal_reference: string;
  application_id: string;
  license_id: string | null;
  licensee_id: string | null;
  regulator_id: string | null;
  filed_by: string;
  filed_at: string;
  appeal_deadline: string | null;
  grounds: string;
  relief_sought: string | null;
  status: string;
  panel_id: string | null;
  assigned_to: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  hearing_date: string | null;
  decision: string | null;
  decision_rationale: string | null;
  decided_at: string | null;
  decided_by: string | null;
  supporting_docs: unknown;
  created_at: string;
  updated_at: string;
}

export interface LicenseAppealEvent {
  id: string;
  appeal_id: string;
  event_type: string;
  description: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LicenseAppealPanel {
  id: string;
  name: string;
  description: string | null;
  regulator_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const APPEALS_KEY = 'license-appeals';

/** Appeals lodged against a single application (RLS scopes visibility). */
export function useApplicationAppeals(applicationId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'by-application', applicationId],
    queryFn: async (): Promise<LicenseAppeal[]> => {
      const { data, error } = await supabase
        .from('license_appeals')
        .select('*')
        .eq('application_id', applicationId!)
        .order('filed_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LicenseAppeal[];
    },
    enabled: !!applicationId,
    staleTime: 30_000,
  });
}

/** Full appeal register (regulator) or the caller's own appeals (applicant). */
export function useLicenseAppeals(filters?: { status?: string; search?: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [APPEALS_KEY, 'list', filters],
    queryFn: async (): Promise<LicenseAppeal[]> => {
      let q = supabase.from('license_appeals').select('*').order('filed_at', { ascending: false });
      if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data || []) as unknown as LicenseAppeal[];
      const term = filters?.search?.trim().toLowerCase();
      if (term) {
        rows = rows.filter(
          (r) =>
            r.appeal_reference.toLowerCase().includes(term) ||
            (r.grounds || '').toLowerCase().includes(term),
        );
      }
      return rows;
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useLicenseAppeal(appealId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'one', appealId],
    queryFn: async (): Promise<LicenseAppeal | null> => {
      const { data, error } = await supabase
        .from('license_appeals')
        .select('*')
        .eq('id', appealId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as LicenseAppeal) ?? null;
    },
    enabled: !!appealId,
  });
}

/** Status of the application an appeal was lodged against (used to offer a reopen retry). */
export function useAppealApplicationStatus(applicationId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'application-status', applicationId],
    queryFn: async (): Promise<{ status: string; application_number: string } | null> => {
      const { data, error } = await supabase
        .from('applications')
        .select('status, application_number')
        .eq('id', applicationId!)
        .maybeSingle();
      if (error) throw error;
      return (data as { status: string; application_number: string } | null) ?? null;
    },
    enabled: !!applicationId,
    staleTime: 10_000,
  });
}

export function useLicenseAppealEvents(appealId: string | undefined) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'events', appealId],
    queryFn: async (): Promise<LicenseAppealEvent[]> => {
      const { data, error } = await supabase
        .from('license_appeal_events')
        .select('*')
        .eq('appeal_id', appealId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LicenseAppealEvent[];
    },
    enabled: !!appealId,
    staleTime: 15_000,
  });
}

export function useLicenseAppealPanels(activeOnly = false) {
  return useQuery({
    queryKey: [APPEALS_KEY, 'panels', activeOnly],
    queryFn: async (): Promise<LicenseAppealPanel[]> => {
      let q = supabase.from('license_appeal_panels').select('*').order('name');
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as LicenseAppealPanel[];
    },
    staleTime: 120_000,
  });
}

export interface ReinstateResult {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  application_number?: string;
  status?: string;
}

/** Calls the reopen-after-appeal routine and turns its result into a thrown error or a value. */
async function runReinstate(appealId: string, remarks: string): Promise<ReinstateResult> {
  const { data, error } = await supabase.rpc(
    'reinstate_application_after_appeal' as never,
    { _appeal_id: appealId, _remarks: remarks } as never,
  );
  if (error) throw error;
  const result = (data as unknown as ReinstateResult | null) ?? {};
  if (result.error) throw new Error(result.error);
  return result;
}

async function logEvent(appealId: string, eventType: string, description: string, actorId?: string | null) {
  await supabase.from('license_appeal_events').insert({
    appeal_id: appealId,
    event_type: eventType,
    description,
    actor_id: actorId ?? null,
  } as never);
}

export function useLicenseAppealMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [APPEALS_KEY] });

  const lodgeAppeal = useMutation({
    mutationFn: async (input: {
      applicationId: string;
      licenseeId?: string | null;
      regulatorId?: string | null;
      grounds: string;
      reliefSought?: string;
      appealDeadline?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('license_appeals')
        .insert({
          application_id: input.applicationId,
          licensee_id: input.licenseeId ?? null,
          regulator_id: input.regulatorId ?? null,
          filed_by: user!.id,
          grounds: input.grounds,
          relief_sought: input.reliefSought || null,
          appeal_deadline: input.appealDeadline ?? null,
          status: 'submitted',
        } as never)
        .select('*')
        .single();
      if (error) throw error;
      const appeal = data as unknown as LicenseAppeal;
      await logEvent(appeal.id, 'filed', 'Appeal lodged against the licensing decision', user?.id);
      await dispatchNotificationEvent({
        event_key: 'license_appeal.filed',
        entity_type: 'license_appeal',
        entity_id: appeal.id,
        payload: {
          recipient_id: user?.id,
          appeal_reference: appeal.appeal_reference,
          status: 'Filed',
        },
      });
      return appeal;
    },
    onSuccess: invalidate,
  });

  const withdrawAppeal = useMutation({
    mutationFn: async (appealId: string) => {
      const { error } = await supabase
        .from('license_appeals')
        .update({ status: 'withdrawn' } as never)
        .eq('id', appealId);
      if (error) throw error;
      await logEvent(appealId, 'withdrawn', 'Appeal withdrawn by the appellant', user?.id);
    },
    onSuccess: invalidate,
  });

  const acknowledgeAppeal = useMutation({
    mutationFn: async (appeal: LicenseAppeal) => {
      const { error } = await supabase
        .from('license_appeals')
        .update({
          status: 'under_review',
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user!.id,
        } as never)
        .eq('id', appeal.id);
      if (error) throw error;
      await logEvent(appeal.id, 'acknowledged', 'Appeal acknowledged and accepted for review', user?.id);
      await dispatchNotificationEvent({
        event_key: 'license_appeal.acknowledged',
        entity_type: 'license_appeal',
        entity_id: appeal.id,
        payload: {
          recipient_id: appeal.filed_by,
          appeal_reference: appeal.appeal_reference,
          status: 'Under review',
        },
      });
    },
    onSuccess: invalidate,
  });

  const assignPanel = useMutation({
    mutationFn: async (input: {
      appeal: LicenseAppeal;
      panelId: string;
      panelName: string;
      hearingDate?: string | null;
    }) => {
      const { error } = await supabase
        .from('license_appeals')
        .update({
          panel_id: input.panelId,
          hearing_date: input.hearingDate || null,
          status: 'panel_review',
        } as never)
        .eq('id', input.appeal.id);
      if (error) throw error;
      await logEvent(
        input.appeal.id,
        'panel_assigned',
        `Appeal referred to ${input.panelName}${input.hearingDate ? ` — hearing set for ${input.hearingDate}` : ''}`,
        user?.id,
      );
      await dispatchNotificationEvent({
        event_key: 'license_appeal.panel_assigned',
        entity_type: 'license_appeal',
        entity_id: input.appeal.id,
        payload: {
          recipient_id: input.appeal.filed_by,
          appeal_reference: input.appeal.appeal_reference,
          panel_name: input.panelName,
          hearing_date: input.hearingDate || '',
          status: 'With appeal panel',
        },
      });
    },
    onSuccess: invalidate,
  });

  const recordDecision = useMutation({
    mutationFn: async (input: { appeal: LicenseAppeal; decision: string; rationale: string }) => {
      const { error } = await supabase
        .from('license_appeals')
        .update({
          decision: input.decision,
          decision_rationale: input.rationale,
          decided_at: new Date().toISOString(),
          decided_by: user!.id,
          status: 'decided',
        } as never)
        .eq('id', input.appeal.id);
      if (error) throw error;
      await logEvent(
        input.appeal.id,
        'decided',
        input.decision === 'upheld'
          ? 'Appeal accepted for consideration'
          : 'Appeal declined',
        user?.id,
      );

      // Accepting an appeal puts the refused application back under review.
      let reinstated: ReinstateResult | null = null;
      if (input.decision === 'upheld') {
        reinstated = await runReinstate(input.appeal.id, input.rationale);
      }

      await dispatchNotificationEvent({
        event_key: 'license_appeal.decided',
        entity_type: 'license_appeal',
        entity_id: input.appeal.id,
        payload: {
          recipient_id: input.appeal.filed_by,
          appeal_reference: input.appeal.appeal_reference,
          decision: input.decision.replace(/_/g, ' '),
          decision_rationale: input.rationale,
          status: 'Decided',
        },
      });
      return reinstated;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-instance'] });
    },
  });

  /** Retry the reopen step for an appeal that was already accepted. */
  const reinstateApplication = useMutation({
    mutationFn: async (input: { appeal: LicenseAppeal }) =>
      runReinstate(input.appeal.id, input.appeal.decision_rationale || ''),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-instance'] });
    },
  });


  const savePanel = useMutation({
    mutationFn: async (input: { id?: string; name: string; description?: string; is_active: boolean }) => {
      if (input.id) {
        const { error } = await supabase
          .from('license_appeal_panels')
          .update({ name: input.name, description: input.description || null, is_active: input.is_active } as never)
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('license_appeal_panels')
          .insert({ name: input.name, description: input.description || null, is_active: input.is_active } as never);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  return { lodgeAppeal, withdrawAppeal, acknowledgeAppeal, assignPanel, recordDecision, savePanel };
}
