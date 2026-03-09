import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Layers,
  ArrowRight,
  Mail,
  Lock,
  Shield,
  FileText,
  ClipboardList,
  Building2,
} from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

const loginTabs: { value: string; label: string; roles: UserRole[]; useSupabase: boolean }[] = [
  { value: 'pre_licensee', label: 'Pre-Licensee', roles: ['pre_licensee'], useSupabase: false },
  { value: 'post_licensee', label: 'Post-Licensee', roles: ['post_licensee'], useSupabase: true },
  { value: 'staff', label: 'AFSC Staff', roles: ['admin', 'reviewer', 'approver', 'supervisor'], useSupabase: false },
];

const features = [
  { icon: <FileText className="h-5 w-5" />, text: 'License Applications' },
  { icon: <ClipboardList className="h-5 w-5" />, text: 'Return Management' },
  { icon: <Shield className="h-5 w-5" />, text: 'Secure & Compliant' },
  { icon: <Building2 className="h-5 w-5" />, text: 'Multi-Sector Support' },
];

export default function Index() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pre_licensee');

  if (isAuthenticated) {
    navigate('/dashboard');
    return null;
  }

  const currentTab = loginTabs.find(t => t.value === activeTab)!;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    setLoading(true);

    if (currentTab.useSupabase) {
      // Real Supabase auth for post-licensees
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Login successful');
      navigate('/dashboard');
    } else {
      // Mock login for demo (pre-licensee & staff)
      setLoading(false);
      const role = currentTab.roles[0]; // default role
      login(role);
      toast.success('Login successful');
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left Panel - Branding */}
      <div className="hero-gradient relative flex flex-col justify-between p-8 lg:p-12 lg:w-[45%] xl:w-[40%] min-h-[280px] lg:min-h-screen">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iMiIvPjwvZz48L3N2Zz4=')] opacity-20" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
              <Layers className="h-6 w-6 text-secondary-foreground" />
            </div>
            <span className="text-xl font-bold text-primary-foreground">ARIAS</span>
          </div>

          <h1 className="text-3xl lg:text-4xl xl:text-5xl font-bold text-primary-foreground leading-tight">
            Automated Regulatory &{' '}
            <span className="text-secondary">Integrated Application System</span>
          </h1>

          <p className="mt-4 text-primary-foreground/70 max-w-lg text-sm lg:text-base">
            A unified platform for license management, regulatory compliance,
            and seamless interaction with AFSC regulatory authorities.
          </p>
        </div>

        {/* Feature pills */}
        <div className="relative z-10 mt-8 lg:mt-0">
          <div className="flex flex-wrap gap-3">
            {features.map((f) => (
              <div
                key={f.text}
                className="flex items-center gap-2 rounded-full bg-primary-foreground/10 px-4 py-2 text-sm text-primary-foreground/80 backdrop-blur-sm"
              >
                {f.icon}
                {f.text}
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-primary-foreground/50">
            © {new Date().getFullYear()} AFSC. All rights reserved.
          </p>
        </div>

        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3 bg-gradient-to-l from-secondary/20 to-transparent rounded-l-full blur-3xl" />
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to access your portal
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setEmail(''); setPassword(''); }}>
            <TabsList className="w-full">
              {loginTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="flex-1 text-xs sm:text-sm">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {loginTabs.map((tab) => (
              <TabsContent key={tab.value} value={tab.value} className="mt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`email-${tab.value}`}>Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id={`email-${tab.value}`}
                        type="email"
                        placeholder="your.email@example.com"
                        className="pl-10"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`password-${tab.value}`}>Password</Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => toast.info('Please contact support to reset your password.')}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id={`password-${tab.value}`}
                        type="password"
                        placeholder="Enter your password"
                        className="pl-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign In'}
                    {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                </form>
              </TabsContent>
            ))}
          </Tabs>

          {/* Registration link for Pre-Licensee */}
          <div className="text-center border-t pt-6">
            <p className="text-sm text-muted-foreground">
              New Pre-Licensee?{' '}
              <button
                onClick={() => navigate('/registration/pre-licensee')}
                className="font-medium text-primary hover:underline"
              >
                Register here
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
