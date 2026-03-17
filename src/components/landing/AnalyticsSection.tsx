import { TrendingUp, DollarSign, ShieldCheck, BarChart3 } from 'lucide-react';

const bullets = [
  { icon: TrendingUp, text: 'Real-time insights across all regulatory operations' },
  { icon: DollarSign, text: 'Revenue tracking with fee collection dashboards' },
  { icon: ShieldCheck, text: 'Compliance monitoring with automated alerts' },
  { icon: BarChart3, text: 'Custom report builder with scheduled exports' },
];

export function AnalyticsSection() {
  return (
    <section id="analytics" className="py-20 lg:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Dashboard preview mock */}
          <div className="order-2 lg:order-1">
            <div className="rounded-2xl border bg-card p-5 shadow-card space-y-4">
              {/* Mini stat row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Revenue', val: '$1.2M', color: 'text-success' },
                  { label: 'Compliance', val: '94.7%', color: 'text-secondary' },
                  { label: 'Pending', val: '127', color: 'text-warning' },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              {/* Mock chart */}
              <div className="h-40 rounded-lg border bg-muted/20 flex items-end gap-1.5 p-4">
                {[35, 55, 45, 70, 60, 85, 75, 90, 65, 80, 70, 92].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-primary/25 transition-all" style={{ height: `${h}%` }} />
                ))}
              </div>
              {/* Mock table rows */}
              <div className="space-y-2">
                {[1, 2, 3].map((r) => (
                  <div key={r} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2.5">
                    <div className="h-3 w-3 rounded-full bg-secondary/30" />
                    <div className="h-2.5 flex-1 rounded bg-foreground/5" />
                    <div className="h-2.5 w-16 rounded bg-foreground/5" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Text */}
          <div className="order-1 lg:order-2 space-y-6">
            <p className="text-sm font-semibold tracking-wider uppercase text-secondary">Analytics & Reporting</p>
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight leading-tight">
              Data-driven regulatory oversight
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Gain comprehensive visibility into licensing pipelines, compliance rates, and revenue metrics with powerful, customizable dashboards.
            </p>
            <ul className="space-y-4 pt-2">
              {bullets.map((b) => (
                <li key={b.text} className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                    <b.icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-foreground/85 pt-1.5">{b.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
