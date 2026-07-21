import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";

const CHANNELS: Array<{ key: string; label: string }> = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "in_app", label: "In-App" },
];

const CATEGORIES: Array<{ key: string; label: string; hint: string }> = [
  { key: "breaches", label: "Prudential breaches", hint: "Ratio thresholds and escalations" },
  { key: "enforcement", label: "Enforcement", hint: "Case notices and outcomes" },
  { key: "complaints", label: "Complaints", hint: "New complaints and SLA alerts" },
  { key: "returns", label: "Returns", hint: "Submissions, RFIs and validations" },
  { key: "fit_and_proper", label: "Fit & Proper", hint: "Screening and monitoring alerts" },
  { key: "correspondence", label: "Correspondence", hint: "Dispatched letters and receipts" },
  { key: "system", label: "System", hint: "Product and maintenance notices" },
];

type Prefs = {
  channels: Record<string, boolean>;
  categories: Record<string, boolean>;
  digest_enabled: boolean;
  digest_time: string;
  digest_timezone: string;
};

const DEFAULTS: Prefs = {
  channels: { email: true, sms: false, in_app: true },
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.key, true])),
  digest_enabled: false,
  digest_time: "08:00",
  digest_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
};

export default function NotificationPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setPrefs({
          channels: { ...DEFAULTS.channels, ...(data.channels as any) },
          categories: { ...DEFAULTS.categories, ...(data.categories as any) },
          digest_enabled: data.digest_enabled,
          digest_time: (data.digest_time as string)?.slice(0, 5) ?? "08:00",
          digest_timezone: data.digest_timezone ?? DEFAULTS.digest_timezone,
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: user.id,
        channels: prefs.channels,
        categories: prefs.categories,
        digest_enabled: prefs.digest_enabled,
        digest_time: prefs.digest_time,
        digest_timezone: prefs.digest_timezone,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Notification preferences saved");
  };

  const sendTest = async () => {
    if (!user) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("notification-digest", {
      body: { user_id: user.id },
    });
    setSending(false);
    if (error) toast.error(error.message);
    else toast.success(`Test digest sent (${data?.results?.[0]?.item_count ?? 0} items)`);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Delivery channels</CardTitle>
          <CardDescription>Choose how you receive alerts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANNELS.map((c) => (
            <div key={c.key} className="flex items-center justify-between border-b pb-3 last:border-0">
              <Label htmlFor={`ch-${c.key}`}>{c.label}</Label>
              <Switch
                id={`ch-${c.key}`}
                checked={!!prefs.channels[c.key]}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, channels: { ...p.channels, [c.key]: v } }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Categories</CardTitle>
          <CardDescription>Only receive alerts you care about.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {CATEGORIES.map((c) => (
            <div key={c.key} className="flex items-center justify-between border-b pb-3 last:border-0">
              <div>
                <Label htmlFor={`cat-${c.key}`} className="font-medium">{c.label}</Label>
                <p className="text-xs text-muted-foreground">{c.hint}</p>
              </div>
              <Switch
                id={`cat-${c.key}`}
                checked={!!prefs.categories[c.key]}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, categories: { ...p.categories, [c.key]: v } }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily digest</CardTitle>
          <CardDescription>A single summary email at your preferred time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="digest-enabled">Enable daily digest</Label>
            <Switch
              id="digest-enabled"
              checked={prefs.digest_enabled}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, digest_enabled: v }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="digest-time">Delivery time</Label>
              <Input
                id="digest-time"
                type="time"
                value={prefs.digest_time}
                onChange={(e) => setPrefs((p) => ({ ...p, digest_time: e.target.value }))}
                disabled={!prefs.digest_enabled}
              />
            </div>
            <div>
              <Label htmlFor="digest-tz">Timezone</Label>
              <Input
                id="digest-tz"
                value={prefs.digest_timezone}
                onChange={(e) => setPrefs((p) => ({ ...p, digest_timezone: e.target.value }))}
                disabled={!prefs.digest_enabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={sendTest} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Send test digest
        </Button>
        <Button data-rbac="user_management.edit" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save preferences
        </Button>
      </div>
    </div>
  );
}
