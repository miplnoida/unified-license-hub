import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

export function AgingBuckets({ data }: { data: { bucket: string; count: number }[] }) {
  const colors = ['hsl(var(--primary))', '#f59e0b', '#f97316', '#dc2626'];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Aging distribution</CardTitle></CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer>
          <BarChart data={data}>
            <XAxis dataKey="bucket" fontSize={12} />
            <YAxis fontSize={12} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={colors[i] ?? colors[0]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
