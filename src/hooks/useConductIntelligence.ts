/**
 * Conduct Intelligence — Published Reports (MCS-ANA-003).
 *
 * Every write goes through a conduct_intel_* SECURITY DEFINER RPC so that
 * authorisation, validation gates, versioning, audit logging and notification
 * enqueueing stay server-side. The client never writes lifecycle state.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  ReportRow, TemplateRow, VersionRow, SectionMap, IntelligenceStatus,
} from '@/lib/conduct/intelligence';

const KEY = ['conduct-intelligence'] as const;

export function useIntelligenceTemplates() {
  return useQuery({
    queryKey: [...KEY, 'templates'],
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from('conduct_intelligence_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data || []) as unknown as TemplateRow[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useIntelligenceReports(status?: IntelligenceStatus | 'all') {
  return useQuery({
    queryKey: [...KEY, 'reports', status ?? 'all'],
    queryFn: async (): Promise<ReportRow[]> => {
      let q = supabase
        .from('conduct_intelligence_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (status && status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as ReportRow[];
    },
  });
}

export function useIntelligenceApprovalQueue() {
  return useQuery({
    queryKey: [...KEY, 'approval-queue'],
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase
        .from('conduct_intelligence_reports')
        .select('*')
        .in('status', ['pending_approval', 'approved'])
        .order('submitted_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ReportRow[];
    },
  });
}

export function useIntelligenceReport(reportId?: string) {
  return useQuery({
    queryKey: [...KEY, 'report', reportId],
    enabled: !!reportId,
    queryFn: async (): Promise<ReportRow | null> => {
      const { data, error } = await supabase
        .from('conduct_intelligence_reports')
        .select('*')
        .eq('id', reportId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ReportRow) ?? null;
    },
  });
}

export function useIntelligenceVersions(reportId?: string) {
  return useQuery({
    queryKey: [...KEY, 'versions', reportId],
    enabled: !!reportId,
    queryFn: async (): Promise<VersionRow[]> => {
      const { data, error } = await supabase
        .from('conduct_intelligence_report_versions')
        .select('*')
        .eq('report_id', reportId!)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as VersionRow[];
    },
  });
}

export function useIntelligenceRecipients(reportId?: string) {
  return useQuery({
    queryKey: [...KEY, 'recipients', reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conduct_intelligence_report_recipients')
        .select('id, licensee_id, created_at, licensees(name)')
        .eq('report_id', reportId!);
      if (error) throw error;
      return data || [];
    },
  });
}

/** Live aggregation preview used before a report exists. */
export function useIntelligencePreview(periodStart?: string, periodEnd?: string, regulatorId?: string | null) {
  return useQuery({
    queryKey: [...KEY, 'preview', periodStart, periodEnd, regulatorId ?? null],
    enabled: !!periodStart && !!periodEnd,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('conduct_intel_aggregate', {
        _period_start: periodStart!,
        _period_end: periodEnd!,
        _regulator_id: regulatorId ?? null,
      });
      if (error) throw error;
      return (data || {}) as Record<string, any>;
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (reportId?: string) => {
    qc.invalidateQueries({ queryKey: KEY });
    if (reportId) {
      qc.invalidateQueries({ queryKey: [...KEY, 'report', reportId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'versions', reportId] });
    }
  };
}

export function useCreateIntelligenceReport() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      templateCode: string; title: string; periodStart: string; periodEnd: string;
      regulatorId?: string | null; sectorId?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('conduct_intel_create_report', {
        _template_code: input.templateCode,
        _title: input.title,
        _period_start: input.periodStart,
        _period_end: input.periodEnd,
        _regulator_id: input.regulatorId ?? null,
        _sector_id: input.sectorId ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidate(),
  });
}

export function useSaveIntelligenceVersion(reportId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      sections: SectionMap; aiDraft?: Record<string, string> | null;
      regenerateMetrics?: boolean; changeNote?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('conduct_intel_save_version', {
        _report_id: reportId,
        _sections: input.sections as any,
        _ai_draft: (input.aiDraft ?? null) as any,
        _regenerate: input.regenerateMetrics ?? false,
        _change_note: input.changeNote ?? null,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => invalidate(reportId),
  });
}

export function useSubmitIntelligenceReport(reportId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { publishToSector: boolean; approverId?: string | null }) => {
      const { error } = await supabase.rpc('conduct_intel_submit_for_approval', {
        _report_id: reportId,
        _publish_to_sector: input.publishToSector,
        _approver_id: input.approverId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(reportId),
  });
}

export function useApproveIntelligenceReport(reportId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('conduct_intel_approve_report', { _report_id: reportId });
      if (error) throw error;
    },
    onSuccess: () => invalidate(reportId),
  });
}

export function useRejectIntelligenceReport(reportId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.rpc('conduct_intel_reject_report', {
        _report_id: reportId, _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(reportId),
  });
}

export function usePublishIntelligenceReport(reportId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('conduct_intel_publish_report', { _report_id: reportId });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => invalidate(reportId),
  });
}

export function useLogIntelligenceExport(reportId: string) {
  return useMutation({
    mutationFn: async (format: 'pdf' | 'doc') => {
      const { error } = await supabase.rpc('conduct_intel_log_export', {
        _report_id: reportId, _format: format,
      });
      if (error) throw error;
    },
  });
}

/** AI draft narrative for one or more sections. */
export function useGenerateIntelligenceDraft(reportId: string) {
  return useMutation({
    mutationFn: async (input: { sectionKeys: string[]; tone?: string }) => {
      const { data, error } = await supabase.functions.invoke('conduct-intelligence-draft', {
        body: { report_id: reportId, section_keys: input.sectionKeys, tone: input.tone ?? 'regulatory' },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || 'Draft generation failed');
      return (data?.sections ?? {}) as Record<string, string>;
    },
  });
}

/* ---------------- Entity portal ---------------- */

export function usePublishedIntelligenceForEntity() {
  return useQuery({
    queryKey: [...KEY, 'entity-published'],
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase
        .from('conduct_intelligence_reports')
        .select('*')
        .eq('status', 'published')
        .order('published_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ReportRow[];
    },
  });
}

export function usePublishedIntelligenceVersion(reportId?: string, version?: number) {
  return useQuery({
    queryKey: [...KEY, 'published-version', reportId, version],
    enabled: !!reportId && !!version,
    queryFn: async (): Promise<VersionRow | null> => {
      const { data, error } = await supabase
        .from('conduct_intelligence_report_versions')
        .select('*')
        .eq('report_id', reportId!)
        .eq('version', version!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as VersionRow) ?? null;
    },
  });
}
