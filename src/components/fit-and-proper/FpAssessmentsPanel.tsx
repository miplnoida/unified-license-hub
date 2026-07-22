import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, FileText, Building2, Eye, Zap, RefreshCw } from 'lucide-react';
import { logFpAction } from '@/lib/fpAudit';

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800' },
  screening: { label: 'Screening', className: 'bg-amber-100 text-amber-800' },
  awaiting_committee: { label: 'Awaiting committee', className: 'bg-purple-100 text-purple-800' },
  determined: { label: 'Determined', className: 'bg-green-100 text-green-800' },
  closed: { label: 'Closed', className: 'bg-slate-100 text-slate-700' },
};

type TileType = 'initial' | 'ongoing_monitoring' | 'triggered' | 'cycle';

interface Tile {
  type: TileType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const TILES: Tile[] = [
  {
    type: 'initial',
    label: 'New Licence Application',
    description: 'Initial F&P assessment for a new licence or first appointment',
    icon: Building2,
    color: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
  },
  {
    type: 'ongoing_monitoring',
    label: 'Ongoing Monitoring',
    description: 'Periodic review of existing approved individuals',
    icon: Eye,
    color: 'border-green-200 hover:border-green-400 hover:bg-green-50',
  },
  {
    type: 'triggered',
    label: 'Ad-hoc / Triggered',
    description: 'Assessment triggered by a supervisory action, report or adverse event',
    icon: Zap,
    color: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50',
  },
  {
    type: 'cycle',
    label: 'Cycle-Based Reassessment',
    description: 'Scheduled reassessment per the individual\'s role cycle calendar',
    icon: RefreshCw,
    color: 'border-purple-200 hover:border-purple-400 hover:bg-purple-50',
  },
];

interface Props {
  individualId: string;
}

export function FpAssessmentsPanel({ individualId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedTile, setSelectedTile] = useState<TileType | null>(null);
  const [roleId, setRoleId] = useState<string>('none');
  const [regulatorId, setRegulatorId] = useState<string>('none');
  const [triggerNote, setTriggerNote] = useState('');
  const [linkedAppId, setLinkedAppId] = useState('');

  const { data: regulators = [] } = useQuery({
    queryKey: ['regulators-active-fp'],
    queryFn: async () => (await supabase.from('regulators').select('id, name').order('name')).data ?? [],
  });

  const { data: assessments, isLoading } = useQuery({
    queryKey: ['fp_assessments', individualId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, assessment_type, status, submitted_at, determined_at, created_at')
        .eq('individual_id', individualId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: roles } = useQuery({
    queryKey: ['fp_individual_roles_for_assess', individualId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individual_roles')
        .select('id, role_type, role_title, licensee_id')
        .eq('individual_id', individualId);
      if (error) throw error;
      return data ?? [];
    },
  });

  function closeDialog() {
    setSelectedTile(null);
    setRoleId('none');
    setRegulatorId('none');
    setTriggerNote('');
    setLinkedAppId('');
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedTile) throw new Error('No type selected');
      const role = roles?.find((r) => r.id === roleId);
      const extraData: Record<string, string> = {};
      if (triggerNote.trim()) extraData.trigger_note = triggerNote.trim();
      if (linkedAppId.trim()) extraData.linked_application_id = linkedAppId.trim();

      const { authorizedAction } = await import('@/lib/rbac/authorizedAction');
      await authorizedAction('fit_and_proper', 'edit', { individual_id: individualId, assessment_type: selectedTile });
      const { data, error } = await supabase
        .from('fp_assessments')

        .insert({
          individual_id: individualId,
          assessment_type: selectedTile,
          role_id: roleId === 'none' ? null : roleId,
          regulator_id: regulatorId === 'none' ? null : regulatorId,
          licensee_id: role?.licensee_id ?? null,
          created_by: user?.id,
          status: 'draft',
          declaration_data: extraData,
        })
        .select('id, individual_id, assessment_type, role_id, licensee_id, form_template_id, form_version_id, form_response_id')
        .single();
      if (error) throw error;
      if (!data.form_template_id || !data.form_version_id) {
        throw new Error('Personal Questionnaire form is not configured for Fit & Proper. Ask an admin to publish the FP PQ template before starting an assessment.');
      }
      await logFpAction('fp.assessment.created', 'fp_assessment', data.id, {
        after: {
          assessment_type: data.assessment_type,
          role_id: data.role_id,
          licensee_id: data.licensee_id,
          form_template_id: data.form_template_id,
          form_version_id: data.form_version_id,
          ...(triggerNote.trim() ? { trigger_note: triggerNote.trim() } : {}),
          ...(linkedAppId.trim() ? { linked_application_id: linkedAppId.trim() } : {}),
        },
        context: { individualId: data.individual_id, assessmentId: data.id },
      });
      return data;
    },
    onSuccess: (data) => {
      toast.success('Assessment started · PQ pinned');
      qc.invalidateQueries({ queryKey: ['fp_assessments', individualId] });
      closeDialog();
      window.location.href = `/fit-and-proper/assessments/${data.id}`;
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const activeTile = selectedTile ? TILES.find((t) => t.type === selectedTile) : null;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="text-sm font-medium">Start assessment</div>

        {/* 4-tile initiation grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.type}
                type="button"
                onClick={() => setSelectedTile(tile.type)}
                className={`text-left border-2 rounded-lg p-4 transition-colors cursor-pointer ${tile.color}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">{tile.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{tile.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Initiation dialog */}
        <Dialog open={!!selectedTile} onOpenChange={(o) => { if (!o) closeDialog(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {activeTile && <activeTile.icon className="h-5 w-5" />}
                {activeTile?.label ?? 'Start FP Assessment'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Linked role (optional)</Label>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger><SelectValue placeholder="No role link" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No role link</SelectItem>
                    {(roles ?? []).map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.role_type.replace(/_/g, ' ')}{r.role_title ? ` — ${r.role_title}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Regulator scope (optional)</Label>
                <Select value={regulatorId} onValueChange={setRegulatorId}>
                  <SelectTrigger><SelectValue placeholder="Cross-regulator (no scope)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Cross-regulator (no scope)</SelectItem>
                    {(regulators as any[]).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Type-specific fields */}
              {selectedTile === 'initial' && (
                <div>
                  <Label>Linked application ID (optional)</Label>
                  <Input
                    value={linkedAppId}
                    onChange={(e) => setLinkedAppId(e.target.value)}
                    placeholder="Application UUID from the licensing module"
                  />
                </div>
              )}
              {(selectedTile === 'initial' || selectedTile === 'triggered') && (
                <div>
                  <Label>{selectedTile === 'triggered' ? 'Trigger reason *' : 'Initiation note (optional)'}</Label>
                  <Textarea
                    value={triggerNote}
                    onChange={(e) => setTriggerNote(e.target.value)}
                    placeholder={selectedTile === 'triggered'
                      ? 'Describe the supervisory action or adverse event that triggered this assessment…'
                      : 'Any note to record with this initiation…'}
                    rows={3}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
              <Button data-rbac="fit_and_proper.create" onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assessment history */}
        {assessments && assessments.length > 0 && (
          <>
            <div className="text-sm font-medium pt-2 border-t">Assessment history</div>
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Determined</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((a: any) => {
                    const meta = STATUS_META[a.status] || STATUS_META.draft;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm capitalize">{a.assessment_type.replace(/_/g, ' ')}</TableCell>
                        <TableCell><Badge variant="outline" className={meta.className}>{meta.label}</Badge></TableCell>
                        <TableCell className="text-xs">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-xs">{a.determined_at ? new Date(a.determined_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>
                          <Link to={`/fit-and-proper/assessments/${a.id}`}>
                            <Button size="sm" variant="ghost"><FileText className="h-4 w-4 mr-1" /> Open</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </>
        )}
        {!isLoading && (!assessments || assessments.length === 0) && (
          <div className="text-center text-sm text-muted-foreground py-4">
            No assessments yet. Select a tile above to start one.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
