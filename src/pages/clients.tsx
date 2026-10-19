import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  FolderKanban,
  KeyRound,
  LayoutGrid,
  Loader2,
  Mail,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  Shield,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { Loading, LoadFailed } from "@/components/async-state";
import { BriefForm } from "@/components/brief-form";
import { CommentThread } from "@/components/comment-thread";
import { RetainerUsage } from "@/components/retainer-usage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendOnboardingEmail } from "@/lib/resend";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Client = { id: string; name: string; archived: boolean; retainer_hours: number | null };
type WorkspacePerson = {
  id: string;
  name: string;
  role: "team" | "client";
  is_admin: boolean;
  client_id: string | null;
};

const RESEND_KEY_STORAGE = "vmh_resend_api_key";

// Rename, set the monthly retainer, archive.
function EditClientDialog({
  client,
  onClose,
  onSaved,
}: {
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(client.name);
  const [retainer, setRetainer] = useState(client.retainer_hours?.toString() ?? "");
  const [archived, setArchived] = useState(client.archived);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase
      .from("clients")
      .update({ name: name.trim(), retainer_hours: retainer ? Number(retainer) : null, archived })
      .eq("id", client.id)
      .select("id");
    setBusy(false);
    if (error) return void toast.error(error.message);
    if (!data.length) return void toast.error("Couldn't save: workspace wasn't updated.");
    toast.success("Workspace updated");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl border-border bg-card shadow-2xl">
        <form className="grid gap-4" onSubmit={save}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Workspace Settings</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure name, monthly retainer allotment, and archive status.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Workspace / Client Name
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="h-9 rounded-lg text-xs" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Monthly Retainer Hours (optional)
            </Label>
            <Input
              type="number"
              min="0.5"
              step="0.5"
              inputMode="decimal"
              value={retainer}
              onChange={(e) => setRetainer(e.target.value)}
              placeholder="e.g. 40"
              className="h-9 rounded-lg text-xs"
            />
          </div>
          <Label className="flex items-center gap-2 text-xs pt-1 cursor-pointer">
            <Checkbox checked={archived} onCheckedChange={(v) => setArchived(v === true)} />
            Archive this workspace (hides from active lists)
          </Label>
          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="rounded-lg text-xs h-8">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy} aria-busy={busy} className="bg-foreground text-background hover:bg-foreground/90 rounded-lg text-xs h-8 font-medium">
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-3 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Dialog: Create a new Client Workspace and immediately onboard primary contact
function NewWorkspaceDialog({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newClient: Client) => void;
}) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [retainerHours, setRetainerHours] = useState("");
  const [inviteContact, setInviteContact] = useState(true);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resendApiKey = localStorage.getItem(RESEND_KEY_STORAGE) || "";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const wName = workspaceName.trim();
    if (!wName) return toast.error("Please enter a workspace name.");

    setBusy(true);

    // 1. Create client workspace record
    const { data: clientData, error: clientErr } = await supabase
      .from("clients")
      .insert({
        name: wName,
        retainer_hours: retainerHours ? Number(retainerHours) : null,
      })
      .select("id, name, archived, retainer_hours")
      .single();

    if (clientErr || !clientData) {
      setBusy(false);
      return void toast.error(clientErr?.message || "Failed to create workspace.");
    }

    // 2. If contact invited, send direct email via Resend or create link
    if (inviteContact && contactEmail.trim()) {
      const cleanEmail = contactEmail.trim().toLowerCase();
      const cleanName = contactName.trim() || wName;
      const setupLink = `${window.location.origin}/set-password`;

      if (resendApiKey) {
        const res = await sendOnboardingEmail({
          to: cleanEmail,
          clientName: cleanName,
          companyName: wName,
          inviteLink: setupLink,
          resendApiKey: resendApiKey.trim(),
          fromEmail: "onboarding@resend.dev",
        });

        if (!res.ok) {
          toast.warning(`Workspace created, but Resend email failed: ${res.error}`);
        } else {
          toast.success(`Workspace created & onboarding email sent to ${cleanEmail}!`);
        }
      } else {
        toast.info("Workspace created. Copy the invite link below to share with client.");
      }

      setInviteLink(setupLink);
    } else {
      toast.success(`Workspace "${wName}" created!`);
    }

    setBusy(false);
    onCreated(clientData);
  }

  const handleCopy = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border-border bg-card p-6 shadow-2xl">
        <DialogHeader className="pb-2 border-b border-border/50">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
            <Sparkles className="size-3.5 text-[#FF4B33]" />
            <span>Workspace Provisioning</span>
          </div>
          <DialogTitle className="text-lg font-semibold tracking-tight">Onboard Client &amp; Workspace</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Instantly generates their client project workspace, creative brief thread, and contact invitation.
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4 py-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" /> Setup Link Generated
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 font-medium text-xs underline cursor-pointer hover:opacity-80"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied ? "Copied" : "Copy Link"}
                </button>
              </div>
              <p className="font-mono text-xs text-foreground/80 break-all select-all">{inviteLink}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Share this link directly or they can use the Resend email already sent to establish credentials and complete the brief.
            </p>
            <DialogFooter>
              <Button onClick={onClose} className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-lg text-xs h-9 font-medium">
                Open Workspace
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="grid gap-4 pt-2" onSubmit={handleCreate}>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-foreground">Client / Organization Name *</Label>
              <Input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g. Acme Studio"
                required
                className="h-9 rounded-lg text-xs"
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Monthly Retainer Hours (optional)</Label>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={retainerHours}
                onChange={(e) => setRetainerHours(e.target.value)}
                placeholder="e.g. 40"
                className="h-9 rounded-lg text-xs"
              />
            </div>

            <div className="border-t border-border/60 pt-3">
              <Label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                <Checkbox
                  checked={inviteContact}
                  onCheckedChange={(v) => setInviteContact(v === true)}
                />
                Send invitation to client primary contact immediately
              </Label>
            </div>

            {inviteContact && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/70 bg-accent/20 p-3">
                <div className="grid gap-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">Contact Name</Label>
                  <Input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                    className="h-8 rounded-lg text-xs bg-background"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">Contact Email *</Label>
                  <Input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="sarah@acme.com"
                    required={inviteContact}
                    className="h-8 rounded-lg text-xs bg-background"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="rounded-lg text-xs h-9">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy} aria-busy={busy} className="bg-foreground text-background hover:bg-foreground/90 rounded-lg text-xs h-9 font-medium">
                {busy ? (
                  <>
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                    Provisioning…
                  </>
                ) : (
                  <>
                    <Plus className="mr-1.5 size-3.5" />
                    Create Workspace
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Dialog: Add more people (team or client) directly into this specific workspace
function AddPersonToWorkspaceDialog({
  workspace,
  isOpen,
  onClose,
  onAdded,
}: {
  workspace: Client;
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [personName, setPersonName] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [accessType, setAccessType] = useState<"client" | "team">("client");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resendApiKey = localStorage.getItem(RESEND_KEY_STORAGE) || "";

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = personEmail.trim().toLowerCase();
    const cleanName = personName.trim();
    if (!cleanEmail || !cleanName) return toast.error("Please fill in both name and email.");

    setBusy(true);
    const setupLink = `${window.location.origin}/set-password`;

    // Send Resend email if configured
    if (resendApiKey) {
      const res = await sendOnboardingEmail({
        to: cleanEmail,
        clientName: cleanName,
        companyName: workspace.name,
        inviteLink: setupLink,
        resendApiKey: resendApiKey.trim(),
        fromEmail: "onboarding@resend.dev",
      });

      if (!res.ok) {
        toast.warning(`Email delivery warning: ${res.error}. Use the manual link below.`);
      } else {
        toast.success(`Invitation dispatched to ${cleanEmail}!`);
      }
    } else {
      toast.info("No Resend API Key saved. Generating setup link for you to copy.");
    }

    setInviteLink(setupLink);
    setBusy(false);
    onAdded();
  }

  const handleCopy = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl border-border bg-card p-6 shadow-2xl">
        <DialogHeader className="pb-2 border-b border-border/50">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
            <UserPlus className="size-3.5 text-[#FF4B33]" />
            <span>Access Delegation</span>
          </div>
          <DialogTitle className="text-base font-semibold">Add Member to {workspace.name}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Grant workspace permission to an external client contact or internal agency creator.
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4 py-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" /> Setup Link Ready
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 font-medium text-xs underline cursor-pointer hover:opacity-80"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied ? "Copied" : "Copy Link"}
                </button>
              </div>
              <p className="font-mono text-xs text-foreground/80 break-all select-all">{inviteLink}</p>
            </div>
            <DialogFooter>
              <Button onClick={onClose} className="w-full bg-foreground text-background hover:bg-foreground/90 rounded-lg text-xs h-9 font-medium">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="grid gap-3.5 pt-2" onSubmit={handleAdd}>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-foreground">Role / Permission Scope</Label>
              <Select value={accessType} onValueChange={(v) => setAccessType(v as "client" | "team")}>
                <SelectTrigger className="rounded-lg text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client User (Scoped to this workspace)</SelectItem>
                  <SelectItem value="team">VMH Team Member (Internal agency access)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-foreground">Full Name *</Label>
              <Input
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="e.g. Alex Morgan"
                required
                className="rounded-lg text-xs h-9"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-foreground">Email Address *</Label>
              <Input
                type="email"
                value={personEmail}
                onChange={(e) => setPersonEmail(e.target.value)}
                placeholder="alex@brand.com"
                required
                className="rounded-lg text-xs h-9"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="rounded-lg text-xs h-9">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy} aria-busy={busy} className="bg-foreground text-background hover:bg-foreground/90 rounded-lg text-xs h-9 font-medium">
                {busy ? (
                  <>
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 size-3.5" />
                    Send Invite
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Workspace People Tab Content: Clean SaaS data table with direct Resend configuration
function WorkspacePeopleTab({
  workspace,
  people,
  onAddPerson,
}: {
  workspace: Client;
  people: WorkspacePerson[];
  onAddPerson: () => void;
}) {
  const [resendApiKey, setResendApiKey] = useState(() => localStorage.getItem(RESEND_KEY_STORAGE) || "");
  const [showKeyConfig, setShowKeyConfig] = useState(false);

  const handleSaveKey = (val: string) => {
    setResendApiKey(val);
    localStorage.setItem(RESEND_KEY_STORAGE, val.trim());
  };

  const clientMembers = people.filter((p) => p.role === "client" && p.client_id === workspace.id);
  const teamMembers = people.filter((p) => p.role === "team");

  return (
    <div className="space-y-5">
      {/* SaaS Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Access &amp; Permissions</h3>
          <p className="text-xs text-foreground/80 mt-0.5">
            Stakeholders with credentials and project access for {workspace.name}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowKeyConfig(!showKeyConfig)}
            className="rounded-lg text-xs h-8 gap-1.5 font-medium border-border/70"
          >
            <KeyRound className="size-3 text-muted-foreground" />
            {resendApiKey ? "Resend API Active" : "Configure Email Key"}
          </Button>
          <Button
            size="sm"
            onClick={onAddPerson}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-lg text-xs h-8 font-medium gap-1.5"
          >
            <UserPlus className="size-3.5" />
            Add Member
          </Button>
        </div>
      </div>

      {/* Resend API Key Config Box */}
      {showKeyConfig && (
        <div className="rounded-xl border border-border bg-accent/20 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-[#FF4B33]" /> Resend Email Dispatch Integration
            </span>
            <a
              href="https://resend.com"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Get free API key &rarr;
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Invites are sent from your local environment via proxy directly to Resend without backend deployment.
          </p>
          <div className="flex gap-2 pt-1">
            <Input
              type="password"
              placeholder="re_..."
              value={resendApiKey}
              onChange={(e) => handleSaveKey(e.target.value)}
              className="rounded-lg text-xs font-mono h-8 bg-background max-w-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowKeyConfig(false);
                toast.success("Resend API key configured!");
              }}
              className="rounded-lg text-xs h-8 font-medium"
            >
              Save Key
            </Button>
          </div>
        </div>
      )}

      {/* Client Users Table */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Users className="size-3.5 text-[#FF4B33]" />
            Client Stakeholders ({clientMembers.length})
          </span>
          <span className="text-muted-foreground text-[11px]">Portal &amp; brief participants</span>
        </div>

        {clientMembers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
            No client contacts invited yet. Click <strong>"Add Member"</strong> above to send an onboarding invitation.
          </div>
        ) : (
          <div className="rounded-xl border border-border/70 overflow-hidden bg-card divide-y divide-border/60">
            {clientMembers.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 text-xs hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-full bg-[#FF4B33]/15 text-[#FF4B33] flex items-center justify-center font-bold text-xs">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">External Client Account</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-medium border border-emerald-500/20">
                    Active Client
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Internal Team Assigned */}
      <div className="space-y-2.5 pt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Shield className="size-3.5 text-blue-500" />
            Agency Team Assigned ({teamMembers.length})
          </span>
          <span className="text-muted-foreground text-[11px]">Internal creators with manage access</span>
        </div>

        <div className="rounded-xl border border-border/70 overflow-hidden bg-card divide-y divide-border/60">
          {teamMembers.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 text-xs hover:bg-accent/30 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="size-7 rounded-full bg-accent flex items-center justify-center font-bold text-xs text-foreground">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-foreground">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.is_admin ? "Workspace Administrator" : "Team Producer"}
                  </p>
                </div>
              </div>
              <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/60">
                Agency Lead
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [clients, setClients] = useState<Client[] | null>(null);
  const [people, setPeople] = useState<WorkspacePerson[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [briefs, setBriefs] = useState<Record<string, string | null>>({}); // client id -> submitted_at
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(false);
  const [isNewWorkspaceOpen, setIsNewWorkspaceOpen] = useState(false);
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, archived, retainer_hours")
      .order("name");
    if (error) {
      toast.error(error.message);
      setFailed(error.message);
    } else {
      setFailed(null);
      setClients(data);
    }

    // Load users to associate with workspaces
    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, role, is_admin, client_id")
      .order("name");
    if (usersData) {
      setPeople(usersData as WorkspacePerson[]);
    }
  }, []);

  const loadUnread = useCallback(async () => {
    const { data, error } = await supabase.rpc("unread_counts");
    if (!error)
      setUnread(
        Object.fromEntries(
          (data as { client_id: string; unread: number }[]).map((r) => [r.client_id, r.unread])
        )
      );
  }, []);

  useEffect(() => {
    load();
    supabase
      .from("client_briefs")
      .select("client_id, submitted_at")
      .then(({ data, error }) => {
        if (!error && data)
          setBriefs(Object.fromEntries(data.map((b) => [b.client_id, b.submitted_at])));
      });
  }, [load]);

  // Subscribe to new comment changes
  useEffect(() => {
    const channel = supabase
      .channel("comments:unread")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_comments" }, loadUnread)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadUnread]);

  const rawTab = params.get("tab");
  const tab = rawTab === "brief" ? "brief" : rawTab === "people" ? "people" : "messages";
  const visible = useMemo(() => {
    return (clients ?? []).filter((x) => {
      if (!showArchived && x.archived) return false;
      if (!searchQuery.trim()) return true;
      return x.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    });
  }, [clients, showArchived, searchQuery]);

  const selected = clients?.find((x) => x.id === params.get("c")) ?? visible[0];
  const archivedCount = clients?.filter((x) => x.archived).length ?? 0;

  // Refetch badges when switching threads
  useEffect(() => {
    loadUnread();
  }, [loadUnread, selected?.id]);

  // Quick stats computed for SaaS metrics bar
  const totalWorkspaces = clients?.length ?? 0;
  const activeRetainers = clients?.filter((c) => !c.archived && c.retainer_hours).length ?? 0;
  const pendingBriefsCount = clients?.filter((c) => !c.archived && !briefs[c.id]).length ?? 0;

  if (failed)
    return (
      <LoadFailed
        message={failed}
        onRetry={() => {
          setFailed(null);
          load();
        }}
      />
    );
  if (!clients) return <Loading />;

  return (
    <div className="space-y-4">
      {/* 1. SaaS Breadcrumb & Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Vertex Agency</span>
            <span>/</span>
            <span className="font-semibold text-foreground">Client Workspaces</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Workspace Hub
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsNewWorkspaceOpen(true)}
            className="bg-foreground text-background hover:bg-foreground/90 font-medium text-xs h-8.5 rounded-lg px-3 gap-1.5 shadow-sm"
          >
            <Plus className="size-3.5" /> Onboard Client
          </Button>
        </div>
      </div>

      {/* 2. Compact SaaS Metrics Stat Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Workspaces</span>
            <FolderKanban className="size-3.5 text-muted-foreground" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">{totalWorkspaces}</span>
            <span className="text-[11px] text-muted-foreground">({visible.length} active)</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Retainers</span>
            <Clock className="size-3.5 text-emerald-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">{activeRetainers}</span>
            <span className="text-[11px] text-muted-foreground">plans active</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Pending Briefs</span>
            <AlertCircle className="size-3.5 text-amber-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">{pendingBriefsCount}</span>
            <span className="text-[11px] text-amber-500 font-medium">questionnaires due</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Team &amp; Clients</span>
            <Users className="size-3.5 text-blue-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">{people.length}</span>
            <span className="text-[11px] text-muted-foreground">users provisioned</span>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace 2-Column SaaS Studio */}
      <div className="grid gap-4 lg:grid-cols-12 items-start">
        {/* Left Column: Workspaces Directory List (4 cols) */}
        <div className="space-y-2 lg:col-span-4">
          <div className="rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
            {/* Search filter bar */}
            <div className="p-2.5 border-b border-border/60 bg-muted/20">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter workspaces…"
                  className="pl-8 text-xs h-8 bg-background rounded-lg border-border/70"
                />
              </div>
            </div>

            {/* List of client workspaces */}
            <div className="divide-y divide-border/50 max-h-[560px] overflow-y-auto">
              {visible.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  {searchQuery ? "No matching workspace." : "No workspaces configured."}
                </div>
              ) : (
                visible.map((x) => {
                  const n = x.id === selected?.id ? 0 : unread[x.id] ?? 0;
                  const isSelected = x.id === selected?.id;
                  const hasPendingBrief = !briefs[x.id];
                  const clientUsers = people.filter((p) => p.role === "client" && p.client_id === x.id);

                  return (
                    <Link
                      key={x.id}
                      to={`/clients?c=${x.id}${tab !== "messages" ? `&tab=${tab}` : ""}`}
                      aria-current={isSelected ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between p-3 text-xs transition-colors block text-left",
                        isSelected
                          ? "bg-accent/70 font-semibold border-l-2 border-foreground"
                          : "hover:bg-accent/30 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="min-w-0 pr-2 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-foreground font-medium text-xs">{x.name}</span>
                          {x.archived && <span className="text-[10px] text-muted-foreground">(archived)</span>}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-normal">
                          <span>{clientUsers.length} contact{clientUsers.length === 1 ? "" : "s"}</span>
                          <span>•</span>
                          <span>{x.retainer_hours ? `${x.retainer_hours}h retainer` : "Project"}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasPendingBrief && (
                          <span className="size-2 rounded-full bg-amber-500" title="Brief Pending" />
                        )}
                        {n > 0 && (
                          <span className="rounded-full bg-[#FF4B33] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                            {n}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            {archivedCount > 0 && (
              <div className="p-2 border-t border-border/50 bg-muted/10 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground text-xs h-7 rounded-lg"
                  onClick={() => setShowArchived((v) => !v)}
                >
                  {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Workspace Operation Station (8 cols) */}
        <div className="space-y-4 lg:col-span-8">
          {selected ? (
            <div className="rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
              {/* Workspace Top Header Station */}
              <div className="p-4 border-b border-border/60 bg-muted/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold tracking-tight text-foreground truncate">
                      {selected.name}
                    </h2>
                    <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/50">
                      Workspace #{selected.id.slice(0, 6)}
                    </span>
                  </div>
                  <RetainerUsage
                    key={`${selected.id}:${selected.retainer_hours}`}
                    clientId={selected.id}
                    retainerHours={selected.retainer_hours}
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddPersonOpen(true)}
                    className="rounded-lg text-xs h-8 gap-1.5 font-medium border-border/70"
                  >
                    <UserPlus className="size-3 text-[#FF4B33]" />
                    Add People
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(true)}
                    className="rounded-lg text-xs h-8 gap-1.5 font-medium border-border/70"
                  >
                    <Pencil className="size-3" /> Settings
                  </Button>
                </div>
              </div>

              {/* Workspace Segmented Tabs Bar */}
              <div className="border-b border-border/60 px-4 bg-card flex gap-4 text-xs font-medium">
                {[
                  { id: "messages", label: "Messages & Files", icon: MessageSquare },
                  { id: "brief", label: "Creative Brief", icon: Sparkles },
                  { id: "people", label: "People & Access", icon: Users },
                ].map((t) => {
                  const Icon = t.icon;
                  const isActive = t.id === tab;
                  return (
                    <Link
                      key={t.id}
                      to={`/clients?c=${selected.id}${t.id === "messages" ? "" : `&tab=${t.id}`}`}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "py-3 flex items-center gap-1.5 border-b-2 transition-colors",
                        isActive
                          ? "border-foreground text-foreground font-semibold"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="size-3.5" />
                      <span>{t.label}</span>
                      {t.id === "brief" && !briefs[selected.id] && (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.2 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          due
                        </span>
                      )}
                      {t.id === "people" && (
                        <span className="rounded-full bg-accent px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                          {people.filter((p) => p.role === "client" && p.client_id === selected.id).length}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Active Tab Body */}
              <div className="p-4 sm:p-5">
                {tab === "brief" ? (
                  <BriefForm
                    key={selected.id}
                    clientId={selected.id}
                    onSaved={(at) => setBriefs((b) => ({ ...b, [selected.id]: at }))}
                  />
                ) : tab === "people" ? (
                  <WorkspacePeopleTab
                    workspace={selected}
                    people={people}
                    onAddPerson={() => setIsAddPersonOpen(true)}
                  />
                ) : (
                  <CommentThread key={selected.id} clientId={selected.id} userId={profile!.id} />
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 p-12 text-center bg-card shadow-xs">
              <Building2 className="mx-auto size-8 text-muted-foreground/60 mb-2" />
              <h3 className="text-sm font-semibold text-foreground">No Workspace Selected</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Pick a client workspace from the directory or onboard a new client.
              </p>
              <Button
                size="sm"
                onClick={() => setIsNewWorkspaceOpen(true)}
                className="bg-foreground text-background hover:bg-foreground/90 rounded-lg text-xs font-medium mt-3"
              >
                <Plus className="size-3.5 mr-1" /> Onboard Client
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Workspace Dialog */}
      {editing && selected && (
        <EditClientDialog
          client={selected}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}

      {/* Add Person To Workspace Dialog */}
      {isAddPersonOpen && selected && (
        <AddPersonToWorkspaceDialog
          workspace={selected}
          isOpen={isAddPersonOpen}
          onClose={() => setIsAddPersonOpen(false)}
          onAdded={() => {
            load();
          }}
        />
      )}

      {/* Onboard Client & Create Workspace Dialog */}
      {isNewWorkspaceOpen && (
        <NewWorkspaceDialog
          isOpen={isNewWorkspaceOpen}
          onClose={() => setIsNewWorkspaceOpen(false)}
          onCreated={(newClient) => {
            setIsNewWorkspaceOpen(false);
            setClients((cs) => [...(cs ?? []), newClient].sort((a, b) => a.name.localeCompare(b.name)));
            navigate(`/clients?c=${newClient.id}`);
          }}
        />
      )}
    </div>
  );
}
