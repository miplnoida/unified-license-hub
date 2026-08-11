import { createContext, useContext, useState, type ReactNode } from 'react';
import { ArrowRight, Ban, CheckCircle2, Circle, Loader2, MoreHorizontal, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { BlockerSection } from '@/lib/examinationWorkflow';

interface StageActionsContextValue {
  /** Business-language label for the forward action, e.g. "Start fieldwork". */
  nextActionLabel: string | null;
  /** Mandatory prerequisites that must clear before the transition is allowed. */
  transitionBlockers?: { text: string; section?: BlockerSection }[];
  advance: () => Promise<void>;
  cancel: () => Promise<void>;
  pending: boolean;
  /** Opens a supporting section as a temporary detour from the current step. */
  onOpenSection?: (section: BlockerSection) => void;
}

const StageActionsContext = createContext<StageActionsContextValue | null>(null);

export type StageActionsMode = 'current-step' | 'supporting';

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
 * Panel footer actions.
 *
 * `mode="current-step"` is the only place the global examination lifecycle can
 * be advanced — supporting/advanced tabs render `mode="supporting"` and expose
 * their own local save plus panel actions only. Mandatory prerequisites disable
 * the progression action; the database guards remain the ultimate authority.
 */
export function StageActions({
  beforeAdvance,
  mode = 'supporting',
  children,
}: {
  beforeAdvance?: () => Promise<unknown>;
  mode?: StageActionsMode;
  children?: ReactNode;
}) {
  const ctx = useContext(StageActionsContext);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isCurrentStep = mode === 'current-step' && !!ctx;
  const blockers = (isCurrentStep && ctx?.transitionBlockers) || [];
  const blocked = blockers.length > 0;
  const disabled = busy || !!ctx?.pending;

  // Supporting sections: local save + panel actions only.
  if (!isCurrentStep) {
    if (!beforeAdvance && !children) return null;
    return (
      <div className="border-t pt-3 flex flex-wrap items-center gap-2">
        {beforeAdvance && (
          <Button data-rbac="prudential_supervision.edit" size="sm" disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await beforeAdvance(); } catch { /* handled upstream */ } finally { setBusy(false); }
            }}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        )}
        {children}
      </div>
    );
  }

  const onAdvance = async () => {
    setBusy(true);
    try {
      if (beforeAdvance) await beforeAdvance();
      await ctx!.advance();
    } catch {
      /* errors surfaced by the underlying mutations */
    } finally {
      setBusy(false);
    }
  };

  const onSaveOnly = async () => {
    if (!beforeAdvance) return;
    setBusy(true);
    try {
      await beforeAdvance();
    } catch {
      /* handled upstream */
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    setBusy(true);
    try {
      await ctx!.cancel();
    } catch {
      /* handled upstream */
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  return (
    <div className="border-t pt-3 space-y-3">
      {ctx!.nextActionLabel && (
        blocked ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 space-y-2">
            <p className="text-xs font-medium text-warning">
              Before you can {ctx!.nextActionLabel.toLowerCase()}:
            </p>
            <ul className="space-y-1.5">
              {blockers.map(b => (
                <li key={b.text} className="flex flex-wrap items-center justify-between gap-2 text-xs text-warning/90">
                  <span className="flex items-start gap-1.5">
                    <Circle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {b.text}
                  </span>
                  {b.section && ctx!.onOpenSection && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs"
                      onClick={() => ctx!.onOpenSection?.(b.section!)}>
                      Resolve
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />All prerequisites complete
          </p>
        )
      )}

      <div className="flex flex-wrap items-center gap-2">
        {ctx!.nextActionLabel ? (
          <>
            {beforeAdvance && (
              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline"
                disabled={disabled} onClick={onSaveOnly}>
                <Save className="h-4 w-4 mr-1" />Save
              </Button>
            )}
            <Button
              data-rbac="prudential_supervision.workflow_action"
              size="sm"
              disabled={disabled || blocked}
              title={blocked ? 'Resolve the outstanding prerequisites first' : undefined}
              onClick={onAdvance}
            >
              {disabled ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1" />}
              {ctx!.nextActionLabel}
            </Button>
          </>
        ) : beforeAdvance ? (
          <Button data-rbac="prudential_supervision.edit" size="sm" disabled={disabled} onClick={onSaveOnly}>
            {disabled ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        ) : null}
        {children}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="ml-auto" disabled={disabled}>
              <MoreHorizontal className="h-4 w-4 mr-1" />More actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              data-rbac="prudential_supervision.workflow_action"
              className="text-destructive focus:text-destructive"
              onSelect={e => { e.preventDefault(); setConfirmCancel(true); }}
            >
              <Ban className="h-4 w-4 mr-2" />Cancel examination
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this examination?</AlertDialogTitle>
              <AlertDialogDescription>
                Cancelling ends the examination workflow. No further stages can be completed and every
                section becomes read-only. Records already captured are retained for audit purposes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Keep examination open</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={e => { e.preventDefault(); onCancel(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Cancel examination
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
