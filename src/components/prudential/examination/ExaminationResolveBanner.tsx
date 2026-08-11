import { ArrowLeft, CheckCircle2, CornerUpLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shown when the user reached a supporting section from Current step in order to
 * clear a prerequisite. The examination stage is untouched by this detour.
 */
export function ExaminationResolveBanner({
  currentStepTitle,
  cleared,
  clearedMessage,
  onReturn,
}: {
  currentStepTitle: string;
  cleared: boolean;
  clearedMessage: string;
  onReturn: () => void;
}) {
  return (
    <div
      className={`mb-4 rounded-md border p-3 flex flex-wrap items-center justify-between gap-2 ${
        cleared ? 'border-emerald-200 bg-emerald-500/10' : 'border-primary/30 bg-primary/5'
      }`}
    >
      <p className={`flex items-center gap-1.5 text-sm ${cleared ? 'text-emerald-700' : 'text-foreground'}`}>
        {cleared ? <CheckCircle2 className="h-4 w-4" /> : <CornerUpLeft className="h-4 w-4" />}
        {cleared ? clearedMessage : `Resolving a prerequisite for: ${currentStepTitle}`}
      </p>
      <Button size="sm" variant={cleared ? 'default' : 'outline'} onClick={onReturn}>
        <ArrowLeft className="h-4 w-4 mr-1" />Return to current step
      </Button>
    </div>
  );
}

export default ExaminationResolveBanner;
