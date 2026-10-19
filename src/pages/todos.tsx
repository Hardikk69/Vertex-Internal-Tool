import { CheckCircle2, Circle, ListTodo, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loading, LoadFailed } from "@/components/async-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Todo = { id: string; title: string; done: boolean; client_id: string | null };
type Client = { id: string; name: string; archived: boolean };
const NONE = "none"; // Radix Select can't use "" as an item value

// YYYY-MM-DD in the browser's timezone (the DB's current_date is UTC)
const localToday = () => new Date().toLocaleDateString("en-CA");

export default function TodosPage() {
  const [date, setDate] = useState(localToday);
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(NONE);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  const carried = useRef(false);
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const load = useCallback(async () => {
    if (!carried.current) {
      carried.current = true;
      // unfinished to-dos from earlier days move to today (local date, so it follows the user's midnight)
      const { error } = await supabase
        .from("todos")
        .update({ due_date: localToday() })
        .eq("done", false)
        .lt("due_date", localToday());
      if (error) toast.error(error.message);
    }
    const { data, error } = await supabase
      .from("todos")
      .select("id, title, done, client_id")
      .eq("due_date", date)
      .order("created_at");
    if (error) {
      toast.error(error.message);
      setFailed(error.message);
    } else {
      setFailed(null);
      setTodos(data);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name, archived")
      .order("name")
      .then(({ data, error }) => (error ? toast.error(error.message) : setClients(data)));
  }, []);

  useEffect(() => {
    const timers = pending.current;
    // cancel on unmount rather than flush: an undeleted to-do is recoverable,
    // a wrongly deleted one isn't
    return () => timers.forEach(clearTimeout);
  }, []);

  async function run(query: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await query;
    if (error) toast.error(error.message);
    load();
  }

  // Undo beats a confirm dialog here: the row goes now, the DB delete fires in 5s,
  // and Undo just cancels the timer.
  // ponytail: a tab closed inside the window leaves the to-do undeleted; add a
  // soft-delete column if that ever matters
  function remove(t: Todo) {
    setTodos((ts) => ts?.filter((x) => x.id !== t.id) ?? null);
    pending.current.set(
      t.id,
      setTimeout(() => {
        pending.current.delete(t.id);
        run(supabase.from("todos").delete().eq("id", t.id));
      }, 5000),
    );
    toast(`Deleted "${t.title}"`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(pending.current.get(t.id));
          pending.current.delete(t.id);
          load();
        },
      },
    });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    // the button stays enabled, so focus the field that's blocking instead
    if (!title.trim()) return titleInput.current?.focus();
    run(
      supabase
        .from("todos")
        .insert({ title: title.trim(), due_date: date, client_id: clientId === NONE ? null : clientId }),
    );
    setTitle("");
  }

  function toggle(t: Todo) {
    setTodos((ts) => ts?.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) ?? null);
    run(supabase.from("todos").update({ done: !t.done }).eq("id", t.id));
  }

  const isToday = date === localToday();
  const total = todos?.length ?? 0;
  const done = todos?.filter((t) => t.done).length ?? 0;
  const left = total - done;

  // Filter todos by search
  const filtered = todos?.filter((t) =>
    search ? t.title.toLowerCase().includes(search.toLowerCase()) : true,
  );

  const dateLabel = isToday
    ? "Today"
    : new Date(`${date}T00:00`).toLocaleDateString([], {
        weekday: "long",
        month: "short",
        day: "numeric",
      });

  return (
    <div className="space-y-5">
      {/* SaaS Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Vertex Agency</span>
            <span>/</span>
            <span className="font-semibold text-foreground">Tasks</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {dateLabel}&apos;s Tasks
          </h1>
          <p className="text-xs text-muted-foreground">
            {!todos
              ? "Loading tasks…"
              : todos.length
                ? `${left} pending · ${done} completed · ${total} total`
                : "No tasks planned yet. Add one below."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Day"
            value={date}
            onChange={(e) => setDate(e.target.value || localToday())}
            className="w-auto h-9 rounded-xl text-xs bg-card border-border/80"
          />
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Pending</span>
            <Circle className="size-3.5 text-amber-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">{left}</span>
            <span className="text-[11px] text-muted-foreground">tasks</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Completed</span>
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">{done}</span>
            <span className="text-[11px] text-muted-foreground">done</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total</span>
            <ListTodo className="size-3.5 text-blue-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">{total}</span>
            <span className="text-[11px] text-muted-foreground">tasks</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Day Progress</span>
            <span className="font-mono font-semibold text-foreground">
              {total ? Math.round((done / total) * 100) : 0}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-accent/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Add Task Form & Search */}
      <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur-md space-y-3">
        <form onSubmit={add} className="flex gap-2">
          <Input
            ref={titleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to get done…"
            aria-label="New to-do"
            className="h-10 rounded-xl bg-background/60 text-sm"
          />
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-36 shrink-0 sm:w-44 h-10 rounded-xl text-xs bg-background/60 border-border/80" aria-label="Client (optional)">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No client</SelectItem>
              {clients
                .filter((c) => !c.archived)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button type="submit" className="h-10 rounded-xl brand-gradient text-white font-semibold shadow-md px-5">
            <Plus className="mr-1.5 size-4" /> Add
          </Button>
        </form>

        {/* Search Filter */}
        {total > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="h-9 pl-9 rounded-xl bg-background/60 text-xs"
            />
          </div>
        )}
      </div>

      {/* Task List */}
      {failed ? (
        <Card className="rounded-2xl">
          <LoadFailed
            message={failed}
            onRetry={() => {
              setFailed(null);
              load();
            }}
          />
        </Card>
      ) : !todos ? (
        <Loading className="py-6" />
      ) : filtered && filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:border-[#FF4B33]/40",
                t.done && "opacity-60 bg-muted/30",
              )}
            >
              <Checkbox
                id={t.id}
                checked={t.done}
                onCheckedChange={() => toggle(t)}
                className="size-5"
              />
              <label
                htmlFor={t.id}
                className={cn(
                  "flex-1 cursor-pointer text-sm font-medium text-foreground",
                  t.done && "text-muted-foreground line-through",
                )}
              >
                {t.title}
              </label>
              {t.client_id && (
                <span className="rounded-md bg-accent/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {clients.find((c) => c.id === t.client_id)?.name}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete "${t.title}"`}
                onClick={() => remove(t)}
                className="size-8 rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Card className="rounded-2xl border-dashed border-border/70 p-10">
          <div className="grid justify-items-center gap-2 text-center text-sm text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/60">
              <ListTodo className="size-6" />
            </div>
            <h3 className="mt-2 text-sm font-semibold text-foreground">
              {search ? "No matching tasks" : "Nothing planned for this day"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {search
                ? "Try a different search term."
                : "Add your first task above to get started."}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
