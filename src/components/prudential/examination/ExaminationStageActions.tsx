import { createContext, useContext, useState, type ReactNode } from 'react';
import { ArrowRight, Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StageActionsContextValue {
  nextStageLabel: string | null;
  advance: () => Promise<void>;
  cancel: () => Promise<void>;
  pending: boolean;
}

const StageActionsContext = createContext<StageActionsContextValue | null>(null);

export function ExaminationStageActionsProvider({
  value,
  children,
}: {
  value: StageActionsContextValue | null;
  children: ReactNode;
}) {
  return <StageActionsContext.Provider value={value}>{children}</StageActionsContext.Provider>;
}

/**
 * Renders the examination stage actions ("Move to <stage>" / "Cancel examination")
 * inside a panel footer. When `beforeAdvance` is provided, the panel's own save
 * runs first and the transition is skipped if the save fails.
 */
export function StageActions({ beforeAdvance }: { beforeAdvance?: () => Promise<unknown> }) {
  const ctx = useContext(StageActionsContext);
  const [busy, setBusy] = useState(false);
  if (!ctx) return null;

  const disabled = busy || ctx.pending;

  const onAdvance = async () => {
    setBusy(true);
    try {
      if (beforeAdvance) await beforeAdvance();
      await ctx.advance();
    } catch {
      /* errors surfaced by the underlying mutations */
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    setBusy(true);
    try {
      await ctx.cancel();
    } catch {
      /* handled upstream */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      {ctx.nextStageLabel && (
        <Button data-rbac="prudential_supervision.workflow_action" size="sm" disabled={disabled} onClick={onAdvance}>
          {disabled ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1" />}
          {beforeAdvance ? `Save & move to ${ctx.nextStageLabel}` : `Move to ${ctx.nextStageLabel}`}
        </Button>
      )}
      <Button data-rbac="prudential_supervision.workflow_action" size="sm" variant="outline" disabled={disabled} onClick={onCancel}>
        <Ban className="h-4 w-4 mr-1" />Cancel examination
      </Button>
    </div>
  );
}

export default StageActions;
