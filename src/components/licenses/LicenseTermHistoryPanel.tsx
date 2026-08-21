/**
 * P04 A.4 — licence term history.
 *
 * Renders the append-only `license_terms` ledger: original issue term plus
 * every renewal / variation / reinstatement term, its effective period, the
 * decision that created it and its supersession state. Read-only: terms are
 * written by governed lifecycle operations only.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, History } from 'lucide-react';
import { useLicenseTerms, useLicenseLifecycleConfig } from '@/hooks/useLicenseTerms';
import { useUserDisplayNames } from '@/hooks/useUserDisplayNames';

const KIND_LABEL: Record<string, string> = {
  original: 'Original issue',
  renewal: 'Renewal',
  variation: 'Variation',
  reinstatement: 'Reinstatement',
};

function fmt(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export default function LicenseTermHistoryPanel({ licenseId }: { licenseId: string }) {
  const { data: terms = [], isLoading } = useLicenseTerms(licenseId);
  const { data: config } = useLicenseLifecycleConfig(licenseId, 'renewal');
  const actorIds = terms.map((t) => t.decision_actor).filter((v): v is string => !!v);
  const { data: names = {} } = useUserDisplayNames(actorIds);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5 text-primary" />
          Licence Term History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {config && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Renewal cycle</p>
              <p className="font-medium">{config.renewal_cycle ?? config.cycle_type ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Term length</p>
              <p className="font-medium">{config.period_days} days</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Renewal window</p>
              <p className="font-medium">{config.renewal_window_days} days before expiry</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Grace period</p>
              <p className="font-medium">{config.grace_period_days} days</p>
            </div>
            <div className="col-span-2 md:col-span-4 text-xs text-muted-foreground">
              Policy source: {config.source === 'license_lifecycle_configs' ? 'licence lifecycle configuration' : 'platform default'}
              {config.fee_required ? ' · renewal fee required' : ''}
              {config.verification_required ? ' · verification step required' : ''}
              {config.fp_required ? ' · fit & proper reassessment required' : ''}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : terms.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No term history recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Term</TableHead>
                  <TableHead>Basis</TableHead>
                  <TableHead>Effective from</TableHead>
                  <TableHead>Effective until</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Decided by</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terms.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono">#{t.term_number}</TableCell>
                    <TableCell>{KIND_LABEL[t.term_kind] ?? t.term_kind}</TableCell>
                    <TableCell>{fmt(t.effective_from)}</TableCell>
                    <TableCell>{t.effective_until ? fmt(t.effective_until) : 'No expiry'}</TableCell>
                    <TableCell className="text-sm">{t.source_decision ?? '—'}</TableCell>
                    <TableCell className="text-sm">
                      {t.decision_actor ? (names[t.decision_actor] ?? 'Officer') : '—'}
                      {t.decision_at ? <span className="block text-xs text-muted-foreground">{fmt(t.decision_at)}</span> : null}
                    </TableCell>
                    <TableCell className="text-sm">{Array.isArray(t.conditions_snapshot) ? t.conditions_snapshot.length : 0}</TableCell>
                    <TableCell>
                      {t.is_current ? (
                        <Badge variant="default">Current</Badge>
                      ) : (
                        <Badge variant="secondary">Superseded{t.superseded_at ? ` ${fmt(t.superseded_at)}` : ''}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
