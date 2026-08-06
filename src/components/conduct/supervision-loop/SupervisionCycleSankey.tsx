import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from 'recharts';
import { GitBranch } from 'lucide-react';
import { buildSankeyData, STAGES, type LoopFunnel } from '@/lib/conduct/supervisionLoop';

interface Props {
  funnel: LoopFunnel;
  onStageClick: (stageKey: keyof LoopFunnel) => void;
}

const NODE_COLORS = [
  'hsl(var(--primary))', 'hsl(var(--primary))', 'hsl(var(--chart-3, var(--primary)))',
  'hsl(var(--destructive))', 'hsl(var(--success, var(--primary)))', 'hsl(var(--muted-foreground))',
  'hsl(var(--primary))', 'hsl(var(--destructive))',
];

function NodeShape(props: any) {
  const { x, y, width, height, index, payload, onStageClick } = props;
  // Eight stages sit side by side, so horizontal labels collide. Stack the
  // stage name vertically alongside its column and stagger alternate stages.
  const labelX = x + width / 2;
  const labelY = y + height + 14 + (index % 2 === 0 ? 0 : 16);
  const click = () => onStageClick?.(payload.stageKey);
  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x} y={y} width={width} height={height}
        fill={NODE_COLORS[index % NODE_COLORS.length]}
        fillOpacity={0.9}
        className="cursor-pointer"
        onClick={click}
      />
      <text
        textAnchor="middle"
        x={labelX}
        y={labelY}
        fontSize={10}
        className="fill-muted-foreground cursor-pointer"
        onClick={click}
      >
        {payload.name}
      </text>
      <text
        textAnchor="middle"
        x={labelX}
        y={labelY + 12}
        fontSize={11}
        fontWeight={600}
        className="fill-foreground cursor-pointer"
        onClick={click}
      >
        {payload.count ?? 0}
      </text>
    </Layer>
  );
}


export function SupervisionCycleSankey({ funnel, onStageClick }: Props) {
  const data = buildSankeyData(funnel);
  const hasVolume = STAGES.some((s) => (funnel[s.key] ?? 0) > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" /> Supervision Cycle Flow
          <span className="text-xs font-normal text-muted-foreground ml-2">
            Click any stage to drill into the underlying cases
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasVolume ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            No conduct activity in the selected period.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <Sankey
              data={data}
              nodeWidth={12}
              nodePadding={26}
              margin={{ top: 12, right: 180, bottom: 12, left: 12 }}
              link={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.18, fill: 'hsl(var(--primary))', fillOpacity: 0.18 }}
              node={<NodeShape onStageClick={onStageClick} />}
            >
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid hsl(var(--border))' }}
                formatter={(v: any) => [Number(v) < 1 ? 0 : v, 'Volume']}
              />
            </Sankey>
          </ResponsiveContainer>
        )}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {STAGES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onStageClick(s.key)}
              className="text-left rounded-md border border-border p-2 hover:bg-accent transition-colors"
            >
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
              <div className="text-lg font-semibold font-mono">{funnel[s.key] ?? 0}</div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
