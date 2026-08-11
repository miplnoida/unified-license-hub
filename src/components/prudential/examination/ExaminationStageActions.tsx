import { createContext, useContext, useState, type ReactNode } from 'react';
import { ArrowRight, Ban, Loader2, MoreHorizontal, Save } from 'lucide-react';
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

interface StageActionsContextValue {
  /** Business-language label for the forward action, e.g. "Start fieldwork". */
  nextActionLabel: string | null;
  /** Plain-language reasons the next transition would be rejected by the database guards. */
  blockers?: { text: string }[];
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
 * Renders the single primary progression action for a panel footer.
 * When `beforeAdvance` is provided, the panel's own save runs first and the
 * transition is skipped if the save fails. Cancelling the examination is a
 * rare, high-impact action so it sits under "More actions" with a confirmation.
 */
export function StageActions({
  beforeAdvance,
  children,
}: {
  beforeAdvance?: () => Promise<unknown>;
  children?: ReactNode;
}) {
  const ctx = useContext(StageActionsContext);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
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
      await ctx.cancel();
    } catch {
      /* handled upstream */
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  const blockers = ctx.blockers ?? [];

  return (
    <div className="border-t pt-3 space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      {ctx.nextActionLabel ? (
        <Button data-rbac="prudential_supervision.workflow_action" size="sm" disabled={disabled} onClick={onAdvance}>
          {disabled ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1" />}
          {ctx.nextActionLabel}
        </Button>
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

      {ctx.nextActionLabel && blockers.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-2">
          <p className="text-xs font-medium text-warning">Why this may be blocked</p>
          <ul className="list-disc pl-4 text-xs text-warning/90">
            {blockers.map(b => <li key={b.text}>{b.text}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}