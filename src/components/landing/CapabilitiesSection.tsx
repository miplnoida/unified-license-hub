import { UserPlus, FileText, CreditCard, CheckCircle2, ArrowRight } from 'lucide-react';

const steps = [
  { icon: UserPlus, label: 'Register Account', num: '1' },
  { icon: FileText, label: 'Fill Application', num: '2' },
  { icon: CreditCard, label: 'Pay Fees', num: '3' },
  { icon: CheckCircle2, label: 'Get Approval', num: '4' },
];

export function CapabilitiesSection() {
  return (
    <section id="how-it-works" className="py-14 lg:py-20 bg-muted/40">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-xl lg:text-2xl font-bold text-foreground">How It Works</h2>
          <p className="mt-2 text-sm text-muted-foreground">Simple 4-step process to obtain your license</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0">
          {steps.map((step, i) => (
            <div key={step.num} className="flex items-center">
              <div className="flex flex-col items-center text-center w-36">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground mb-3">
                  <step.icon className="h-6 w-6" />
                </div>
                <span className="text-xs font-bold text-primary mb-0.5">Step {step.num}</span>
                <span className="text-sm font-medium text-foreground">{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="h-5 w-5 text-muted-foreground/40 hidden sm:block mx-2" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
