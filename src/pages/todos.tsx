import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Todo = { id: string; title: string; done: boolean };

// YYYY-MM-DD in the browser's timezone (the DB's current_date is UTC)
const localToday = () => new Date().toLocaleDateString("en-CA");

export default function TodosPage() {
  const [date, setDate] = useState(localToday);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("todos")
      .select("id, title, done")
      .eq("due_date", date)
      .order("created_at");
    if (error) toast.error(error.message);
    else setTodos(data);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(query: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await query;
    if (error) toast.error(error.message);
    load();
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    run(supabase.from("todos").insert({ title: title.trim(), due_date: date }));
    setTitle("");
  }

  function toggle(t: Todo) {
    setTodos((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    run(supabase.from("todos").update({ done: !t.done }).eq("id", t.id));
  }

  const isToday = date === localToday();
  const left = todos.filter((t) => !t.done).length;

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
            {todos.length ? `${left} of ${todos.length} left` : "Nothing planned yet."}
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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a to-do…"
          aria-label="New to-do"
        />
        <Button type="submit" disabled={!title.trim()}>
          Add
        </Button>
      </form>

      {todos.length > 0 && (
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
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete "${t.title}"`}
                  onClick={() => run(supabase.from("todos").delete().eq("id", t.id))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
