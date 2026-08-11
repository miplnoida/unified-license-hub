// Dynamic complaint workflow action panel.
//
// Reads available actions from the `get_complaint_available_actions` RPC and
// renders a form driven by each action's `required_fields` spec. Executes via
// the canonical `execute_complaint_workflow_action` RPC — no hardcoded action
// wiring. Admins can add/remove/rename actions through Approval Workflow
// configuration and the UI updates automatically.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

interface Props {
  complaintId: string;
  instanceUpdatedAt?: string | null;
  onCompleted?: (result: any) => void;
  /** Configured label of the current workflow step (presentation only). */
  currentStepLabel?: string | null;
  /** Configured step list, used to name the target step of an action. */
  steps?: Array<{ step_key: string; label: string }>;
}


interface RequiredField {
  key: string;
  type: "text" | "number" | "user" | "licensee";
  label: string;
  required?: boolean;
  minLength?: number;
}

interface ActionRow {
  action_key: string;
  label: string;
  action_type: string;
  require_comments: boolean;
  required_fields: RequiredField[];
  target_step_key: string | null;
  sort_order: number;
  mutation_kind: string;
}

export function WorkflowActionPanel({ complaintId, instanceUpdatedAt, onCompleted }: Props) {
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [comments, setComments] = useState("");

  // Concurrency source of truth is workflow_instances.updated_at, exposed by
  // get_complaint_tracking. Never use complaints.updated_at for workflow guards.
  const trackingQ = useQuery({
    queryKey: ["complaint_tracking", complaintId],
    enabled: !!complaintId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_complaint_tracking", { _complaint_id: complaintId });
      if (error) throw error;
      return (data || {}) as { instance_updated_at?: string | null };
    },
  });
  const effectiveInstanceUpdatedAt = instanceUpdatedAt ?? trackingQ.data?.instance_updated_at ?? null;

  const actionsQ = useQuery({
    queryKey: ["complaint_actions", complaintId],
    enabled: !!complaintId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_complaint_available_actions", { _complaint_id: complaintId });
      if (error) throw error;
      return (data || []) as ActionRow[];
    },
  });

  const selected = useMemo(
    () => (actionsQ.data || []).find((a) => a.action_key === selectedKey) || null,
    [actionsQ.data, selectedKey],
  );

  const execMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No action selected");
      const payload: Record<string, any> = { ...values };
      if (comments.trim()) payload.comments = comments.trim();

      // Client-side validation (server re-enforces).
      for (const f of selected.required_fields || []) {
        if (f.required && (payload[f.key] === undefined || payload[f.key] === null || payload[f.key] === "")) {
          throw new Error(`Please provide ${f.label}.`);
        }
        if (f.type === "text" && f.minLength && typeof payload[f.key] === "string" && payload[f.key].length < f.minLength) {
          throw new Error(`${f.label} must be at least ${f.minLength} characters.`);
        }
      }
      if (selected.require_comments && !comments.trim()) throw new Error("Comments are required for this action.");

      const { data, error } = await (supabase as any).rpc("execute_complaint_workflow_action", {
        _complaint_id: complaintId,
        _action_key: selected.action_key,
        _payload: payload,
        _expected_updated_at: effectiveInstanceUpdatedAt,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => {
      toast.success(`${selected?.label} completed`);
      setSelectedKey(null);
      setValues({});
      setComments("");
      qc.invalidateQueries({ queryKey: ["complaint", complaintId] });
      qc.invalidateQueries({ queryKey: ["complaint_actions", complaintId] });
      qc.invalidateQueries({ queryKey: ["complaint_tracking", complaintId] });
      onCompleted?.(result);
    },
    onError: (e: any) => {
      const msg = e?.message || String(e);
      if (msg.includes("STALE_STATE")) toast.error("Someone else acted on this complaint. Please reload.");
      else if (msg.includes("ROLE_NOT_PERMITTED")) toast.error("Your role isn't allowed to perform this action.");
      else if (msg.includes("ACTION_NOT_ALLOWED_AT_STEP")) toast.error("This action isn't available at the current step.");
      else if (msg.startsWith("MISSING_REQUIRED_FIELD:")) toast.error(`Missing required field: ${msg.split(":")[1]}`);
      else toast.error(msg);
    },
  });

  if (actionsQ.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading available actions…
        </CardContent>
      </Card>
    );
  }

  const actions = actionsQ.data || [];
  if (actions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No actions available for you at this step. The complaint may be in a terminal state, or your role isn't
            configured to act here in the Complaint Management Workflow.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workflow Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a.action_key}
              size="sm"
              variant={selectedKey === a.action_key ? "default" : "outline"}
              onClick={() => {
                setSelectedKey(a.action_key);
                setValues({});
                setComments("");
              }}
            >
              {a.label}
            </Button>
          ))}
        </div>

        {selected && (
          <div className="space-y-3 border-t pt-4">
            {(selected.required_fields || []).map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={values[f.key]}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
              />
            ))}

            <div className="space-y-1">
              <Label>Comments {selected.require_comments && <span className="text-destructive">*</span>}</Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                placeholder="Add a note about this action (visible in the timeline)…"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedKey(null)} disabled={execMut.isPending}>
                Cancel
              </Button>
              <Button data-rbac="complaint_management.edit" size="sm" onClick={() => execMut.mutate()} disabled={execMut.isPending}>
                {execMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm: {selected.label}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: RequiredField;
  value: any;
  onChange: (v: any) => void;
}) {
  if (field.type === "text") {
    return (
      <div className="space-y-1">
        <Label>{field.label}{field.required && <span className="text-destructive"> *</span>}</Label>
        <Textarea rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (field.type === "number") {
    return (
      <div className="space-y-1">
        <Label>{field.label}{field.required && <span className="text-destructive"> *</span>}</Label>
        <Input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (field.type === "user") {
    return <UserPicker field={field} value={value} onChange={onChange} />;
  }
  if (field.type === "licensee") {
    return <LicenseePicker field={field} value={value} onChange={onChange} />;
  }
  return null;
}

function UserPicker({ field, value, onChange }: { field: RequiredField; value: any; onChange: (v: string) => void }) {
  const q = useQuery({
    queryKey: ["wf_users_admin_regulator"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return (
    <div className="space-y-1">
      <Label>{field.label}{field.required && <span className="text-destructive"> *</span>}</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
        <SelectContent>
          {(q.data || []).map((u: any) => (
            <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function LicenseePicker({ field, value, onChange }: { field: RequiredField; value: any; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["wf_licensees", search],
    queryFn: async () => {
      let query = supabase.from("licensees").select("id, name").order("name", { ascending: true }).limit(50);
      if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  const selected = (q.data || []).find((l: any) => l.id === value);

  return (
    <div className="space-y-1">
      <Label>{field.label}{field.required && <span className="text-destructive"> *</span>}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between">
            {selected?.name || "Select licensee…"}
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search licensees…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>No licensees found.</CommandEmpty>
              <CommandGroup>
                {(q.data || []).map((l: any) => (
                  <CommandItem key={l.id} value={l.id} onSelect={() => { onChange(l.id); setOpen(false); }}>
                    {l.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default WorkflowActionPanel;
