import { ListTodo, Trash2 } from "lucide-react";
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
    toast(`Deleted “${t.title}”`, {
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
  const left = todos?.filter((t) => !t.done).length ?? 0;

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {isToday
              ? "Today"
              : new Date(`${date}T00:00`).toLocaleDateString([], {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {!todos
              ? "Loading…"
              : todos.length
                ? `${left} of ${todos.length} left`
                : "Nothing planned yet."}
          </p>
        </div>
        <Input
          type="date"
          aria-label="Day"
          value={date}
          onChange={(e) => setDate(e.target.value || localToday())}
          className="w-auto"
        />
      </div>

      <form onSubmit={add} className="flex gap-2">
        <Input
          ref={titleInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a to-do…"
          aria-label="New to-do"
        />
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-32 shrink-0 sm:w-40" aria-label="Client (optional)">
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
        <Button type="submit">Add</Button>
      </form>

      {failed ? (
        <Card>
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
      ) : todos.length > 0 ? (
        <Card>
          <ul className="divide-y">
            {todos.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                <Checkbox id={t.id} checked={t.done} onCheckedChange={() => toggle(t)} />
                <label
                  htmlFor={t.id}
                  className={cn(
                    "flex-1 cursor-pointer py-1.5 text-sm",
                    t.done && "text-muted-foreground line-through",
                  )}
                >
                  {t.title}
                  {t.client_id && (
                    <span className="ml-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {clients.find((c) => c.id === t.client_id)?.name}
                    </span>
                  )}
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete "${t.title}"`}
                  onClick={() => remove(t)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <div className="grid justify-items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <ListTodo className="size-5" />
            Nothing planned for this day yet.
          </div>
        </Card>
      )}
    </div>
  );
}
