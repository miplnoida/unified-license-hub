import { useEffect, useState, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, ArrowLeft, Upload, Loader2, Plus, Trash2, ImageIcon, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSiteSettings, BrandingSettings as BrandingType, FooterSettings, HeaderMenuItem } from '@/contexts/SiteSettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function BrandingSettingsPage() {
  const navigate = useNavigate();
  const { branding, footer, header_menu, refreshSettings } = useSiteSettings();

  const [brand, setBrand] = useState<BrandingType>(branding);
  const [foot, setFoot] = useState<FooterSettings>(footer);
  const [menu, setMenu] = useState<HeaderMenuItem[]>(header_menu);
  const [saving, setSaving] = useState(false);

  // Sync when context loads
  useEffect(() => {
    setBrand(branding);
    setFoot(footer);
    setMenu(header_menu);
  }, [branding, footer, header_menu]);

  const upsert = async (key: string, value: any) => {
    const { error } = await (supabase.from('site_settings' as any).upsert({ key, value }, { onConflict: 'key' }) as any);
    if (error) throw error;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        upsert('branding', brand),
        upsert('footer', foot),
        upsert('header_menu', menu),
      ]);
      sessionStorage.removeItem('site_settings_cache');
      await refreshSettings();
      toast.success('Branding settings saved successfully');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const addMenuItem = () => setMenu([...menu, { label: '', href: '#' }]);
  const removeMenuItem = (i: number) => setMenu(menu.filter((_, idx) => idx !== i));
  const updateMenuItem = (i: number, field: 'label' | 'href', val: string) => {
    const copy = [...menu];
    copy[i] = { ...copy[i], [field]: val };
    setMenu(copy);
  };

  const addFooterLink = () => setFoot({ ...foot, links: [...foot.links, { label: '', href: '#' }] });
  const removeFooterLink = (i: number) => setFoot({ ...foot, links: foot.links.filter((_, idx) => idx !== i) });

  const addSocial = () => setFoot({ ...foot, social: [...(foot.social || []), { icon: 'website', href: '', label: '' }] });
  const removeSocial = (i: number) => setFoot({ ...foot, social: foot.social.filter((_, idx) => idx !== i) });

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title="Branding Settings"
          description="Customize the look and feel of the platform. Changes apply globally."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          }
        />

        {/* Logo & Identity */}
        <Card className="animate-slide-up delay-100">
          <CardHeader>
            <CardTitle className="text-lg">Logo & Identity</CardTitle>
            <CardDescription>Set your platform name, tagline, and logo URLs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Site Name</Label>
                <Input value={brand.site_name} onChange={e => setBrand({ ...brand, site_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tagline</Label>
                <Input value={brand.tagline} onChange={e => setBrand({ ...brand, tagline: e.target.value })} />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input placeholder="https://example.com/logo.png" value={brand.logo_url} onChange={e => setBrand({ ...brand, logo_url: e.target.value })} />
                {brand.logo_url && <img src={brand.logo_url} alt="Logo preview" className="h-10 mt-1 rounded object-contain border p-1" />}
              </div>
              <div className="space-y-2">
                <Label>Favicon URL</Label>
                <Input placeholder="https://example.com/favicon.ico" value={brand.favicon_url} onChange={e => setBrand({ ...brand, favicon_url: e.target.value })} />
                {brand.favicon_url && <img src={brand.favicon_url} alt="Favicon preview" className="h-8 mt-1 rounded object-contain border p-1" />}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Header Menu */}
        <Card className="animate-slide-up delay-200">
          <CardHeader>
            <CardTitle className="text-lg">Header Navigation Menu</CardTitle>
            <CardDescription>Configure the links shown in the landing page header.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {menu.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input className="flex-1" placeholder="Label" value={item.label} onChange={e => updateMenuItem(i, 'label', e.target.value)} />
                <Input className="flex-1" placeholder="href" value={item.href} onChange={e => updateMenuItem(i, 'href', e.target.value)} />
                <Button variant="ghost" size="icon" onClick={() => removeMenuItem(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addMenuItem}><Plus className="h-4 w-4 mr-1" />Add Link</Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <Card className="animate-slide-up delay-300">
          <CardHeader>
            <CardTitle className="text-lg">Footer Settings</CardTitle>
            <CardDescription>Copyright text, links, helpdesk info, and social media.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Footer Copyright Text</Label>
              <Textarea value={foot.text} onChange={e => setFoot({ ...foot, text: e.target.value })} />
            </div>

            {/* Helpdesk */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Helpdesk</Label>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input value={foot.helpdesk.phone} onChange={e => setFoot({ ...foot, helpdesk: { ...foot.helpdesk, phone: e.target.value } })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input value={foot.helpdesk.email} onChange={e => setFoot({ ...foot, helpdesk: { ...foot.helpdesk, email: e.target.value } })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address</Label>
                  <Input value={foot.helpdesk.address} onChange={e => setFoot({ ...foot, helpdesk: { ...foot.helpdesk, address: e.target.value } })} />
                </div>
              </div>
            </div>

            {/* Footer Links */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Footer Links</Label>
              {foot.links.map((link, i) => (
                <div key={i} className="flex gap-2 items-center mb-2">
                  <Input className="flex-1" placeholder="Label" value={link.label} onChange={e => {
                    const copy = [...foot.links]; copy[i] = { ...copy[i], label: e.target.value }; setFoot({ ...foot, links: copy });
                  }} />
                  <Input className="flex-1" placeholder="URL" value={link.href} onChange={e => {
                    const copy = [...foot.links]; copy[i] = { ...copy[i], href: e.target.value }; setFoot({ ...foot, links: copy });
                  }} />
                  <Button variant="ghost" size="icon" onClick={() => removeFooterLink(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addFooterLink}><Plus className="h-4 w-4 mr-1" />Add Link</Button>
            </div>

            {/* Social Icons */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Social Media</Label>
              {(foot.social || []).map((s, i) => (
                <div key={i} className="flex gap-2 items-center mb-2">
                  <select className="border rounded px-2 py-1.5 text-sm bg-background" value={s.icon} onChange={e => {
                    const copy = [...foot.social]; copy[i] = { ...copy[i], icon: e.target.value }; setFoot({ ...foot, social: copy });
                  }}>
                    <option value="facebook">Facebook</option>
                    <option value="twitter">Twitter</option>
                    <option value="instagram">Instagram</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="website">Website</option>
                  </select>
                  <Input className="flex-1" placeholder="URL" value={s.href} onChange={e => {
                    const copy = [...foot.social]; copy[i] = { ...copy[i], href: e.target.value }; setFoot({ ...foot, social: copy });
                  }} />
                  <Input className="w-28" placeholder="Label" value={s.label} onChange={e => {
                    const copy = [...foot.social]; copy[i] = { ...copy[i], label: e.target.value }; setFoot({ ...foot, social: copy });
                  }} />
                  <Button variant="ghost" size="icon" onClick={() => removeSocial(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addSocial}><Plus className="h-4 w-4 mr-1" />Add Social</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
