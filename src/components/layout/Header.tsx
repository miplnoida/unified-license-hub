import { Bell, Search, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types/platform';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { RegulatorSwitcher } from './RegulatorSwitcher';

export function Header() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/80 backdrop-blur-md px-6">
      <div className="flex items-center gap-4">
        <RegulatorSwitcher />
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search applications, licenses..." className="pl-10 h-9 bg-muted/40 border-0 text-sm" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative h-9 w-9" onClick={() => navigate('/notifications')}>
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
        </Button>
        {user && (
          <div className="flex items-center gap-2 pl-3 border-l">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium leading-none">{user.fullName}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
