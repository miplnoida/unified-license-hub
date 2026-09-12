import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { fpConditionEvidenceReview, fpConditionEvidenceSubmit } from '@/lib/fpGovernedOps';
import { Loader2, Upload, FileText, History } from 'lucide-react';

interface Props {
  conditionId: string;
  individualId: string;
}

const REVIEW_META: Record<string, string> = {
  pending: 'bg-warning/15 text-warning border-warning/30',
  accepted: 'bg-success/15 text-success border-success/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
};

/**
 * Phase 3H — condition evidence submission/review plus the immutable
 * condition history log (`fp_condition_events`, append-only in the database).
 */
export function FpConditionEvidencePanel({ conditionId, individualId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});

  const { data: evidence } = useQuery({
    queryKey: ['fp_condition_evidence', conditionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_condition_evidence')
        .select('id, file_name, file_path, description, submitted_at, review_state, review_note, reviewed_at')
        .eq('condition_id', conditionId)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: events } = useQuery({
    queryKey: ['fp_condition_events', conditionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_condition_events')
        .select('id, event_type, from_status, to_status, reason, occurred_at')
        .eq('condition_id', conditionId)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const path = `conditions/${conditionId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('fp-evidence').upload(path, file);
      if (upErr) throw upErr;

      // Governed operation — derives the regulator lens, records the submitter
      // and audits the submission.
      await fpConditionEvidenceSubmit({
        conditionId,
        filePath: path,
        fileName: file.name,
        fileSize: file.size,
        description: description.trim() || null,
      });
      toast.success('Evidence submitted for review');
      setDescription('');
      if (fileRef.current) fileRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['fp_condition_evidence', conditionId] });
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const review = useMutation({
    mutationFn: async ({ id, state }: { id: string; state: 'accepted' | 'rejected' }) => {
      const note = reviewNote[id]?.trim() ?? '';
      if (state === 'rejected' && note.length < 5) {
        throw new Error('Rejection note required (min 5 chars)');
      }
      await fpConditionEvidenceReview(id, state, note || null);
    },
    onSuccess: () => {
      toast.success('Evidence reviewed');
      qc.invalidateQueries({ queryKey: ['fp_condition_evidence', conditionId] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || 'Failed'),
  });

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from('fp-evidence').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error('Could not create download link');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1">
          <FileText className="h-3 w-3" /> Evidence
        </div>
        {(evidence ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">No evidence submitted for this condition yet.</p>
        )}
        {(evidence ?? []).map((e) => (
          <div key={e.id} className="border rounded p-2 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <button className="underline truncate text-left" onClick={() => download(e.file_path)}>
                {e.file_name}
              </button>
              <Badge variant="outline" className={REVIEW_META[e.review_state] ?? REVIEW_META.pending}>
                {e.review_state}
              </Badge>
            </div>
            <div className="text-muted-foreground">
              Submitted {new Date(e.submitted_at).toLocaleString()}
              {e.description ? ` · ${e.description}` : ''}
            </div>
            {e.review_note && <div className="italic">Review: {e.review_note}</div>}
            {e.review_state === 'pending' && (
              <div className="flex gap-2 items-end pt-1">
                <Input
                  className="h-7 text-xs"
                  placeholder="Review note…"
                  value={reviewNote[e.id] ?? ''}
                  onChange={(ev) => setReviewNote((p) => ({ ...p, [e.id]: ev.target.value }))}
                />
                <Button
                  data-rbac="fit_and_proper.edit"
                  size="sm"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ id: e.id, state: 'accepted' })}
                >
                  Accept
                </Button>
                <Button
                  data-rbac="fit_and_proper.edit"
                  size="sm"
                  variant="ghost"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ id: e.id, state: 'rejected' })}
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        ))}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            rows={1}
            className="text-xs"
            placeholder="Evidence description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Input
              ref={fileRef}
              type="file"
              className="h-8 text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1">
          <History className="h-3 w-3" /> History (append-only)
        </div>
        {(events ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">No history recorded.</p>
        )}
        {(events ?? []).map((ev) => (
          <div key={ev.id} className="text-xs text-muted-foreground">
            {new Date(ev.occurred_at).toLocaleString()} · {ev.event_type}
            {ev.from_status ? ` · ${ev.from_status} → ${ev.to_status}` : ev.to_status ? ` · ${ev.to_status}` : ''}
            {ev.reason ? ` · ${ev.reason}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default FpConditionEvidencePanel;
