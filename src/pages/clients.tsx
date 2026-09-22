import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { CommentThread } from "@/components/comment-thread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Client = { id: string; name: string };

export default function ClientsPage() {
  const { profile } = useAuth(); // RoleLayout guarantees a team profile
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => (error ? toast.error(error.message) : setClients(data)));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setName(""); // also disables the button, so a double click can't add it twice
    const { data, error } = await supabase.from("clients").insert({ name: n }).select("id, name").single();
    if (error) {
      setName(n);
      return toast.error(error.message);
    }
    setClients((cs) => [...(cs ?? []), data].sort((a, b) => a.name.localeCompare(b.name)));
    navigate(`/clients?c=${data.id}`);
  }

  if (!clients) return null;
  const selected = clients.find((x) => x.id === params.get("c")) ?? clients[0];

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <div className="grid min-w-0 content-start gap-3">
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New client…"
            aria-label="New client name"
          />
          <Button type="submit" disabled={!name.trim()}>
            Add
          </Button>
        </form>
        <nav aria-label="Clients" className="flex gap-1 overflow-x-auto md:flex-col">
          {clients.map((x) => (
            <Link
              key={x.id}
              to={`/clients?c=${x.id}`}
              aria-current={x.id === selected?.id ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                x.id === selected?.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {x.name}
            </Link>
          ))}
        </nav>
      </div>
      {selected ? (
        <section className="grid gap-3">
          <h1 className="text-2xl font-semibold">{selected.name}</h1>
          <CommentThread key={selected.id} clientId={selected.id} userId={profile!.id} />
        </section>
      ) : (
        <p className="py-16 text-center text-muted-foreground">No clients yet. Add your first one.</p>
      )}
    </div>
  );
}
