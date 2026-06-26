import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface Props {
  steps: string[];
  currentStep: number;
  completedSteps: Set<number>;
  onStepClick?: (idx: number) => void;
}

export function DynamicRegistrationStepper({ steps, currentStep, completedSteps, onStepClick }: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Scroll active pill into view when step changes
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [currentStep]);

  return (
    <div className="w-full">
      {/* Desktop stepper */}
      <div className="hidden md:block">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-sm font-medium text-foreground">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-sm text-muted-foreground truncate max-w-[60%]" title={steps[currentStep]}>
            {steps[currentStep]}
          </span>
        </div>
        <div
          ref={railRef}
          className="flex items-start overflow-x-auto rounded-lg border border-border bg-muted/20 px-3 py-3 [scrollbar-width:thin]"
        >
          {steps.map((label, idx) => {
            const isCompleted = completedSteps.has(idx);
            const isCurrent = idx === currentStep;
            const isClickable = !!onStepClick && (isCompleted || idx < currentStep) && !isCurrent;

            return (
              <div key={idx} className="flex items-start shrink-0">
                <div
                  ref={isCurrent ? activeRef : undefined}
                  className="flex flex-col items-center shrink-0 w-[150px] px-1"
                >
                  <button
                    type="button"
                    onClick={isClickable ? () => onStepClick!(idx) : undefined}
                    disabled={!isClickable}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300 text-sm font-semibold',
                      isCurrent && 'border-primary bg-primary text-primary-foreground shadow-md ring-4 ring-primary/20',
                      isCompleted && !isCurrent && 'border-primary bg-primary/10 text-primary',
                      !isCurrent && !isCompleted && 'border-muted-foreground/30 text-muted-foreground bg-background',
                      isClickable && 'cursor-pointer hover:ring-2 hover:ring-primary/40',
                      !isClickable && 'cursor-default',
                    )}
                    aria-label={`Go to step ${idx + 1}: ${label}`}
                    title={label}
                  >
                    {isCompleted && !isCurrent ? <Check className="h-4 w-4" /> : idx + 1}
                  </button>
                  <span
                    className={cn(
                      'mt-2 text-xs font-medium transition-colors text-center w-full truncate px-1',
                      isCurrent && 'text-primary',
                      isCompleted && !isCurrent && 'text-primary/80',
                      !isCurrent && !isCompleted && 'text-muted-foreground',
                    )}
                    title={label}
                  >
                    {label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 w-8 mt-[18px] shrink-0 transition-colors duration-300',
                      isCompleted ? 'bg-primary' : 'bg-muted-foreground/20',
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile stepper */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-sm text-muted-foreground truncate max-w-[50%]" title={steps[currentStep]}>
            {steps[currentStep]}
          </span>
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
