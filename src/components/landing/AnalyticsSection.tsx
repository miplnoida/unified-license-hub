import { Building2, Workflow, Upload, Eye } from 'lucide-react';

const highlights = [
  { icon: Building2, text: 'Multi-regulator support — manage multiple regulatory bodies in one system' },
  { icon: Workflow, text: 'Online approval workflow with SLA tracking and escalation' },
  { icon: Upload, text: 'Secure document upload with encrypted storage and virus scanning' },
  { icon: Eye, text: 'Transparent application tracking from submission to approval' },
];

export function AnalyticsSection() {
  return (
    <section id="highlights" className="py-14 lg:py-20 bg-background">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-xl lg:text-2xl font-bold text-foreground">Platform Highlights</h2>
          <p className="mt-2 text-sm text-muted-foreground">Key features of the regulatory platform</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {highlights.map((h) => (
            <div key={h.text} className="flex items-start gap-3 rounded-lg border bg-card p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary/10 text-secondary">
                <h.icon className="h-4 w-4" />
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed pt-1">{h.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
