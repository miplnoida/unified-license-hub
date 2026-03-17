import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Play, BarChart3, FileCheck, Users, Shield } from 'lucide-react';

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden bg-primary py-20 lg:py-28">
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.06]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left content */}
          <div className="animate-slide-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-1.5 text-xs font-medium text-primary-foreground/80 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
              Enterprise-grade regulatory platform
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-primary-foreground leading-[1.1] tracking-tight">
              Unified Regulatory Licensing &{' '}
              <span className="text-secondary">Compliance Platform</span>
            </h1>
            <p className="mt-5 text-base lg:text-lg text-primary-foreground/65 max-w-lg leading-relaxed">
              Manage applications, approvals, compliance returns, and inspections across multiple regulators in one system.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="hero" onClick={() => navigate('/register')}>
                Get Started <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button size="lg" variant="hero-outline">
                <Play className="mr-1 h-4 w-4" /> Request Demo
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-primary-foreground/50">
              <span className="flex items-center gap-1.5"><Shield className="h-4 w-4" /> SOC 2 Compliant</span>
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Multi-tenant</span>
              <span className="flex items-center gap-1.5"><FileCheck className="h-4 w-4" /> Audit-ready</span>
            </div>
          </div>

          {/* Right - Dashboard preview mock */}
          <div className="animate-slide-up delay-200 hidden lg:block">
            <div className="rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.07] backdrop-blur-sm p-4 shadow-2xl">
              <div className="rounded-xl bg-card/95 p-5 space-y-4">
                {/* Mock top bar */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="h-3 w-32 rounded bg-foreground/10" />
                    <div className="h-2 w-20 rounded bg-foreground/5" />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10" />
                    <div className="h-8 w-8 rounded-lg bg-secondary/10" />
                  </div>
                </div>
                {/* Mock stat cards */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Applications', val: '2,847', icon: FileCheck, color: 'bg-primary/10 text-primary' },
                    { label: 'Approved', val: '1,923', icon: BarChart3, color: 'bg-success/10 text-success' },
                    { label: 'Active Users', val: '486', icon: Users, color: 'bg-secondary/10 text-secondary' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-md ${s.color}`}>
                        <s.icon className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-lg font-bold text-foreground">{s.val}</p>
                      <p className="text-[11px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
                {/* Mock chart area */}
                <div className="h-28 rounded-lg border bg-muted/30 flex items-end gap-1 p-3">
                  {[40, 65, 50, 80, 60, 90, 75, 85, 70, 95, 80, 88].map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm bg-primary/20" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
