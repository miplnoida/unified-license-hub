import { FileText, ClipboardList, Workflow, BarChart3, Search, ShieldCheck } from 'lucide-react';

const features = [
  { icon: FileText, title: 'License Management', desc: 'End-to-end license application processing with multi-stage approvals.' },
  { icon: ClipboardList, title: 'Compliance Returns', desc: 'Automated periodic return filing, tracking, and deadline management.' },
  { icon: Workflow, title: 'Workflow Automation', desc: 'Configurable approval workflows with SLA tracking and escalation.' },
  { icon: BarChart3, title: 'Reporting & Analytics', desc: 'Real-time dashboards with exportable reports and trend analysis.' },
  { icon: Search, title: 'Inspection Management', desc: 'Schedule, assign, and track field inspections with digital checklists.' },
  { icon: ShieldCheck, title: 'Secure Document Handling', desc: 'Encrypted document storage with version control and audit trails.' },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 lg:py-28 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold tracking-wider uppercase text-secondary mb-2">Core Features</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
            Everything you need to regulate effectively
          </h2>
          <p className="mt-4 text-muted-foreground">
            A comprehensive suite of tools designed for regulatory bodies to streamline licensing, compliance, and oversight.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border bg-card p-6 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/8 text-primary mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
