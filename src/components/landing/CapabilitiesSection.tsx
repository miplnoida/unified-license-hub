import { Building2, Layers, Workflow, CreditCard } from 'lucide-react';

const capabilities = [
  {
    icon: Building2,
    title: 'Multi-Regulator Support',
    desc: 'Manage multiple regulatory bodies within a single platform instance. Each regulator gets isolated configurations, forms, workflows, and reporting.',
    bullets: ['Tenant isolation', 'Shared master data', 'Cross-regulator analytics'],
  },
  {
    icon: Layers,
    title: 'Dynamic Form Builder',
    desc: 'Design complex application forms with conditional logic, repeatable sections, and validation rules — no coding required.',
    bullets: ['Drag-and-drop editor', 'Version control', 'Field-level conditions'],
  },
  {
    icon: Workflow,
    title: 'Configurable Workflow Engine',
    desc: 'Build approval pipelines with role-based steps, SLA enforcement, delegation rules, and automated escalations.',
    bullets: ['Parallel & sequential steps', 'Auto-assignment', 'SLA alerts'],
  },
  {
    icon: CreditCard,
    title: 'Fee & Payment Management',
    desc: 'Configure fee schedules, process payments, generate receipts, and manage refunds with full financial audit trails.',
    bullets: ['Dynamic fee rules', 'Receipt generation', 'Revenue dashboards'],
  },
];

export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="py-20 lg:py-28 bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold tracking-wider uppercase text-secondary mb-2">Platform Modules</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
            Built for complex regulatory workflows
          </h2>
        </div>

        <div className="space-y-8">
          {capabilities.map((cap, i) => (
            <div
              key={cap.title}
              className={`flex flex-col ${i % 2 === 1 ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-8 lg:gap-14 items-center rounded-2xl border bg-card p-6 lg:p-10 shadow-card`}
            >
              {/* Text */}
              <div className="flex-1 space-y-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                  <cap.icon className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-foreground">{cap.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{cap.desc}</p>
                <ul className="space-y-2 pt-1">
                  {cap.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-sm text-foreground/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-secondary shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              {/* Illustration placeholder */}
              <div className="flex-1 w-full">
                <div className="rounded-xl border bg-muted/50 h-48 lg:h-56 flex items-center justify-center">
                  <cap.icon className="h-16 w-16 text-muted-foreground/20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
