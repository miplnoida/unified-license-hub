import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlus, Check, X, RotateCcw, Reply, AlertTriangle, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCollabReview, type CollabEntityType, type ReviewComment, type ReviewSuggestion } from '@/hooks/useCollabReview';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRoles } from '@/hooks/useRoles';
import { INTERNAL_ROLES } from '@/types/platform';
import { ReviewerLegend, type ReviewerLegendEntry } from './markup/ReviewerLegend';
import { ViewModeToggle, type ViewMode } from './markup/ViewModeToggle';
import { InlineMarkup } from './markup/InlineMarkup';
import { buildSeedOverlay, reviewerFromRoster, isSyntheticId } from './demoContent';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';

interface FieldSpec { key: string; label: string; value: string }

interface Props {
  entityType: CollabEntityType;
  entityId?: string;
  fields: FieldSpec[];
}

type Filter = 'all' | 'open' | 'resolved' | 'suggestions' | 'mine';

const DEFAULT_COLOR = '#6366F1';

export function CollaborativeReview({ entityType, entityId, fields }: Props) {
  const isMobile = useIsMobile();
  const collab = useCollabReview(entityType, entityId);
  const [activeField, setActiveField] = useState(fields[0]?.key ?? '');
  const [filter, setFilter] = useState<Filter>('open');
  const [draft, setDraft] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [suggType, setSuggType] = useState<'insert' | 'delete' | 'replace'>('replace');
  const [suggText, setSuggText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('markup');
  const [reviewerFilter, setReviewerFilter] = useState<string | null>(null);
  const [showSelectionEditor, setShowSelectionEditor] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const { user } = useAuth();
  const { data: allRoles = [] } = useRoles();
  const portalCtx = useEffectivePortalContext();

  // ---- Seeded activity overlay ---------------------------------------------
  // If the record has no real comments/suggestions and every field is empty,
  // inject realistic reviewer content so the panel reads as fully populated.
  // Real records with any activity or narrative content are unaffected.
  const currentUserDescriptor = useMemo(() => {
    const name = user?.fullName || (user?.email ? user.email.split('@')[0] : 'Reviewer');
    const roleName =
      portalCtx?.effectiveRole
      || (user?.role ? String(user.role).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Reviewer');
    return { id: user?.id || 'anonymous', name, roleName };
  }, [user?.id, user?.fullName, user?.email, user?.role, portalCtx?.effectiveRole]);

  const seed = useMemo(
    () => buildSeedOverlay(
      { entityType, fields, currentUser: currentUserDescriptor, recordId: entityId || '' },
      (collab.comments?.length ?? 0) > 0 || (collab.suggestions?.length ?? 0) > 0,
    ),
    [entityType, fields, collab.comments, collab.suggestions, currentUserDescriptor, entityId],
  );

  const effectiveFields = seed.active ? seed.fields : fields;
  const effectiveComments = seed.active ? seed.comments : collab.comments;
  const effectiveSuggestions = seed.active ? seed.suggestions : collab.suggestions;

  const authorIds = useMemo(() => {
    const set = new Set<string>();
    effectiveComments.forEach(c => set.add(c.author_user_id));
    effectiveSuggestions.forEach(s => set.add(s.author_user_id));
    // Skip synthetic ids — no profile lookup needed.
    return Array.from(set).filter(id => !isSyntheticId(id));
  }, [effectiveComments, effectiveSuggestions]);

  const { data: authors = [] } = useQuery({
    queryKey: ['collab-authors', authorIds.sort().join(',')],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id,full_name,email').in('id', authorIds);
      return data ?? [];
    },
  });
  const authorMap = new Map(authors.map(a => [a.id, a as any]));
  const roleMap = new Map(allRoles.map((r: any) => [r.id, r]));
  const roleDisplayMap = new Map(collab.roleDisplay.map(r => [r.role_id, r]));

  const activeFieldSpec = effectiveFields.find(f => f.key === activeField) ?? effectiveFields[0];

  if (!collab.perms.enabled || !collab.perms.can_view || !collab.stepId) {
    const isAdmin = !!user && (user.role === 'super_admin' || user.role === 'admin' || INTERNAL_ROLES.includes(user.role as any));
    if (isAdmin) {
      return (
        <Card className="border-warning/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Collaborative Review is not enabled for this step
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Review step permissions do not currently grant this user view access.</p>
            <p>Step: {collab.stepId || 'No active workflow step resolved'}</p>
            <p>Workflow: {collab.workflowId || 'No active workflow resolved'}</p>
            <p>Configured permission rows: {collab.stepPerms.length}</p>
          </CardContent>
        </Card>
      );
    }
    return null; // feature not enabled or user has no view permission on this step
  }

  const commentsForField = effectiveComments.filter(c => c.field_key === activeField && !c.parent_comment_id);
  const repliesFor = (id: string) => effectiveComments.filter(c => c.parent_comment_id === id);
  const suggestionsForField = effectiveSuggestions.filter(s => s.field_key === activeField);

  const filteredComments = commentsForField.filter(c => {
    if (reviewerFilter && c.author_user_id !== reviewerFilter) return false;
    if (filter === 'open') return c.status === 'open';
    if (filter === 'resolved') return c.status === 'resolved';
    if (filter === 'mine') return c.author_user_id === user?.id;
    if (filter === 'suggestions') return false;
    return true;
  });
  const filteredSuggestions = suggestionsForField.filter(s => {
    if (reviewerFilter && s.author_user_id !== reviewerFilter) return false;
    if (filter === 'suggestions') return true;
    if (filter === 'mine') return s.author_user_id === user?.id;
    if (filter === 'resolved') return s.status !== 'pending';
    if (filter === 'open') return s.status === 'pending';
    return true;
  });

  const authorLabelSafe = (uid: string, roleId: string | null) => {
    // Seeded roster (including the signed-in user) bypasses profile/role lookup.
    const seedR = reviewerFromRoster(seed.roster, uid);
    if (seedR) {
      return { name: seedR.name, roleName: seedR.roleName, color: seedR.color, initials: seedR.initials };
    }
    const p = authorMap.get(uid);
    const r = roleId ? roleMap.get(roleId) : null;
    const disp = roleId ? roleDisplayMap.get(roleId) : null;
    const showName = disp?.show_reviewer_name ?? true;
    const showRole = disp?.show_role_name ?? true;
    const name = p?.full_name || p?.email || 'Reviewer';
    const initials = name.split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase();
    return { name: showName ? name : initials, roleName: showRole ? (r?.name ?? '') : '', color: disp?.color ?? DEFAULT_COLOR, initials };
  };

  // Build reviewer legend entries (distinct authors on this field) with counts.
  const legendEntries: ReviewerLegendEntry[] = (() => {
    const map = new Map<string, ReviewerLegendEntry>();
    const bump = (uid: string, roleId: string | null) => {
      const key = uid;
      const a = authorLabelSafe(uid, roleId);
      const existing = map.get(key);
      if (existing) { existing.count += 1; return; }
      map.set(key, { id: uid, name: a.name, roleName: a.roleName, color: a.color, initials: a.initials, count: 1 });
    };
    commentsForField.forEach(c => bump(c.author_user_id, c.author_role_id));
    suggestionsForField.forEach(s => bump(s.author_user_id, s.author_role_id));
    return Array.from(map.values());
  })();

  // Number anchored comments (those with a selection range) for the inline pin badges.
  const commentAnchorNumbers = (() => {
    const anchored = commentsForField
      .filter(c => c.selection_start != null && c.selection_end != null && (c.selection_end ?? 0) > (c.selection_start ?? 0))
      .sort((a, b) => (a.selection_start ?? 0) - (b.selection_start ?? 0));
    const m = new Map<string, number>();
    anchored.forEach((c, i) => m.set(c.id, i + 1));
    return m;
  })();

  const colorForAuthor = (uid: string, roleId: string | null) => authorLabelSafe(uid, roleId).color;

  // Blocking count includes seeded blocking comments so the header badge appears when the overlay is active.
  const effectiveBlockingOpenCount = seed.active
    ? effectiveComments.filter(c => c.is_blocking && c.status === 'open' && !c.parent_comment_id).length
    : collab.blockingOpenCount;

  const scrollToCard = (commentId: string) => {
    const el = cardRefs.current.get(commentId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 1200);
    }
  };

  const captureSelection = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) { setSelection(null); return; }
    setSelection({ start, end, text: ta.value.substring(start, end) });
  };

  // Auto-detect the reviewer role: prefer the role from the user's permission
  // context, else the first configured role. No user-facing role picker.
  const multiRole = (collab.availableRoles?.length ?? 0) > 1;
  const autoRoleId = useMemo(() => {
    const available = collab.availableRoles ?? [];
    if (available.length === 0) return collab.perms.role_id ?? null;
    if (collab.perms.role_id && available.includes(collab.perms.role_id)) return collab.perms.role_id;
    return available[0] ?? null;
  }, [collab.availableRoles, collab.perms.role_id]);
  useEffect(() => {
    if (!selectedRoleId && autoRoleId) setSelectedRoleId(autoRoleId);
  }, [autoRoleId, selectedRoleId]);
  const effectiveRoleId = selectedRoleId ?? autoRoleId;
  const roleGateOk = !!effectiveRoleId;

  const submitComment = () => {
    if (!draft.trim() || !activeFieldSpec) return;
    collab.addComment.mutate({
      field_key: activeFieldSpec.key,
      body: draft.trim(),
      selection,
      is_blocking: blocking,
      role_id: effectiveRoleId,
    }, { onSuccess: () => { setDraft(''); setBlocking(false); setSelection(null); } });
  };

  const submitSuggestion = () => {
    if (!activeFieldSpec) return;
    if (suggType !== 'delete' && !suggText.trim()) return;
    if (suggType !== 'insert' && !selection) return;
    collab.addSuggestion.mutate({
      field_key: activeFieldSpec.key,
      type: suggType,
      original_text: selection?.text ?? null,
      suggested_text: suggType === 'delete' ? null : suggText.trim(),
      selection: selection ? { start: selection.start, end: selection.end } : null,
      role_id: effectiveRoleId,
    }, { onSuccess: () => { setSuggText(''); setSelection(null); } });
  };

  const submitReply = (parentId: string) => {
    if (!replyBody.trim() || !activeFieldSpec) return;
    collab.addComment.mutate({
      field_key: activeFieldSpec.key,
      body: replyBody.trim(),
      parent_comment_id: parentId,
      role_id: effectiveRoleId,
    }, { onSuccess: () => { setReplyBody(''); setReplyTo(null); } });
  };

  const authorLabel = authorLabelSafe;


  const Sidebar = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="font-medium">Comments & suggestions</span>
        </div>
        {effectiveBlockingOpenCount > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />{effectiveBlockingOpenCount} blocking
          </Badge>
        )}
      </div>
      <ReviewerLegend entries={legendEntries} activeId={reviewerFilter} onToggle={setReviewerFilter} />
      <Select value={filter} onValueChange={v => setFilter(v as Filter)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
          <SelectItem value="suggestions">Suggestions</SelectItem>
          <SelectItem value="mine">My comments</SelectItem>
        </SelectContent>
      </Select>

      {filteredComments.length === 0 && filteredSuggestions.length === 0 && (
        <div className="border border-dashed rounded-md p-4 text-sm text-muted-foreground text-center space-y-2">
          <div>No comments yet.</div>
          <div className="text-xs">Select text in the narrative to anchor a comment or suggest a change. Each reviewer gets a unique color; their edits and comments show inline and here.</div>
        </div>
      )}

      {filteredSuggestions.map(s => {
        const a = authorLabel(s.author_user_id, s.author_role_id);
        return (
          <div
            key={s.id}
            ref={el => cardRefs.current.set(s.id, el)}
            className="border rounded-md p-3 space-y-2 bg-card transition-shadow"
            style={{ borderLeft: `3px solid ${a.color}` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-semibold text-white"
                      style={{ background: a.color }}>{a.initials}</span>
                <div className="text-xs">
                  <div className="font-medium">{a.name}</div>
                  <div className="text-muted-foreground">{a.roleName} · {new Date(s.created_at).toLocaleString()}</div>
                </div>
              </div>
              <Badge variant="outline" className="capitalize">{s.type}</Badge>
            </div>
            <div className="text-sm">
              {s.original_text && <div className="line-through text-destructive">{s.original_text}</div>}
              {s.suggested_text && <div className="text-success">{s.suggested_text}</div>}
            </div>
            <div className="flex items-center justify-between">
              <Badge variant={s.status === 'accepted' ? 'default' : s.status === 'rejected' ? 'secondary' : 'outline'}>
                {s.status}
              </Badge>
              {s.status === 'pending' && !isSyntheticId(s.id) && (
                <div className="flex gap-1">
                  {collab.perms.can_accept && (
                    <Button size="sm" variant="outline" onClick={() => collab.decideSuggestion.mutate({ id: s.id, accept: true })}>
                      <Check className="h-3 w-3 mr-1" />Accept
                    </Button>
                  )}
                  {collab.perms.can_reject && (
                    <Button size="sm" variant="outline" onClick={() => collab.decideSuggestion.mutate({ id: s.id, accept: false })}>
                      <X className="h-3 w-3 mr-1" />Reject
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {filteredComments.map(c => {
        const a = authorLabel(c.author_user_id, c.author_role_id);
        const replies = repliesFor(c.id);
        const pin = commentAnchorNumbers.get(c.id);
        return (
          <div
            key={c.id}
            ref={el => cardRefs.current.set(c.id, el)}
            className="border rounded-md p-3 space-y-2 bg-card transition-shadow"
            style={{ borderLeft: `3px solid ${a.color}` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-semibold text-white"
                      style={{ background: a.color }}>{a.initials}</span>
                <div className="text-xs">
                  <div className="font-medium flex items-center gap-1.5">
                    {a.name}
                    {pin && (
                      <span
                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white"
                        style={{ background: a.color }}
                        title="Anchored in narrative"
                      >
                        {pin}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground">{a.roleName} · {new Date(c.created_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex gap-1">
                {c.is_blocking && <Badge variant="destructive" className="text-[10px]">Blocking</Badge>}
                <Badge variant={c.status === 'open' ? 'outline' : 'secondary'} className="text-[10px]">{c.status}</Badge>
              </div>
            </div>
            {c.selection_text && (
              <div className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-2">
                “{c.selection_text}”
              </div>
            )}
            <div className="text-sm whitespace-pre-wrap">{c.body}</div>

            {replies.length > 0 && (
              <div className="pl-3 border-l space-y-2">
                {replies.map(r => {
                  const ra = authorLabel(r.author_user_id, r.author_role_id);
                  return (
                    <div key={r.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-semibold text-white"
                              style={{ background: ra.color }}>{ra.initials}</span>
                        <span className="font-medium">{ra.name}</span>
                        <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      <div className="ml-6 whitespace-pre-wrap">{r.body}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-1 pt-1">
              {!isSyntheticId(c.id) && (
                <>
                  {collab.perms.can_reply && (
                    <Button size="sm" variant="ghost" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
                      <Reply className="h-3 w-3 mr-1" />Reply
                    </Button>
                  )}
                  {collab.perms.can_resolve && c.status === 'open' && (
                    <Button size="sm" variant="ghost" onClick={() => collab.resolveComment.mutate({ id: c.id, resolved: true })}>
                      <Check className="h-3 w-3 mr-1" />Resolve
                    </Button>
                  )}
                  {collab.perms.can_resolve && c.status === 'resolved' && (
                    <Button size="sm" variant="ghost" onClick={() => collab.resolveComment.mutate({ id: c.id, resolved: false })}>
                      <RotateCcw className="h-3 w-3 mr-1" />Reopen
                    </Button>
                  )}
                  {collab.perms.can_mark_blocking && (
                    <Button size="sm" variant="ghost" onClick={() => collab.setBlocking.mutate({ id: c.id, blocking: !c.is_blocking })}>
                      <AlertTriangle className="h-3 w-3 mr-1" />{c.is_blocking ? 'Unblock' : 'Blocking'}
                    </Button>
                  )}
                </>
              )}
            </div>


            {replyTo === c.id && (
              <div className="space-y-2 pt-2">
                <Textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="Write a reply…" rows={2} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setReplyTo(null); setReplyBody(''); }}>Cancel</Button>
                  <Button size="sm" onClick={() => submitReply(c.id)} disabled={!replyBody.trim()}>Reply</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const NarrativeArea = (
    <div className="space-y-3">
      {effectiveFields.length > 1 && (
        <Select value={activeField} onValueChange={setActiveField}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {effectiveFields.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-sm font-medium">{activeFieldSpec?.label}</div>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
        {viewMode === 'original' ? (
          <Textarea
            ref={textareaRef}
            readOnly
            value={activeFieldSpec?.value ?? ''}
            onSelect={captureSelection}
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            rows={10}
            placeholder="No narrative content."
            className="font-mono text-sm"
          />
        ) : (
          <InlineMarkup
            text={activeFieldSpec?.value ?? ''}
            suggestions={filteredSuggestions}
            comments={filteredComments}
            commentAnchorNumbers={commentAnchorNumbers}
            colorForAuthor={colorForAuthor}
            mode={viewMode}
            onAnchorClick={scrollToCard}
            highlightAuthorId={reviewerFilter}
          />
        )}
        {selection && (
          <p className="text-xs text-muted-foreground mt-1">
            Selected {selection.end - selection.start} chars: “{selection.text.slice(0, 60)}{selection.text.length > 60 ? '…' : ''}”
          </p>
        )}
      </div>





      {collab.perms.can_comment ? (
        <div className="space-y-2 border rounded-md p-3">
          <div className="text-xs font-medium flex items-center gap-1"><MessageSquarePlus className="h-3 w-3" />Add comment</div>
          <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} placeholder="Write a comment. Select text first to anchor it." />
          <div className="flex items-center justify-between">
            {collab.perms.can_mark_blocking ? (
              <label className="text-xs flex items-center gap-2">
                <input type="checkbox" checked={blocking} onChange={e => setBlocking(e.target.checked)} />
                Blocking comment
              </label>
            ) : <span />}
            <Button size="sm" onClick={submitComment} disabled={!draft.trim() || !roleGateOk || collab.addComment.isPending}>Add comment</Button>
          </div>
          {!roleGateOk && (
            <p className="text-[11px] text-muted-foreground">Choose a role above before posting.</p>
          )}
        </div>
      ) : (
        <div className="border border-dashed rounded-md p-3 text-xs text-muted-foreground">
          {collab.myMatchingRows && collab.myMatchingRows.length === 0
            ? 'Your role is not configured to comment on this workflow step. Ask an administrator to enable commenting for your role in Settings → Collaborative Review.'
            : 'Your current role can view but not comment on this step. Ask an administrator to enable commenting for your role.'}
        </div>
      )}

      {collab.perms.can_suggest && (
        <div className="space-y-2 border rounded-md p-3">
          <div className="text-xs font-medium">Suggest change</div>
          <div className="flex gap-2">
            <Select value={suggType} onValueChange={v => setSuggType(v as any)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="insert">Insert</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="replace">Replace</SelectItem>
              </SelectContent>
            </Select>
            {suggType !== 'delete' && (
              <Textarea value={suggText} onChange={e => setSuggText(e.target.value)} rows={2}
                placeholder={suggType === 'insert' ? 'Text to insert' : 'Replacement text'} />
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground">
              {!roleGateOk
                ? 'Choose a role before posting.'
                : suggType === 'insert' ? 'Insertion is added at your cursor position.' : 'Select the original text first.'}
            </span>
            <Button size="sm" onClick={submitSuggestion} disabled={!roleGateOk || collab.addSuggestion.isPending}>Suggest</Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Collaborative Review</span>
          {(collab.perms.block_on_unresolved || seed.active) && effectiveBlockingOpenCount > 0 && (
            <Badge variant="destructive">Approval blocked: {effectiveBlockingOpenCount} unresolved</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isMobile ? (
          <div className="space-y-4">
            {NarrativeArea}
            <Drawer>
              <DrawerTrigger asChild>
                <Button variant="outline" className="w-full">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  View {commentsForField.length + suggestionsForField.length} comments
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader><DrawerTitle>Comments & suggestions</DrawerTitle></DrawerHeader>
                <div className="p-4 overflow-y-auto max-h-[70vh]">{Sidebar}</div>
              </DrawerContent>
            </Drawer>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">{NarrativeArea}</div>
            <div className="md:col-span-1 border-l md:pl-4">{Sidebar}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CollaborativeReview;
