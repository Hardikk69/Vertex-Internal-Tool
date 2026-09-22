import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { CommentThread } from "@/components/comment-thread";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Client = { id: string; name: string };

export default function ClientsPage() {
  const { profile } = useAuth(); // RoleLayout guarantees a team profile
  const [params] = useSearchParams();
  const [clients, setClients] = useState<Client[] | null>(null);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => (error ? toast.error(error.message) : setClients(data)));
  }, []);

  if (!clients) return null;
  const selected = clients.find((x) => x.id === params.get("c")) ?? clients[0];
  if (!selected)
    return (
      <p className="py-16 text-center text-muted-foreground">
        No clients yet. Add them in Supabase (see README).
      </p>
    );

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <nav aria-label="Clients" className="flex gap-1 overflow-x-auto md:flex-col">
        {clients.map((x) => (
          <Link
            key={x.id}
            to={`/clients?c=${x.id}`}
            aria-current={x.id === selected.id ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
              x.id === selected.id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {x.name}
          </Link>
        ))}
      </nav>
      <section className="grid gap-3">
        <h1 className="text-2xl font-semibold">{selected.name}</h1>
        <CommentThread key={selected.id} clientId={selected.id} userId={profile!.id} />
      </section>
    </div>
  );
}
