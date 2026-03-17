import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Layers, Menu, X, HelpCircle } from 'lucide-react';

const navLinks = [
  { label: 'Home', href: '#' },
  { label: 'Services', href: '#services' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'About', href: '#highlights' },
  { label: 'Contact', href: '#footer' },
];

export function LandingNav() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Layers className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-base font-bold tracking-tight text-foreground">RegPortal</span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-2">
          <a href="#footer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mr-2">
            <HelpCircle className="h-3.5 w-3.5" /> Help
          </a>
          <Button variant="outline" size="sm" onClick={() => navigate('/login')}>
            Login
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/register')}>
            Register
          </Button>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t bg-card px-4 pb-4 pt-2 space-y-1 animate-fade-in">
          {navLinks.map((l) => (
            <a key={l.label} href={l.href} onClick={() => setOpen(false)}
              className="block py-2 text-sm text-muted-foreground hover:text-foreground">
              {l.label}
            </a>
          ))}
          <div className="flex gap-2 pt-3">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate('/login')}>
              Login
            </Button>
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => navigate('/register')}>
              Register
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
