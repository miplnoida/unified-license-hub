import { Shield, ScrollText, Lock } from 'lucide-react';

const trustItems = [
  { icon: Shield, title: 'Role-Based Access Control', desc: 'Granular permissions with hierarchical role management ensuring least-privilege access across all operations.' },
  { icon: ScrollText, title: 'Complete Audit Logs', desc: 'Every action is recorded with timestamps, user identity, and change details for full regulatory accountability.' },
  { icon: Lock, title: 'File & Data Security', desc: 'Encrypted storage, virus scanning, and access-controlled document handling to protect sensitive regulatory data.' },
];

export function TrustSection() {
  return (
    <section className="py-20 lg:py-28 bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-sm font-semibold tracking-wider uppercase text-secondary mb-2">Security & Compliance</p>
        <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
          Secure & Compliant Platform
        </h2>
        <p className="text-primary-foreground/60 max-w-xl mx-auto mb-12">
          Built with enterprise-grade security to meet the stringent requirements of government and regulatory bodies.
        </p>

        <div className="grid sm:grid-cols-3 gap-6">
          {trustItems.map((t) => (
            <div key={t.title} className="rounded-xl border border-primary-foreground/10 bg-primary-foreground/[0.06] p-6 text-left">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary/20 text-secondary mb-4">
                <t.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-primary-foreground mb-2">{t.title}</h3>
              <p className="text-sm text-primary-foreground/55 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
