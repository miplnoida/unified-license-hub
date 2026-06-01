import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Pencil, Trash2, Check, X, Plus } from 'lucide-react';

interface RemarkRow {
  id: string;
  payment_id: string;
  author_id: string;
  author_name: string | null;
  author_role: string | null;
  remark: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  paymentId: string;
  isAdminView: boolean;
  /** Imperatively-controlled draft (for admin verify flow). Optional. */
  draft?: string;
  onDraftChange?: (val: string) => void;
}

const ADMIN_ROLES = ['super_admin', 'admin'];

export function PaymentRemarksThread({ paymentId, isAdminView, draft, onDraftChange }: Props) {
  const { user } = useAuth();
  const [remarks, setRemarks] = useState<RemarkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [internalDraft, setInternalDraft] = useState('');
  const newRemark = draft !== undefined ? draft : internalDraft;
  const setNewRemark = (v: string) => {
    if (onDraftChange) onDraftChange(v);
    else setInternalDraft(v);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_remarks' as any)
      .select('*')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      setRemarks([]);
    } else {
      setRemarks((data as any) || []);
    }
    setLoading(false);
  }, [paymentId]);

  useEffect(() => {
    if (paymentId) load();
  }, [paymentId, load]);

  const handleAdd = async () => {
    const text = newRemark.trim();
    if (!text || !user) return;
    setAdding(true);
    try {
      const { error } = await supabase.from('payment_remarks' as any).insert({
        payment_id: paymentId,
        author_id: user.id,
        author_name: user.fullName || user.email || 'Admin',
        author_role: user.role || null,
        remark: text,
      } as any);
      if (error) throw error;
      setNewRemark('');
      toast.success('Remark added.');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to add remark');
    } finally {
      setAdding(false);
    }
  };

  const handleStartEdit = (r: RemarkRow) => {
    setEditingId(r.id);
    setEditValue(r.remark);
  };

  const handleSaveEdit = async (id: string) => {
    const text = editValue.trim();
    if (!text) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('payment_remarks' as any)
        .update({ remark: text } as any)
        .eq('id', id);
      if (error) throw error;
      setEditingId(null);
      setEditValue('');
      await load();
      toast.success('Remark updated.');
    } catch (e: any) {
      toast.error(e.message || 'Failed to update remark');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this remark? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('payment_remarks' as any).delete().eq('id', id);
      if (error) throw error;
      await load();
      toast.success('Remark deleted.');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete remark');
    }
  };

  const canModify = (r: RemarkRow) =>
    !!user && (r.author_id === user.id || ADMIN_ROLES.includes(user.role || ''));

  const formatTs = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="space-y-3">
      <Label>Admin Remarks</Label>

      {isAdminView && (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <Textarea
            placeholder="Add a new remark..."
            value={newRemark}
            onChange={(e) => setNewRemark(e.target.value)}
            rows={4}
            className="min-h-[100px]"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleAdd} disabled={adding || !newRemark.trim()}>
              {adding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Add Remark
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading remarks...
          </div>
        ) : remarks.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-2">No remarks yet.</div>
        ) : (
          remarks.map((r) => (
            <div key={r.id} className="rounded-md border bg-background p-3 space-y-2">
              <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">{r.author_name || 'Admin'}</span>
                  {r.author_role && <span className="ml-1.5 capitalize">({r.author_role.replace(/_/g, ' ')})</span>}
                  <span className="mx-1.5">·</span>
                  <span>{formatTs(r.created_at)}</span>
                  {r.updated_at && r.updated_at !== r.created_at && (
                    <span className="ml-1.5 italic">(edited {formatTs(r.updated_at)})</span>
                  )}
                </div>
                {isAdminView && canModify(r) && editingId !== r.id && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleStartEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {editingId === r.id ? (
                <div className="space-y-2">
                  <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} rows={4} className="min-h-[100px]" />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditValue(''); }} disabled={savingEdit}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" onClick={() => handleSaveEdit(r.id)} disabled={savingEdit || !editValue.trim()}>
                      {savingEdit ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{r.remark}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
