import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkflowInstances } from '@/hooks/useWorkflowEngine';
import { logAction } from '@/hooks/useAuditLog';
import { toast } from 'sonner';

export type CollabEntityType = 'application' | 'registration' | 'return' | 'complaint';

export interface ReviewComment {
  id: string;
  entity_type: CollabEntityType;
  entity_id: string;
  regulator_id: string | null;
  workflow_instance_id: string | null;
  workflow_step_id: string | null;
  field_key: string;
  selection_start: number | null;
  selection_end: number | null;
  selection_text: string | null;
  author_user_id: string;
  author_role_id: string | null;
  body: string;
  parent_comment_id: string | null;
  status: 'open' | 'resolved';
  is_blocking: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ReviewSuggestion {
  id: string;
  entity_type: CollabEntityType;
  entity_id: string;
  workflow_instance_id: string | null;
  workflow_step_id: string | null;
  field_key: string;
  author_user_id: string;
  author_role_id: string | null;
  type: 'insert' | 'delete' | 'replace';
  original_text: string | null;
  suggested_text: string | null;
  selection_start: number | null;
  selection_end: number | null;
  status: 'pending' | 'accepted' | 'rejected';
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ReviewStepPermissions {
  id: string;
  workflow_id: string;
  step_id: string;
  role_id: string;
  enabled: boolean;
  can_view: boolean;
  can_comment: boolean;
  can_reply: boolean;
  can_suggest: boolean;
  can_accept: boolean;
  can_reject: boolean;
  can_resolve: boolean;
  can_mark_blocking: boolean;
  block_approval_on_unresolved_blocking: boolean;
}

export interface ReviewRoleDisplay {
  role_id: string;
  color: string;
  show_reviewer_name: boolean;
  show_role_name: boolean;
}

export interface EffectivePerms {
  enabled: boolean;
  can_view: boolean;
  can_comment: boolean;
  can_reply: boolean;
  can_suggest: boolean;
  can_accept: boolean;
  can_reject: boolean;
  can_resolve: boolean;
  can_mark_blocking: boolean;
  block_on_unresolved: boolean;
  role_id: string | null;
}

export function useCollabReview(entityType: CollabEntityType, entityId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();

  // Resolve workflow instance for this entity
  const wfEntityType =
    entityType === 'application' ? 'pre_application' : entityType;
  const { data: instances = [] } = useWorkflowInstances(wfEntityType, entityId);
  const instance: any = instances?.[0] ?? null;
  const workflowInstanceId: string | null = instance?.id ?? null;
  const workflowId: string | null = instance?.workflow_id ?? null;
  const stepId: string | null = instance?.current_step_id ?? null;

  const commentsQ = useQuery({
    queryKey: ['review-comments', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('review_comments')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReviewComment[];
    },
  });

  const suggestionsQ = useQuery({
    queryKey: ['review-suggestions', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('review_suggestions')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReviewSuggestion[];
    },
  });

  const roleDisplayQ = useQuery({
    queryKey: ['review-role-display'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('review_role_display_settings')
        .select('role_id,color,show_reviewer_name,show_role_name');
      if (error) throw error;
      return (data ?? []) as ReviewRoleDisplay[];
    },
  });

  // Current user's dynamic roles
  const myRolesQ = useQuery({
    queryKey: ['my-dynamic-roles', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('user_dynamic_roles')
        .select('role_id')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.role_id as string);
    },
  });

  const stepPermsQ = useQuery({
    queryKey: ['review-step-perms', stepId],
    enabled: !!stepId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('review_step_permissions')
        .select('*')
        .eq('step_id', stepId);
      if (error) throw error;
      return (data ?? []) as ReviewStepPermissions[];
    },
  });

  const perms: EffectivePerms = useMemo(() => {
    const rows = stepPermsQ.data ?? [];
    const myRoleIds = new Set(myRolesQ.data ?? []);
    const mine = rows.filter(r => myRoleIds.has(r.role_id) && r.enabled);
    const base: EffectivePerms = {
      enabled: rows.some(r => r.enabled),
      can_view: false, can_comment: false, can_reply: false, can_suggest: false,
      can_accept: false, can_reject: false, can_resolve: false, can_mark_blocking: false,
      block_on_unresolved: rows.some(r => r.enabled && r.block_approval_on_unresolved_blocking),
      role_id: mine[0]?.role_id ?? null,
    };
    for (const r of mine) {
      base.can_view = base.can_view || r.can_view;
      base.can_comment = base.can_comment || r.can_comment;
      base.can_reply = base.can_reply || r.can_reply;
      base.can_suggest = base.can_suggest || r.can_suggest;
      base.can_accept = base.can_accept || r.can_accept;
      base.can_reject = base.can_reject || r.can_reject;
      base.can_resolve = base.can_resolve || r.can_resolve;
      base.can_mark_blocking = base.can_mark_blocking || r.can_mark_blocking;
    }
    return base;
  }, [stepPermsQ.data, myRolesQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['review-comments', entityType, entityId] });
    qc.invalidateQueries({ queryKey: ['review-suggestions', entityType, entityId] });
  };

  const addComment = useMutation({
    mutationFn: async (input: {
      field_key: string; body: string;
      selection?: { start: number; end: number; text: string } | null;
      is_blocking?: boolean; parent_comment_id?: string | null;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const row = {
        entity_type: entityType, entity_id: entityId,
        workflow_instance_id: workflowInstanceId, workflow_step_id: stepId,
        field_key: input.field_key, body: input.body,
        selection_start: input.selection?.start ?? null,
        selection_end: input.selection?.end ?? null,
        selection_text: input.selection?.text ?? null,
        author_user_id: user.id, author_role_id: perms.role_id,
        is_blocking: !!input.is_blocking,
        parent_comment_id: input.parent_comment_id ?? null,
      };
      const { data, error } = await (supabase as any)
        .from('review_comments').insert(row).select().single();
      if (error) throw error;
      await logAction(
        input.parent_comment_id ? 'collab_review.reply_added' : 'collab_review.comment_added',
        entityType, entityId, { meta: { id: data.id, field: input.field_key, blocking: row.is_blocking } },
      );
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Comment added'); },
    onError: (e: any) => toast.error(e.message ?? 'Failed to add comment'),
  });

  const resolveComment = useMutation({
    mutationFn: async (input: { id: string; resolved: boolean }) => {
      const patch = input.resolved
        ? { status: 'resolved', resolved_by: user!.id, resolved_at: new Date().toISOString() }
        : { status: 'open', resolved_by: null, resolved_at: null };
      const { error } = await (supabase as any).from('review_comments').update(patch).eq('id', input.id);
      if (error) throw error;
      await logAction(input.resolved ? 'collab_review.comment_resolved' : 'collab_review.comment_reopened',
        entityType, entityId, { meta: { id: input.id } });
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? 'Failed'),
  });

  const setBlocking = useMutation({
    mutationFn: async (input: { id: string; blocking: boolean }) => {
      const { error } = await (supabase as any)
        .from('review_comments').update({ is_blocking: input.blocking }).eq('id', input.id);
      if (error) throw error;
      await logAction('collab_review.blocking_toggled', entityType, entityId,
        { meta: { id: input.id, blocking: input.blocking } });
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? 'Failed'),
  });

  const addSuggestion = useMutation({
    mutationFn: async (input: {
      field_key: string; type: 'insert' | 'delete' | 'replace';
      original_text?: string | null; suggested_text?: string | null;
      selection?: { start: number; end: number } | null;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const row = {
        entity_type: entityType, entity_id: entityId,
        workflow_instance_id: workflowInstanceId, workflow_step_id: stepId,
        field_key: input.field_key,
        author_user_id: user.id, author_role_id: perms.role_id,
        type: input.type,
        original_text: input.original_text ?? null,
        suggested_text: input.suggested_text ?? null,
        selection_start: input.selection?.start ?? null,
        selection_end: input.selection?.end ?? null,
      };
      const { data, error } = await (supabase as any)
        .from('review_suggestions').insert(row).select().single();
      if (error) throw error;
      await logAction('collab_review.suggestion_created', entityType, entityId,
        { meta: { id: data.id, type: input.type, field: input.field_key } });
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Suggestion added'); },
    onError: (e: any) => toast.error(e.message ?? 'Failed'),
  });

  const decideSuggestion = useMutation({
    mutationFn: async (input: { id: string; accept: boolean }) => {
      const rpc = input.accept ? 'accept_review_suggestion' : 'reject_review_suggestion';
      const { error } = await (supabase as any).rpc(rpc, { _suggestion_id: input.id });
      if (error) throw error;
      await logAction(
        input.accept ? 'collab_review.suggestion_accepted' : 'collab_review.suggestion_rejected',
        entityType, entityId, { meta: { id: input.id } },
      );
    },
    onSuccess: () => { invalidate(); toast.success('Updated'); },
    onError: (e: any) => toast.error(e.message ?? 'Failed'),
  });

  const blockingOpen = (commentsQ.data ?? []).filter(c => c.is_blocking && c.status === 'open');

  return {
    isLoading: commentsQ.isLoading || suggestionsQ.isLoading,
    comments: commentsQ.data ?? [],
    suggestions: suggestionsQ.data ?? [],
    roleDisplay: roleDisplayQ.data ?? [],
    stepPerms: stepPermsQ.data ?? [],
    myRoleIds: myRolesQ.data ?? [],
    perms,
    workflowId, workflowInstanceId, stepId,
    blockingOpenCount: blockingOpen.length,
    addComment, resolveComment, setBlocking,
    addSuggestion, decideSuggestion,
  };
}
