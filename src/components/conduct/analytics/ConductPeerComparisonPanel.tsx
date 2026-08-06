import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { comparePeers, entityMetrics, PEER_METRICS, type AlertRow, type ComplaintRow } from '@/lib/conduct/analytics';

export interface PeerLicensee {
  id: string;
  name: string;
  sector_id?: string | null;
  sub_sector_id?: string | null;
}

interface Props {
  complaints: ComplaintRow[];
  alerts: AlertRow[];
  licensees: PeerLicensee[];
  entityId: string;
  onEntityChange: (id: string) => void;
}

export function ConductPeerComparisonPanel({ complaints, alerts, licensees, entityId, onEntityChange }: Props) {
  const [basis, setBasis] = useState<'sub_sector' | 'sector'>('sub_sector');

  const entity = licensees.find((l) => l.id === entityId);

  const peers = useMemo(() => {
    if (!entity) return [];
    return licensees.filter((l) => {
      if (l.id === entity.id) return false;
      if (basis === 'sub_sector' && entity.sub_sector_id) return l.sub_sector_id === entity.sub_sector_id;
      if (entity.sector_id) return l.sector_id === entity.sector_id;
      return false;
    });
  }, [licensees, entity, basis]);

  const entityStats = useMemo(
    () => (entity ? entityMetrics(entity.id, complaints, alerts) : null),
    [entity, complaints, alerts],
  );
  const peerStats = useMemo(
    () => peers.map((p) => ({ licensee: p, stats: entityMetrics(p.id, complaints, alerts) })),
    [peers, complaints, alerts],
  );
  const comparison = useMemo(
    () => (entityStats ? comparePeers(entityStats, peerStats.map((p) => p.stats)) : []),
    [entityStats, peerStats],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Entity</div>
            <Select value={entityId || 'none'} onValueChange={(v) => onEntityChange(v === 'none' ? '' : v)}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Select an entity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select an entity…</SelectItem>
                {licensees.slice(0, 300).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Peer basis</div>
            <Select value={basis} onValueChange={(v) => setBasis(v as any)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sub_sector">Same sub-sector</SelectItem>
                <SelectItem value="sector">Same sector</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            Peer set: <span className="font-medium text-foreground">{peers.length}</span> licensee{peers.length === 1 ? '' : 's'} in scope
          </div>
        </CardContent>
      </Card>

      {!entity ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Select an entity to compare against its peer set.</CardContent></Card>
      ) : peers.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          No peers found for {entity.name} on this basis. Try comparing at sector level.
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{entity.name} vs peers</CardTitle>
              <p className="text-xs text-muted-foreground">Percentile shows where the entity sits within the peer distribution — higher means more adverse.</p>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {comparison.map((m) => {
                const adverse = m.entityValue > m.p75;
                return (
                  <div key={m.key} className={`rounded-md border p-3 ${adverse ? 'border-destructive/60 bg-destructive/5' : ''}`}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                      <Badge variant={adverse ? 'destructive' : 'secondary'}>{m.percentile}th pct</Badge>
                    </div>
                    <div className="text-2xl font-semibold mt-1">{m.entityValue}{m.suffix}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Peer median {m.median}{m.suffix} · p75 {m.p75}{m.suffix} · p90 {m.p90}{m.suffix}
                    </div>
                    <div className="mt-2 h-1.5 rounded bg-muted overflow-hidden">
                      <div
                        className={`h-full ${adverse ? 'bg-destructive' : 'bg-primary'}`}
                        style={{ width: `${Math.min(100, Math.max(2, m.percentile))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Peer table</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Licensee</TableHead>
                    {PEER_METRICS.map((m) => <TableHead key={m.key} className="text-right text-xs">{m.label}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    <TableRow className="bg-primary/5">
                      <TableCell className="font-semibold">{entity.name} (selected)</TableCell>
                      {PEER_METRICS.map((m) => (
                        <TableCell key={m.key} className="text-right font-semibold">
                          {entityStats ? (entityStats as any)[m.key] : 0}{m.suffix}
                        </TableCell>
                      ))}
                    </TableRow>
                    {peerStats
                      .sort((a, b) => b.stats.complaints - a.stats.complaints)
                      .slice(0, 25)
                      .map(({ licensee, stats }) => (
                        <TableRow key={licensee.id}>
                          <TableCell>{licensee.name}</TableCell>
                          {PEER_METRICS.map((m) => (
                            <TableCell key={m.key} className="text-right">{(stats as any)[m.key]}{m.suffix}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
