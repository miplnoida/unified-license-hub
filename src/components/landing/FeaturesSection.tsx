import { useNavigate } from 'react-router-dom';
import { FileText, Search, ClipboardList, CreditCard, AlertTriangle, BarChart3 } from 'lucide-react';

const services = [
  { icon: FileText, label: 'Apply for License', href: '/register' },
  { icon: Search, label: 'Track Application', href: '/login' },
  { icon: ClipboardList, label: 'Submit Returns', href: '/login' },
  { icon: CreditCard, label: 'Make Payment', href: '/login' },
  { icon: AlertTriangle, label: 'Lodge Complaint', href: '/login' },
  { icon: BarChart3, label: 'View Reports', href: '/login' },
];

export function FeaturesSection() {
  const navigate = useNavigate();

  return (
    <section id="services" className="py-14 lg:py-20 bg-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-xl lg:text-2xl font-bold text-foreground">Quick Access Services</h2>
          <p className="mt-2 text-sm text-muted-foreground">Select a service to get started</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {services.map((s) => (
            <button
              key={s.label}
              onClick={() => navigate(s.href)}
              className="group flex flex-col items-center gap-3 rounded-xl border bg-card p-5 text-center shadow-card hover:shadow-card-hover hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/8 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">
                <s.icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-foreground">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
