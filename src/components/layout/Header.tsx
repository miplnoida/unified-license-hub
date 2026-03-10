import { Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types/platform';
import { useNavigate } from 'react-router-dom';

export function Header() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search..." className="pl-10 bg-muted/50" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {user ? ROLE_LABELS[user.role] : ''}
        </span>
        <Button variant="ghost" size="icon" className="relative" onClick={() => navigate('/notifications')}>
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
