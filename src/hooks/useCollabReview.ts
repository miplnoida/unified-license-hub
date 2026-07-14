import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRegulator } from '@/contexts/RegulatorContext';
// (workflow instance resolved inline below to support legacy entity_type values)
import { logAction } from '@/hooks/useAuditLog';
import { dispatchNotificationEvent } from '@/lib/notificationEvents';
import { humanizeReviewError } from '@/lib/reviewErrors';
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
  const { activeRegulatorId } = useRegulator();

  // Resolve workflow instance for this entity
  // Legacy-aware workflow instance lookup. For `application`, rows may be
  // stored under `application` (legacy), `pre_application`, or `post_application`.
  const wfEntityTypes: string[] =
    entityType === 'application'
      ? ['application', 'pre_application', 'post_application']
      : [entityType];
  const instanceQ = useQuery({
    queryKey: ['collab-workflow-instance', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workflow_instances')
        .select('id, workflow_id, current_step_id, entity_type, status, created_at')
        .in('entity_type', wfEntityTypes)
        .eq('entity_id', entityId)
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
  const instance: any = instanceQ.data ?? null;
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
    queryKey: ['review-role-display', activeRegulatorId ?? 'global'],
    queryFn: async () => {
      // Prefer regulator-specific rows and fall back to global via the RPC.
      const { data, error } = await (supabase as any).rpc('get_review_role_display', {
        _regulator_id: activeRegulatorId ?? null,
      });
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
    const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';
    const mine = rows.filter(r => (myRoleIds.has(r.role_id) || isPlatformAdmin) && r.enabled);
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
  }, [stepPermsQ.data, myRolesQ.data, user?.role]);

  // Query keys used by each entity's detail view — invalidated after accepted suggestions
  // so the narrative refetches from the DB.
  const entityQueryKeys: string[][] = useMemo(() => {
    if (!entityId) return [];
    switch (entityType) {
      case 'application': return [['application', entityId], ['applications']];
      case 'registration': return [['registration', entityId], ['registration-review']];
      case 'return': return [['return', entityId], ['returns-filed']];
      case 'complaint': return [['complaint', entityId], ['complaints']];
      default: return [];
    }
  }, [entityType, entityId]);

  const invalidate = (includeEntity = false) => {
    qc.invalidateQueries({ queryKey: ['review-comments', entityType, entityId] });
    qc.invalidateQueries({ queryKey: ['review-suggestions', entityType, entityId] });
    if (includeEntity) {
      entityQueryKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
    }
  };

  const humanError = (e: any): string => humanizeReviewError(e);

  const addComment = useMutation({
    mutationFn: async (input: {
      field_key: string; body: string;
      selection?: { start: number; end: number; text: string } | null;
      is_blocking?: boolean; parent_comment_id?: string | null;
      role_id?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc('add_review_comment', {
        _entity_type: entityType,
        _entity_id: entityId,
        _field_key: input.field_key,
        _body: input.body,
        _selection: input.selection ? {
          start: input.selection.start, end: input.selection.end, text: input.selection.text,
        } : null,
        _is_blocking: !!input.is_blocking,
        _role_id: input.role_id ?? perms.role_id ?? null,
        _parent_comment_id: input.parent_comment_id ?? null,
      });
      if (error) throw error;
      await logAction(
        input.parent_comment_id ? 'collab_review.reply_added' : 'collab_review.comment_added',
        entityType, entityId, { meta: { id: data?.id, field: input.field_key, blocking: !!input.is_blocking } },
      );
      // Fire-and-forget notifications; safe on failure.
      if (input.parent_comment_id) {
        void dispatchNotificationEvent({
          event_key: 'collab_review.reply',
          entity_type: entityType, entity_id: entityId,
          payload: { comment_id: data?.id, parent_comment_id: input.parent_comment_id, field_key: input.field_key },
        });
      }
      if (input.is_blocking && !input.parent_comment_id) {
        void dispatchNotificationEvent({
          event_key: 'collab_review.blocking_created',
          entity_type: entityType, entity_id: entityId,
          payload: { comment_id: data?.id, field_key: input.field_key },
        });
      }
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Comment added'); },
    onError: (e: any) => toast.error(humanError(e)),
  });

  const resolveComment = useMutation({
    mutationFn: async (input: { id: string; resolved: boolean }) => {
      const { error } = await (supabase as any).rpc('resolve_review_comment', {
        _comment_id: input.id, _resolved: input.resolved,
      });
      if (error) throw error;
      await logAction(input.resolved ? 'collab_review.comment_resolved' : 'collab_review.comment_reopened',
        entityType, entityId, { meta: { id: input.id } });
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(humanError(e)),
  });

  const setBlocking = useMutation({
    mutationFn: async (input: { id: string; blocking: boolean }) => {
      const { error } = await (supabase as any).rpc('set_review_comment_blocking', {
        _comment_id: input.id, _blocking: input.blocking,
      });
      if (error) throw error;
      await logAction('collab_review.blocking_toggled', entityType, entityId,
        { meta: { id: input.id, blocking: input.blocking } });
      if (input.blocking) {
        void dispatchNotificationEvent({
          event_key: 'collab_review.blocking_created',
          entity_type: entityType, entity_id: entityId,
          payload: { comment_id: input.id },
        });
      }
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(humanError(e)),
  });

  const addSuggestion = useMutation({
    mutationFn: async (input: {
      field_key: string; type: 'insert' | 'delete' | 'replace';
      original_text?: string | null; suggested_text?: string | null;
      selection?: { start: number; end: number } | null;
      role_id?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc('create_review_suggestion', {
        _entity_type: entityType,
        _entity_id: entityId,
        _field_key: input.field_key,
        _type: input.type,
        _original_text: input.original_text ?? null,
        _suggested_text: input.suggested_text ?? null,
        _selection: input.selection ? { start: input.selection.start, end: input.selection.end } : null,
        _role_id: input.role_id ?? perms.role_id ?? null,
      });
      if (error) throw error;
      await logAction('collab_review.suggestion_created', entityType, entityId,
        { meta: { id: data?.id, type: input.type, field: input.field_key } });
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Suggestion added'); },
    onError: (e: any) => toast.error(humanError(e)),
  });

  const decideSuggestion = useMutation({
    mutationFn: async (input: { id: string; accept: boolean }) => {
      const rpc = input.accept ? 'accept_review_suggestion' : 'reject_review_suggestion';
      const { data, error } = await (supabase as any).rpc(rpc, { _suggestion_id: input.id });
      if (error) throw error;
      await logAction(
        input.accept ? 'collab_review.suggestion_accepted' : 'collab_review.suggestion_rejected',
        entityType, entityId, { meta: { id: input.id } },
      );
      void dispatchNotificationEvent({
        event_key: input.accept ? 'collab_review.suggestion_accepted' : 'collab_review.suggestion_rejected',
        entity_type: entityType, entity_id: entityId,
        payload: { suggestion_id: input.id, author_user_id: (data as any)?.author_user_id ?? null },
      });
    },
    onSuccess: (_d, vars) => {
      invalidate(vars.accept);
      toast.success(vars.accept ? 'Suggestion accepted — narrative updated.' : 'Suggestion rejected.');
    },
    onError: (e: any) => toast.error(humanError(e)),
  });

  const blockingOpen = (commentsQ.data ?? []).filter(c => c.is_blocking && c.status === 'open');

  const availableRoles: string[] = useMemo(() => {
    const rows = stepPermsQ.data ?? [];
    const mineSet = new Set(myRolesQ.data ?? []);
    const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';
    return rows.filter(r => r.enabled && (mineSet.has(r.role_id) || isPlatformAdmin)).map(r => r.role_id);
  }, [stepPermsQ.data, myRolesQ.data, user?.role]);

  // Diagnostics: which of the user's dynamic roles have a permission row on this step,
  // and which role_ids the step is configured for. Lets the UI distinguish
  // "feature off" from "your role isn't listed".
  const myMatchingRows: ReviewStepPermissions[] = useMemo(() => {
    const rows = stepPermsQ.data ?? [];
    const mineSet = new Set(myRolesQ.data ?? []);
    return rows.filter(r => mineSet.has(r.role_id));
  }, [stepPermsQ.data, myRolesQ.data]);

  const configuredRoleIds: string[] = useMemo(
    () => (stepPermsQ.data ?? []).map(r => r.role_id),
    [stepPermsQ.data],
  );

  return {
    isLoading: commentsQ.isLoading || suggestionsQ.isLoading,
    comments: commentsQ.data ?? [],
    suggestions: suggestionsQ.data ?? [],
    roleDisplay: roleDisplayQ.data ?? [],
    stepPerms: stepPermsQ.data ?? [],
    myRoleIds: myRolesQ.data ?? [],
    myMatchingRows,
    configuredRoleIds,
    availableRoles,
    perms,
    workflowId, workflowInstanceId, stepId,
    blockingOpenCount: blockingOpen.length,
    addComment, resolveComment, setBlocking,
    addSuggestion, decideSuggestion,
    humanError,
  };
}

