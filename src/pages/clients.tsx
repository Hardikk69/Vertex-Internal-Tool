import { Building2, Loader2, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { Loading, LoadFailed } from "@/components/async-state";
import { BriefForm } from "@/components/brief-form";
import { CommentThread } from "@/components/comment-thread";
import { RetainerUsage } from "@/components/retainer-usage";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Client = { id: string; name: string; archived: boolean; retainer_hours: number | null };

// Rename, set the monthly retainer, archive. Mounted only while open.
function EditClientDialog({ client, onClose, onSaved }: { client: Client; onClose: () => void; onSaved: () => void }) {
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
    if (!data.length) return void toast.error("Couldn't save: the client wasn't updated.");
    toast.success("Client updated");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-xl">
        <form className="grid gap-4" onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Edit client</DialogTitle>
            <DialogDescription>Archived clients are hidden from lists; their history stays.</DialogDescription>
          </DialogHeader>
          <Label className="grid gap-1 text-xs text-muted-foreground">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Label>
          <Label className="grid gap-1 text-xs text-muted-foreground">
            Retainer hours per month (optional)
            <Input
              type="number"
              min="0.5"
              step="0.5"
              inputMode="decimal"
              value={retainer}
              onChange={(e) => setRetainer(e.target.value)}
              placeholder="e.g. 40"
            />
          </Label>
          <Label className="flex items-center gap-2 text-sm">
            <Checkbox checked={archived} onCheckedChange={(v) => setArchived(v === true)} />
            Archived
          </Label>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientsPage() {
  const { profile } = useAuth(); // RoleLayout guarantees a team profile
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [briefs, setBriefs] = useState<Record<string, string | null>>({}); // client id -> submitted_at
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);

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
  }, []);

  const loadUnread = useCallback(async () => {
    const { data, error } = await supabase.rpc("unread_counts");
    if (!error) setUnread(Object.fromEntries((data as { client_id: string; unread: number }[]).map((r) => [r.client_id, r.unread])));
  }, []);

  useEffect(() => {
    load();
    supabase
      .from("client_briefs")
      .select("client_id, submitted_at")
      .then(({ data, error }) => {
        if (!error) setBriefs(Object.fromEntries(data.map((b) => [b.client_id, b.submitted_at])));
      });
  }, [load]);

  // any new message anywhere can change the badges
  useEffect(() => {
    const channel = supabase
      .channel("comments:unread")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_comments" }, loadUnread)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadUnread]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    // the button stays enabled, so focus the field that's blocking instead
    if (!n) return nameInput.current?.focus();
    setName(""); // also disables the button, so a double click can't add it twice
    const { data, error } = await supabase
      .from("clients")
      .insert({ name: n })
      .select("id, name, archived, retainer_hours")
      .single();
    if (error) {
      setName(n);
      return void toast.error(error.message);
    }
    setClients((cs) => [...(cs ?? []), data].sort((a, b) => a.name.localeCompare(b.name)));
    navigate(`/clients?c=${data.id}`);
  }

  const tab = params.get("tab") === "brief" ? "brief" : "messages";
  const visible = clients?.filter((x) => showArchived || !x.archived) ?? [];
  const selected = clients?.find((x) => x.id === params.get("c")) ?? visible[0];
  const archivedCount = clients?.filter((x) => x.archived).length ?? 0;

  // refetch badges when switching threads: the one you just left has been marked read
  useEffect(() => {
    loadUnread();
  }, [loadUnread, selected?.id]);

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
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <div className="grid min-w-0 content-start gap-3">
        <form onSubmit={add} className="flex gap-2">
          <Input
            ref={nameInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New client…"
            aria-label="New client name"
          />
          <Button type="submit">Add</Button>
        </form>
        <nav aria-label="Clients" className="flex gap-1 overflow-x-auto md:flex-col">
          {visible.map((x) => {
            // the open thread is being read, so it never shows a badge
            const n = x.id === selected?.id ? 0 : (unread[x.id] ?? 0);
            return (
              <Link
                key={x.id}
                to={`/clients?c=${x.id}`}
                aria-current={x.id === selected?.id ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                  x.id === selected?.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  n > 0 && "font-medium text-foreground",
                )}
              >
                <span className="truncate">{x.name}</span>
                {x.archived && <span className="text-xs text-muted-foreground">(archived)</span>}
                {n > 0 && (
                  <span className="ml-auto rounded-full bg-[#FF4B33] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {n}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        {archivedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start text-muted-foreground"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
          </Button>
        )}
      </div>
      {selected ? (
        <section className="grid content-start gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="grid min-w-0 gap-2">
              <h1 className="text-2xl font-semibold">
                {selected.name}
                {selected.archived && <span className="ml-2 text-sm font-normal text-muted-foreground">Archived</span>}
              </h1>
              <RetainerUsage
                key={`${selected.id}:${selected.retainer_hours}`}
                clientId={selected.id}
                retainerHours={selected.retainer_hours}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          </div>
          <div className="flex gap-1 text-sm">
            {(["messages", "brief"] as const).map((t) => (
              <Link
                key={t}
                to={`/clients?c=${selected.id}${t === "brief" ? "&tab=brief" : ""}`}
                aria-current={t === tab ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 capitalize transition-colors",
                  t === tab ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
                {t === "brief" && !briefs[selected.id] && (
                  <span className="ml-2 text-xs text-muted-foreground">pending</span>
                )}
              </Link>
            ))}
          </div>
          {tab === "brief" ? (
            <BriefForm
              key={selected.id}
              clientId={selected.id}
              onSaved={(at) => setBriefs((b) => ({ ...b, [selected.id]: at }))}
            />
          ) : (
            <CommentThread key={selected.id} clientId={selected.id} userId={profile!.id} />
          )}
          {editing && (
            <EditClientDialog
              client={selected}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                load();
              }}
            />
          )}
        </section>
      ) : (
        <div className="grid justify-items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <Building2 className="size-5" />
          No clients yet. Add your first one.
        </div>
      )}
    </div>
  );
}
