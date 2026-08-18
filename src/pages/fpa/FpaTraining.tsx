import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logFpAction } from '@/lib/fpAudit';
import { Loader2, GraduationCap, CheckCircle2, ShieldAlert } from 'lucide-react';

// Step 17 of the F&P process — track-only per product decision: no other
// action in the module is gated on this. Bump this when the F&P policy
// changes materially; prior attestations stay on record against the version
// they were made under (fp_training_attestations is append-only).
const CURRENT_FP_POLICY_VERSION = '2026.1';

function fmtDateTime(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function FpaTraining() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: attestations, isLoading: loadingAttestations } = useQuery({
    queryKey: ['fp_training_attestations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_training_attestations' as any)
        .select('id, user_id, policy_version, attested_at')
        .order('attested_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; user_id: string; policy_version: string; attested_at: string }[];
    },
  });

  // Latest attestation per user, so re-attesting after a policy bump doesn't
  // hide the fact someone acknowledged an earlier version.
  const latestByUser = useMemo(() => {
    const m = new Map<string, { policy_version: string; attested_at: string }>();
    for (const a of attestations ?? []) {
      if (!m.has(a.user_id)) m.set(a.user_id, { policy_version: a.policy_version, attested_at: a.attested_at });
    }
    return m;
  }, [attestations]);

  const myAttestation = user?.id ? latestByUser.get(user.id) : undefined;
  const myAttestationCurrent = myAttestation?.policy_version === CURRENT_FP_POLICY_VERSION;

  // Committee membership is the closest thing this module has to "who acts
  // on F&P cases" — used here purely to flag attestation gaps, not to gate
  // anything.
  const { data: committeeMembers, isLoading: loadingMembers } = useQuery({
    queryKey: ['fp_committee_members_all_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_committee_members' as any)
        .select('user_id')
        .eq('is_active', true);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((m: any) => m.user_id as string)));
      return ids;
    },
  });

  const memberIds = committeeMembers ?? [];
  const { data: profiles } = useQuery({
    queryKey: ['profiles_for_fp_training', memberIds],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', memberIds);
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });
  const profileMap = useMemo(() => {
    const m = new Map<string, { full_name: string | null; email: string | null }>();
    for (const p of profiles ?? []) m.set(p.id, p);
    return m;
  }, [profiles]);

  const membersNeedingAttestation = memberIds.filter((id) => latestByUser.get(id)?.policy_version !== CURRENT_FP_POLICY_VERSION);

  const attest = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      const { data: inserted, error } = await supabase
        .from('fp_training_attestations' as any)
        .insert({ user_id: user.id, policy_version: CURRENT_FP_POLICY_VERSION })
        .select('id')
        .single();
      if (error) throw error;
      await logFpAction('fp.training.attested', 'fp_training_attestation', (inserted as any).id, {
        after: { policy_version: CURRENT_FP_POLICY_VERSION },
      });
    },
    onSuccess: () => {
      toast.success('Attestation recorded — thank you.');
      qc.invalidateQueries({ queryKey: ['fp_training_attestations'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to record attestation'),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Training & Awareness"
          description="Fit & Proper policy acknowledgement register — Step 17 of the F&P process. Tracked for audit purposes; not required to use other F&P screens."
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
              Your attestation
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              {myAttestationCurrent ? (
                <p className="text-sm flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  You acknowledged policy version {CURRENT_FP_POLICY_VERSION} on {fmtDateTime(myAttestation!.attested_at)}.
                </p>
              ) : myAttestation ? (
                <p className="text-sm flex items-center gap-2 text-amber-700">
                  <ShieldAlert className="h-4 w-4" />
                  You last acknowledged version {myAttestation.policy_version} on {fmtDateTime(myAttestation.attested_at)} — current version is {CURRENT_FP_POLICY_VERSION}.
                </p>
              ) : (
                <p className="text-sm flex items-center gap-2 text-muted-foreground">
                  <ShieldAlert className="h-4 w-4" />
                  You have not yet acknowledged the F&amp;P policy (current version {CURRENT_FP_POLICY_VERSION}).
                </p>
              )}
            </div>
            <Button
              data-rbac="fit_and_proper.create"
              onClick={() => attest.mutate()}
              disabled={attest.isPending || myAttestationCurrent}
            >
              {attest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {myAttestationCurrent ? 'Acknowledged' : 'I acknowledge the F&P policy'}
            </Button>
          </CardContent>
        </Card>

        {memberIds.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Committee members needing attestation</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              {loadingMembers ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : membersNeedingAttestation.length === 0 ? (
                <p className="text-sm text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> All active committee members are current on policy version {CURRENT_FP_POLICY_VERSION}.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {membersNeedingAttestation.map((id) => (
                    <Badge key={id} variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                      {profileMap.get(id)?.full_name || profileMap.get(id)?.email || id.slice(0, 8) + '…'}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Attestation register</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {loadingAttestations ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : !attestations || attestations.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No attestations recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Policy Version</TableHead>
                      <TableHead>Attested At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attestations.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-xs">
                          {profileMap.get(a.user_id)?.full_name || profileMap.get(a.user_id)?.email || a.user_id.slice(0, 8) + '…'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={a.policy_version === CURRENT_FP_POLICY_VERSION ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}>
                            {a.policy_version}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">{fmtDateTime(a.attested_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
