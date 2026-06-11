/**
 * Workflow version lifecycle hook.
 *
 * Wraps the `approval_workflow_versions` table and the
 * `publish_workflow_version(workflow_id, notes)` RPC added in the
 * workflow-versioning migration.
 *
 * An in-progress workflow instance is pinned (via DB trigger) to the
 * workflow's `current_published_version_id` and its `version_snapshot`.
 * Admin edits to live `approval_steps` / actions / notifications do NOT
 * affect those pinned instances — only newly-created instances pick up
 * the latest published version.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WorkflowVersionRow {
  id: string;
  workflow_id: string;
  version_number: number;
  status: 'draft' | 'published' | 'archived';
  snapshot: unknown;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
}

export function useWorkflowVersions(workflowId: string | null | undefined) {
  return useQuery({
    enabled: !!workflowId,
    queryKey: ['workflow_versions', workflowId],
    queryFn: async (): Promise<WorkflowVersionRow[]> => {
      const { data, error } = await supabase
        .from('approval_workflow_versions' as any)
        .select('*')
        .eq('workflow_id', workflowId!)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WorkflowVersionRow[];
    },
    staleTime: 30_000,
  });
}

export function useCurrentPublishedVersion(workflowId: string | null | undefined) {
  return useQuery({
    enabled: !!workflowId,
    queryKey: ['workflow_current_version', workflowId],
    queryFn: async (): Promise<WorkflowVersionRow | null> => {
      const { data, error } = await supabase
        .from('approval_workflow_versions' as any)
        .select('*')
        .eq('workflow_id', workflowId!)
        .eq('status', 'published')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as WorkflowVersionRow | null;
    },
    staleTime: 30_000,
  });
}

export function usePublishWorkflowVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { workflowId: string; notes?: string }) => {
      const { data, error } = await supabase.rpc('publish_workflow_version' as any, {
        _workflow_id: params.workflowId,
        _notes: params.notes ?? null,
      });
      if (error) throw error;
      return data as unknown as WorkflowVersionRow;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['workflow_versions', vars.workflowId] });
      qc.invalidateQueries({ queryKey: ['workflow_current_version', vars.workflowId] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}
