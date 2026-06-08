import { MoreVertical, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface RowAction {
  label: string;
  icon?: LucideIcon;
  onClick?: (e?: React.MouseEvent) => void;
  href?: string;
  disabled?: boolean;
  hidden?: boolean;
  destructive?: boolean;
  /** When true, renders a separator BEFORE this item */
  separator?: boolean;
}

interface RowActionsMenuProps {
  actions: RowAction[];
  label?: string;
  align?: 'start' | 'center' | 'end';
  triggerClassName?: string;
  disabled?: boolean;
  dropdownModal?: boolean;
}

export function RowActionsMenu({
  actions,
  label,
  align = 'end',
  triggerClassName,
  disabled,
  dropdownModal = true,
}: RowActionsMenuProps) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  return (
    <DropdownMenu modal={dropdownModal}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', triggerClassName)}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          aria-label="Row actions"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        {label && (
          <>
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {visible.map((action, idx) => {
          const Icon = action.icon;
          const item = (
            <DropdownMenuItem
              key={`${action.label}-${idx}`}
              disabled={action.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (action.href) {
                  window.location.assign(action.href);
                  return;
                }
                action.onClick?.(e);
              }}
              className={cn(
                'cursor-pointer',
                action.destructive && 'text-destructive focus:text-destructive focus:bg-destructive/10'
              )}
            >
              {Icon && <Icon className="h-4 w-4 mr-2" />}
              {action.label}
            </DropdownMenuItem>
          );
          if (action.separator && idx > 0) {
            return (
              <div key={`sep-wrap-${idx}`}>
                <DropdownMenuSeparator />
                {item}
              </div>
            );
          }
          return item;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default RowActionsMenu;
