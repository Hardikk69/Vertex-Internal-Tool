import { 
  Building2, 
  Check, 
  CheckCircle2, 
  Copy, 
  ExternalLink, 
  KeyRound, 
  Loader2, 
  Mail, 
  Plus, 
  Send, 
  ShieldCheck, 
  Sparkles, 
  UserCheck, 
  Users 
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { Loading } from "@/components/async-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type Person = {
  id: string;
  name: string;
  role: "team" | "client";
  is_admin: boolean;
  client: { name: string } | null;
};
type Client = { id: string; name: string };

const RESEND_KEY_STORAGE = "vmh_resend_api_key";
const TEAM = "team";

export default function PeoplePage() {
  const { profile } = useAuth();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [activeTab, setActiveTab] = useState<"onboard" | "members">("onboard");

  // Form fields
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState(TEAM);
  const [resendApiKey, setResendApiKey] = useState(() => {
    return localStorage.getItem(RESEND_KEY_STORAGE) || "";
  });
  const [senderEmail, setSenderEmail] = useState("onboarding@resend.dev");
  const [busy, setBusy] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Save Resend API key to localStorage
  const handleSaveResendKey = (key: string) => {
    setResendApiKey(key);
    localStorage.setItem(RESEND_KEY_STORAGE, key.trim());
  };

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, role, is_admin, client:clients!users_client_id_fkey(name)")
      .order("name");
    if (error) toast.error(error.message);
    else setPeople(data as unknown as Person[]);
  }, []);

  useEffect(() => {
    if (!profile?.is_admin) return;
    load();
    supabase
      .from("clients")
      .select("id, name")
      .eq("archived", false)
      .order("name")
      .then(({ data, error }) => (error ? toast.error(error.message) : setClients(data ?? [])));
  }, [load, profile]);

  if (!profile?.is_admin) return <Navigate to="/dashboard" replace />;

  async function handleOnboard(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!cleanEmail || !cleanName) {
      return toast.error("Please enter both email and name.");
    }

    setBusy(true);
    setLastInviteLink(null);

    const isClient = role !== TEAM;
    const selectedClientObj = clients.find((c) => c.id === role);
    const companyName = isClient ? (selectedClientObj?.name || "Client Project") : "Vertex Media House";

    // Direct invitation link landing on localhost/set-password
    const inviteLink = `${window.location.origin}/set-password`;

    // 1. Direct Resend API trigger (if API key provided)
    if (resendApiKey.trim()) {
      const emailRes = await sendOnboardingEmail({
        to: cleanEmail,
        clientName: cleanName,
        companyName,
        inviteLink,
        resendApiKey: resendApiKey.trim(),
        fromEmail: senderEmail.trim() || "onboarding@resend.dev",
      });

      if (!emailRes.ok) {
        setBusy(false);
        return toast.error(`Resend API Error: ${emailRes.error}`);
      }
      toast.success(`Onboarding email sent directly via Resend to ${cleanEmail}!`);
    } else {
      toast.info("No Resend API Key entered yet. Generating onboarding link for you to copy.");
    }

    setLastInviteLink(inviteLink);
    setBusy(false);
  }

  const copyLink = () => {
    if (lastInviteLink) {
      navigator.clipboard.writeText(lastInviteLink);
      setCopied(true);
      toast.success("Onboarding link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const team = people?.filter((p) => p.role === "team") ?? [];
  const clientLogins = (people ?? [])
    .filter((p) => p.role === "client")
    .sort((a, b) => (a.client?.name ?? "").localeCompare(b.client?.name ?? ""));

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#FF4B33]/15 text-[#FF4B33]">
              <Users className="size-4" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Client Onboarding &amp; People</h1>
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {people?.length ?? 0} members
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Onboard new clients directly, send invite emails via Resend, and manage team permissions.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex rounded-xl border border-border/70 bg-card p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("onboard")}
            className={cn(
              "rounded-lg px-3 py-1.5 font-semibold transition-all",
              activeTab === "onboard"
                ? "bg-foreground text-background shadow-sm dark:bg-white dark:text-neutral-950"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Onboard Client / User
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("members")}
            className={cn(
              "rounded-lg px-3 py-1.5 font-semibold transition-all",
              activeTab === "members"
                ? "bg-foreground text-background shadow-sm dark:bg-white dark:text-neutral-950"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Active Directory ({people?.length ?? 0})
          </button>
        </div>
      </div>

      {activeTab === "onboard" ? (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Main Onboarding Form (7 cols) */}
          <div className="space-y-4 lg:col-span-7">
            <Card className="rounded-3xl border-border/70 p-6 shadow-sm backdrop-blur-md">
              <CardHeader className="p-0 pb-4">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FF4B33]/15 px-2.5 py-0.5 text-xs font-semibold text-[#FF4B33] mb-1">
                  <Sparkles className="size-3" />
                  <span>Instant Client Invitation</span>
                </div>
                <CardTitle className="text-xl">Onboard New Client or Team Member</CardTitle>
                <CardDescription className="text-xs">
                  Sends an automated welcome email with their account setup link and creative brief guide.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-0 pt-2">
                <form onSubmit={handleOnboard} className="grid gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="onboard-email" className="text-xs font-semibold">
                      Client Email Address *
                    </Label>
                    <Input
                      id="onboard-email"
                      type="email"
                      required
                      placeholder="client@brand.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-xl text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="onboard-name" className="text-xs font-semibold">
                        Contact / Person Name *
                      </Label>
                      <Input
                        id="onboard-name"
                        required
                        placeholder="e.g. Sarah Jenkins"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="rounded-xl text-sm"
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <Label className="text-xs font-semibold">Workspace Access</Label>
                      <Select value={role} onValueChange={setRole}>
                        <SelectTrigger className="rounded-xl text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={TEAM}>VMH Team Member</SelectItem>
                          {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              Client Portal · {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={busy}
                    aria-busy={busy}
                    className="brand-gradient mt-2 h-11 w-full rounded-xl font-semibold text-white shadow-md hover:opacity-95"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Sending Onboarding Invitation…
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 size-4" />
                        Send Onboarding Invite
                      </>
                    )}
                  </Button>
                </form>

                {/* Generated Direct Link Box */}
                {lastInviteLink && (
                  <div className="mt-5 space-y-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                    <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="size-4" /> Setup Link Generated
                      </span>
                      <button
                        type="button"
                        onClick={copyLink}
                        className="flex items-center gap-1 font-bold underline cursor-pointer hover:opacity-80"
                      >
                        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                        {copied ? "Copied!" : "Copy Link"}
                      </button>
                    </div>
                    <p className="font-mono text-xs text-foreground/80 break-all select-all">
                      {lastInviteLink}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Resend Configuration Sidebar (5 cols) */}
          <div className="space-y-4 lg:col-span-5">
            <Card className="rounded-3xl border-border/70 p-5 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex size-7 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <KeyRound className="size-4" />
                </span>
                <h3 className="font-bold text-sm text-foreground">Direct Resend Email Dispatch</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter your Resend API key here. The app directly contacts Resend's REST API from your localhost browser — no Edge Functions or deployment required!
              </p>

              <div className="mt-4 space-y-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="resend-key" className="text-xs font-semibold">
                    Resend API Key
                  </Label>
                  <Input
                    id="resend-key"
                    type="password"
                    placeholder="re_123456789..."
                    value={resendApiKey}
                    onChange={(e) => handleSaveResendKey(e.target.value)}
                    className="rounded-xl text-xs font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Get free API key at{" "}
                    <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-[#FF4B33] underline">
                      resend.com
                    </a>
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="sender-email" className="text-xs font-semibold">
                    Sender Email
                  </Label>
                  <Input
                    id="sender-email"
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="onboarding@resend.dev"
                    className="rounded-xl text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Use <code>onboarding@resend.dev</code> for test emails without a custom domain!
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-accent/30 p-3 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">What the client receives:</p>
                  <p>A branded HTML email with your company name, an onboarding button, and a link to set their password &amp; creative brief.</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        /* ACTIVE DIRECTORY */
        <div className="space-y-6">
          {[
            { title: "Team Members", list: team, badge: "Internal Team" },
            { title: "Client Portals", list: clientLogins, badge: "Client Account" },
          ].map(({ title, list, badge }) => (
            <div key={title} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-foreground">{title}</h2>
                <span className="text-xs text-muted-foreground">{list.length} accounts</span>
              </div>

              {list.length === 0 ? (
                <Card className="rounded-2xl border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                  No accounts registered yet.
                </Card>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {list.map((p) => (
                    <Card key={p.id} className="rounded-2xl border-border/70 p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-bold text-sm text-foreground truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {p.role === "client" ? (p.client?.name ? `Company: ${p.client.name}` : "Client") : (p.is_admin ? "Admin" : "Team Member")}
                          </p>
                        </div>
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shrink-0">
                          {p.role === "client" ? "Client" : p.is_admin ? "Admin" : "Team"}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
