import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Layers,
  ArrowRight,
  Mail,
  Lock,
  Shield,
  FileText,
  ClipboardList,
  Building2,
  User,
} from 'lucide-react';

const features = [
  { icon: <FileText className="h-5 w-5" />, text: 'License Applications' },
  { icon: <ClipboardList className="h-5 w-5" />, text: 'Approval Workflows' },
  { icon: <Shield className="h-5 w-5" />, text: 'Audit & Compliance' },
  { icon: <Building2 className="h-5 w-5" />, text: 'Multi-Sector Support' },
];

export default function Index() {
  const navigate = useNavigate();
  const { isAuthenticated, login, signup } = useAuth();
  const [tab, setTab] = useState('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  if (isAuthenticated) {
    navigate('/dashboard');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error('Please enter email and password');
      return;
    }
    setLoginLoading(true);
    const result = await login(loginEmail, loginPassword);
    setLoginLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Login successful');
    navigate('/dashboard');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName || !signupEmail || !signupPassword) {
      toast.error('Please fill all fields');
      return;
    }
    if (signupPassword !== signupConfirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (signupPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setSignupLoading(true);
    const result = await signup(signupEmail, signupPassword, signupName);
    setSignupLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Account created! Please check your email to confirm, then sign in.');
    setTab('login');
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left Panel */}
      <div className="hero-gradient relative flex flex-col justify-between p-8 lg:p-12 lg:w-[45%] xl:w-[40%] min-h-[280px] lg:min-h-screen">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iMiIvPjwvZz48L3N2Zz4=')] opacity-20" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
              <Layers className="h-6 w-6 text-secondary-foreground" />
            </div>
            <span className="text-xl font-bold text-primary-foreground">RegPlatform</span>
          </div>
          <h1 className="text-3xl lg:text-4xl xl:text-5xl font-bold text-primary-foreground leading-tight">
            Regulatory Licensing &{' '}
            <span className="text-secondary">Compliance Platform</span>
          </h1>
          <p className="mt-4 text-primary-foreground/70 max-w-lg text-sm lg:text-base">
            A configurable platform for licensing management, supervisory compliance,
            approval workflows, and regulatory oversight.
          </p>
        </div>
        <div className="relative z-10 mt-8 lg:mt-0">
          <div className="flex flex-wrap gap-3">
            {features.map((f) => (
              <div key={f.text} className="flex items-center gap-2 rounded-full bg-primary-foreground/10 px-4 py-2 text-sm text-primary-foreground/80 backdrop-blur-sm">
                {f.icon}
                {f.text}
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-primary-foreground/50">
            © {new Date().getFullYear()} Regulatory Platform. All rights reserved.
          </p>
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3 bg-gradient-to-l from-secondary/20 to-transparent rounded-l-full blur-3xl" />
      </div>

      {/* Right Panel */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">Get Started</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in or create an account to access the platform
            </p>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="login-email" type="email" placeholder="your.email@example.com" className="pl-10"
                      value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="login-password" type="password" placeholder="Enter your password" className="pl-10"
                      value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loginLoading}>
                  {loginLoading ? 'Signing in...' : 'Sign In'}
                  {!loginLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate('/forgot-password')}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot your password?
                  </button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-name" placeholder="John Doe" className="pl-10"
                      value={signupName} onChange={(e) => setSignupName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-email" type="email" placeholder="your.email@example.com" className="pl-10"
                      value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-password" type="password" placeholder="Min. 6 characters" className="pl-10"
                      value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="signup-confirm" type="password" placeholder="Confirm password" className="pl-10"
                      value={signupConfirm} onChange={(e) => setSignupConfirm(e.target.value)} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={signupLoading}>
                  {signupLoading ? 'Creating account...' : 'Create Account'}
                  {!signupLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  First registered user automatically becomes Super Admin
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
