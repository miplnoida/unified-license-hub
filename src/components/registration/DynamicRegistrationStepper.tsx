import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface Props {
  steps: string[];
  currentStep: number;
  completedSteps: Set<number>;
}

export function DynamicRegistrationStepper({ steps, currentStep, completedSteps }: Props) {
  return (
    <div className="w-full">
      {/* Desktop stepper */}
      <div className="hidden md:flex items-center justify-between">
        {steps.map((label, idx) => {
          const isCompleted = completedSteps.has(idx);
          const isCurrent = idx === currentStep;

          return (
            <div key={idx} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 text-sm font-semibold',
                    isCurrent && 'border-primary bg-primary text-primary-foreground shadow-md',
                    isCompleted && !isCurrent && 'border-primary bg-primary/10 text-primary',
                    !isCurrent && !isCompleted && 'border-muted-foreground/30 text-muted-foreground',
                  )}
                >
                  {isCompleted && !isCurrent ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs font-medium transition-colors text-center max-w-[100px]',
                    isCurrent && 'text-primary',
                    isCompleted && !isCurrent && 'text-primary/80',
                    !isCurrent && !isCompleted && 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1 mx-2 mb-6 transition-colors duration-300',
                    isCompleted ? 'bg-primary' : 'bg-muted-foreground/20',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile stepper */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-sm text-muted-foreground">{steps[currentStep]}</span>
        </div>
        <div className="flex gap-1">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                idx <= currentStep ? 'bg-primary' : 'bg-muted-foreground/20',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
