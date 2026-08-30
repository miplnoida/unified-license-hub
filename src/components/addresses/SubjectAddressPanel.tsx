/**
 * F8A-B4 — shared address panel for any canonical subject (regulated entity,
 * establishment or canonical person).
 *
 * Both the entity profile and Person 360 consume THIS component, so there is a
 * single address implementation. Reads use the RLS-governed `address_usages`
 * relation of the canonical primitive; mutations only ever call the governed
 * `address_usage_approve` / `address_usage_end` RPCs. No direct table DML, no
 * normalization and no identity resolution happens here.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  useSubjectAddressUsages, useApproveAddressUsage, useEndAddressUsage,
  type SubjectAddressUsage,
} from '@/hooks/useAddressIntelligence';
import { B4Empty, B4ErrorNotice, B4Loading, B4_INTELLIGENCE_CAVEAT } from './B4StateNotice';

export function usageState(u: SubjectAddressUsage | { approval_status: string; effective_to: string | null }) {
  if (u.approval_status === 'PROPOSED') return { label: 'Proposed', variant: 'outline' as const };
  if (u.approval_status === 'REJECTED') return { label: 'Rejected', variant: 'destructive' as const };
  if (u.effective_to) return { label: 'Historical', variant: 'secondary' as const };
  return { label: 'Approved (current)', variant: 'default' as const };
}

export function formatAddress(a: {
  street_line1: string; street_line2?: string | null; unit?: string | null;
  locality?: string | null; admin_area?: string | null; postal_code?: string | null; country_code: string;
} | null | undefined) {
  if (!a) return '—';
  return [a.unit, a.street_line1, a.street_line2, a.locality, a.admin_area, a.postal_code, a.country_code]
    .filter(Boolean).join(', ');
}

interface Props {
  subjectKind: 'ENTITY' | 'PERSON' | 'ESTABLISHMENT';
  subjectId: string;
  title?: string;
}

export function SubjectAddressPanel({ subjectKind, subjectId, title = 'Addresses & co-location' }: Props) {
  const { data, isLoading, error } = useSubjectAddressUsages(subjectKind, subjectId);
  const approve = useApproveAddressUsage();
  const end = useEndAddressUsage();
  const [showHistory, setShowHistory] = useState(false);

  const { current, historical } = useMemo(() => {
    const rows = data ?? [];
    return {
      current: rows.filter((r) => !r.effective_to),
      historical: rows.filter((r) => !!r.effective_to),
    };
  }, [data]);

  const onApprove = async (usageId: string) => {
    try {
      await approve.mutateAsync({ usageId, verify: false });
      toast.success('Address usage approved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approval rejected');
    }
  };

  const onEnd = async (usageId: string) => {
    try {
      await end.mutateAsync({ usageId, effectiveTo: new Date().toISOString().slice(0, 10) });
      toast.success('Address usage ended');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not end this usage');
    }
  };

  const rows = showHistory ? [...current, ...historical] : current;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4" aria-hidden /> {title}
        </CardTitle>
        {historical.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Current only' : `Include ${historical.length} historical`}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <B4Loading />
        ) : error ? (
          <B4ErrorNotice error={error} />
        ) : rows.length === 0 ? (
          <B4Empty
            title="No canonical address usage recorded"
            body="No approved or proposed address usage exists for this subject in the canonical address register."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => {
                  const st = usageState(u);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <Link className="text-primary underline" to={`/intelligence/addresses/${u.address_id}`}>
                          {formatAddress(u.addresses)}
                        </Link>
                      </TableCell>
                      <TableCell>{u.usage_type}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                      <TableCell>{u.effective_from}</TableCell>
                      <TableCell>{u.effective_to ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.source_kind}
                        {u.source_detail ? ` — ${u.source_detail}` : ''}
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        {u.approval_status === 'PROPOSED' && (
                          <GuardedButton
                            module="entity_structure"
                            action="approve"
                            data-rbac="entity_structure.approve"
                            size="sm"
                            variant="outline"
                            disabled={approve.isPending}
                            onClick={() => onApprove(u.id)}
                          >
                            Approve
                          </GuardedButton>
                        )}
                        {u.approval_status === 'APPROVED' && !u.effective_to && (
                          <GuardedButton
                            module="entity_structure"
                            action="apply"
                            data-rbac="entity_structure.apply"
                            size="sm"
                            variant="ghost"
                            disabled={end.isPending}
                            onClick={() => onEnd(u.id)}
                          >
                            End usage
                          </GuardedButton>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">{B4_INTELLIGENCE_CAVEAT}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default SubjectAddressPanel;
