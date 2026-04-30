import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, GitCompareArrows } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useMyReturns, useReturnsVersionMap } from '@/hooks/useReturnsManagement';
import { SubmissionCompareDialog } from './SubmissionCompareDialog';

interface CompareReturnsPickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The "left" return (current return being viewed). */
  leftReturnId: string;
  leftReturnLabel: string;
  /** The form template id we'll compare on. */
  templateId: string;
  /** Required: form_id key used inside return_form_data. */
  formId: string;
  formName?: string;
}

export function CompareReturnsPicker({ open, onOpenChange, leftReturnId, leftReturnLabel, templateId, formId, formName }: CompareReturnsPickerProps) {
  const { data: myReturns = [] } = useMyReturns();
  const [rightReturnId, setRightReturnId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [leftData, setLeftData] = useState<{ data: Record<string, any>; versionId: string | null } | null>(null);
  const [rightData, setRightData] = useState<{ data: Record<string, any>; versionId: string | null; label: string } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  // Eligible: any other submitted/validated/tbr return that has data for this form_id
  const candidates = useMemo(
    () => myReturns.filter((r: any) => r.id !== leftReturnId && ['SUB', 'VAL', 'TBR'].includes(r.workflow_status)),
    [myReturns, leftReturnId],
  );

  const fetchFormData = async (returnId: string) => {
    const { data } = await supabase
      .from('return_form_data')
      .select('field_name, field_value, form_version_id')
      .eq('return_id', returnId)
      .eq('form_id', formId);
    const dataMap: Record<string, any> = {};
    let versionId: string | null = null;
    for (const row of (data || []) as any[]) {
      let val: any = row.field_value ?? '';
      if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
        try { val = JSON.parse(val); } catch { /* keep */ }
      }
      dataMap[row.field_name] = val;
      if (row.form_version_id) versionId = row.form_version_id;
    }
    return { data: dataMap, versionId };
  };

  const handleCompare = async () => {
    if (!rightReturnId) return;
    setLoading(true);
    const [l, r] = await Promise.all([fetchFormData(leftReturnId), fetchFormData(rightReturnId)]);
    setLeftData(l);
    const rightLabel = (candidates.find(c => c.id === rightReturnId) as any)?.unique_id || rightReturnId.slice(0, 8);
    setRightData({ ...r, label: rightLabel });
    setLoading(false);
    setCompareOpen(true);
  };

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setRightReturnId('');
      setLeftData(null);
      setRightData(null);
    }
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompareArrows className="h-5 w-5" /> Compare submissions
            </DialogTitle>
            <DialogDescription>
              Compare this submission ({leftReturnLabel}) against another of your returns.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Compare with</label>
            <Select value={rightReturnId} onValueChange={setRightReturnId}>
              <SelectTrigger><SelectValue placeholder="Select a submitted return" /></SelectTrigger>
              <SelectContent>
                {candidates.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-2">No other submitted returns available.</div>
                ) : candidates.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.unique_id} — {c.return_period} {c.return_year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCompare} disabled={!rightReturnId || loading}>
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…</> : 'Compare'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {leftData && rightData && (
        <SubmissionCompareDialog
          open={compareOpen}
          onOpenChange={(v) => { setCompareOpen(v); if (!v) onOpenChange(false); }}
          formName={formName}
          left={{ id: leftReturnId, label: leftReturnLabel, versionId: leftData.versionId, data: leftData.data }}
          right={{ id: rightData.label, label: rightData.label, versionId: rightData.versionId, data: rightData.data }}
        />
      )}
    </>
  );
}
