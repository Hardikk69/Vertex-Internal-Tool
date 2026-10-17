import { 
  ArrowUpRight, 
  CheckCircle2, 
  CircleDot, 
  Clock, 
  Flame, 
  Layers, 
  ListTodo, 
  MessageSquare, 
  Play, 
  Plus, 
  TrendingUp, 
  Users 
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { Loading } from "@/components/async-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn, duration, hoursMinutes, localDate } from "@/lib/utils";

type Client = { id: string; name: string; archived: boolean; retainer_hours: number | null };
type ActiveLog = { id: string; client_id: string; clock_in: string };
type TodoItem = { id: string; title: string; done: boolean; client_id: string | null };
type RecentLog = { id: string; client_id: string; clock_in: string; clock_out: string; work_description: string | null };

export default function DashboardPage() {
  const { profile } = useAuth();
  const me = profile?.id;

  const [clients, setClients] = useState<Client[]>([]);
  const [activeTimer, setActiveTimer] = useState<ActiveLog | null>(null);
  const [todayHours, setTodayHours] = useState<number>(0);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [clockInClientId, setClockInClientId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [, tick] = useState(0);

  const localToday = localDate(new Date());

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Re-render active timer elapsed seconds
  useEffect(() => {
    if (!activeTimer) return;
    const interval = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  const loadData = useCallback(async () => {
    if (!me) return;
    try {
      const todayStartIso = new Date(`${localToday}T00:00:00`).toISOString();

      // Fetch running timer + today's logs + recent logs + todos + clients in parallel
      const [timerRes, logsRes, recentRes, todosRes, clientsRes] = await Promise.all([
        supabase
          .from("time_logs")
          .select("id, client_id, clock_in")
          .eq("user_id", me)
          .is("clock_out", null)
          .maybeSingle(),
        supabase
          .from("time_logs")
          .select("clock_in, clock_out")
          .eq("user_id", me)
          .not("clock_out", "is", null)
          .gte("clock_in", todayStartIso),
        supabase
          .from("time_logs")
          .select("id, client_id, clock_in, clock_out, work_description")
          .eq("user_id", me)
          .not("clock_out", "is", null)
          .order("clock_in", { ascending: false })
          .limit(5),
        supabase
          .from("todos")
          .select("id, title, done, client_id")
          .eq("due_date", localToday)
          .order("created_at"),
        supabase
          .from("clients")
          .select("id, name, archived, retainer_hours")
          .eq("archived", false)
          .order("name"),
      ]);

      if (timerRes.data) setActiveTimer(timerRes.data);
      else setActiveTimer(null);

      if (logsRes.data) {
        const ms = logsRes.data.reduce((acc, row) => {
          return acc + (new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime());
        }, 0);
        setTodayHours(ms);
      }

      if (recentRes.data) {
        setRecentLogs(recentRes.data as RecentLog[]);
      }

      if (todosRes.data) setTodos(todosRes.data);
      if (clientsRes.data) setClients(clientsRes.data);
    } catch (e) {
      console.error("Dashboard load failed", e);
    } finally {
      setLoading(false);
    }
  }, [me, localToday]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Quick clock in from dashboard
  const handleQuickClockIn = async () => {
    if (!clockInClientId) return toast.error("Select a client to clock in.");
    const { error } = await supabase
      .from("time_logs")
      .insert({ client_id: clockInClientId, clock_in: new Date().toISOString() });
    if (error) toast.error(error.message);
    else {
      toast.success("Timer started!");
      loadData();
    }
  };

  // Toggle todo directly
  const toggleTodo = async (todo: TodoItem) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)),
    );
    await supabase.from("todos").update({ done: !todo.done }).eq("id", todo.id);
  };

  // Quick add todo
  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim()) return;
    const { data, error } = await supabase
      .from("todos")
      .insert({
        title: newTodoTitle.trim(),
        due_date: localToday,
        client_id: null,
      })
      .select("id, title, done, client_id")
      .single();

    if (error) toast.error(error.message);
    else if (data) {
      setTodos((prev) => [...prev, data]);
      setNewTodoTitle("");
      toast.success("To-do added for today");
    }
  };

  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? "Internal";

  const timerDuration = activeTimer
    ? duration(Date.now() - new Date(activeTimer.clock_in).getTime())
    : "00:00:00";

  const pendingTodos = todos.filter((t) => !t.done);

  if (loading) return <Loading className="py-20" />;

  return (
    <div className="grid gap-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900 p-6 text-white shadow-2xl dark:border-white/10 sm:p-8">
        <div className="hero-checker absolute inset-0 opacity-15" />
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[#FF4B33] backdrop-blur-md">
              <Flame className="size-3.5 fill-[#FF4B33]" />
              <span>Vertex Media House · Workspace</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {greeting}, {profile?.name ?? "Team"} 👋
            </h1>
            <p className="text-xs text-neutral-400 sm:text-sm">
              Today is{" "}
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
              . Here is your overview for today.
            </p>
          </div>

          {/* Quick Active Timer or Clock-in widget */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl md:min-w-72">
            {activeTimer ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
                    Tracking Time
                  </span>
                  <span className="font-medium text-white">{clientName(activeTimer.client_id)}</span>
                </div>
                <div className="font-mono text-3xl font-extrabold tracking-tight text-white">
                  {timerDuration}
                </div>
                <Button asChild size="sm" className="w-full brand-gradient text-white">
                  <Link to="/time">
                    <Clock className="mr-1.5 size-3.5" /> Manage &amp; Clock Out
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Quick Clock In</span>
                  <span className="text-neutral-500">Pick client</span>
                </div>
                <div className="flex gap-2">
                  <Select value={clockInClientId} onValueChange={setClockInClientId}>
                    <SelectTrigger className="h-8 border-white/10 bg-neutral-800/80 text-xs text-white">
                      <SelectValue placeholder="Pick client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={handleQuickClockIn}
                    disabled={!clockInClientId}
                    className="h-8 brand-gradient shrink-0 px-3 text-white"
                  >
                    <Play className="size-3 fill-current" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {/* Stat 1: Today's Time */}
        <Card className="relative overflow-hidden rounded-2xl border-border/60 bg-card/60 backdrop-blur-md">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Logged Today</span>
              <span className="flex size-7 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                <Clock className="size-4" />
              </span>
            </div>
            <div className="mt-3 font-mono text-xl font-bold sm:text-2xl">
              {hoursMinutes(todayHours)}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {activeTimer ? "Active timer running" : "From completed entries"}
            </p>
          </CardContent>
        </Card>

        {/* Stat 2: Active Clients */}
        <Card className="relative overflow-hidden rounded-2xl border-border/60 bg-card/60 backdrop-blur-md">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Active Clients</span>
              <span className="flex size-7 items-center justify-center rounded-xl bg-[#FF4B33]/15 text-[#FF4B33]">
                <Users className="size-4" />
              </span>
            </div>
            <div className="mt-3 font-mono text-xl font-bold sm:text-2xl">
              {clients.length}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {clients.filter((c) => c.retainer_hours).length} with monthly retainers
            </p>
          </CardContent>
        </Card>

        {/* Stat 3: To-dos left */}
        <Card className="relative overflow-hidden rounded-2xl border-border/60 bg-card/60 backdrop-blur-md">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Tasks Left</span>
              <span className="flex size-7 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <ListTodo className="size-4" />
              </span>
            </div>
            <div className="mt-3 font-mono text-xl font-bold sm:text-2xl">
              {pendingTodos.length}{" "}
              <span className="text-xs font-normal text-muted-foreground">/ {todos.length}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {todos.length === 0
                ? "No tasks set"
                : pendingTodos.length === 0
                  ? "All caught up! 🎉"
                  : "Due today"}
            </p>
          </CardContent>
        </Card>

        {/* Stat 4: Timesheet Shortcut */}
        <Card className="relative overflow-hidden rounded-2xl border-border/60 bg-card/60 backdrop-blur-md">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Recent Entries</span>
              <span className="flex size-7 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <TrendingUp className="size-4" />
              </span>
            </div>
            <div className="mt-3 font-mono text-xl font-bold sm:text-2xl">{recentLogs.length}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Saved in your history
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Recent Activity & Today's Checklist */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Recent Time Logs (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight">Recent Activity</h2>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                Your logs
              </span>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
              <Link to="/time">
                All logs <ArrowUpRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-3">
            {recentLogs.length === 0 ? (
              <Card className="rounded-2xl border-border/60 p-6 text-center text-sm text-muted-foreground">
                No recent time logs yet. Clock in to get started!
              </Card>
            ) : (
              recentLogs.map((log) => {
                const durationMs = new Date(log.clock_out).getTime() - new Date(log.clock_in).getTime();
                return (
                  <div
                    key={log.id}
                    className="group flex flex-col justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:border-[#FF4B33]/40 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-foreground">
                          {clientName(log.client_id)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.clock_in).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="truncate text-sm font-medium text-foreground">
                        {log.work_description || "No description provided"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs font-semibold text-foreground/90">
                        {hoursMinutes(durationMs)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Today's Action Checklist (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">Today&apos;s Focus</h2>
            <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
              <Link to="/todos">
                Full list <ArrowUpRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          </div>

          <Card className="rounded-2xl border-border/60 p-4 shadow-sm">
            {/* Quick Add To-do Input */}
            <form onSubmit={handleAddTodo} className="flex gap-2 mb-3">
              <Input
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                placeholder="Add task for today…"
                className="text-xs h-9 bg-background/60"
              />
              <Button type="submit" size="sm" className="h-9 px-3 shrink-0 brand-gradient text-white" disabled={!newTodoTitle.trim()}>
                <Plus className="size-3.5" />
              </Button>
            </form>

            {/* Todo Items */}
            {todos.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No tasks yet for today. Add one above!
              </div>
            ) : (
              <ul className="divide-y divide-border/40 max-h-72 overflow-y-auto">
                {todos.map((todo) => (
                  <li
                    key={todo.id}
                    className="flex items-center gap-2.5 py-2 px-1 text-xs transition-colors hover:bg-accent/40 rounded-lg"
                  >
                    <Checkbox
                      checked={todo.done}
                      onCheckedChange={() => toggleTodo(todo)}
                      id={`dash-todo-${todo.id}`}
                    />
                    <label
                      htmlFor={`dash-todo-${todo.id}`}
                      className={cn(
                        "flex-1 cursor-pointer truncate",
                        todo.done && "line-through text-muted-foreground",
                      )}
                    >
                      {todo.title}
                    </label>
                    {todo.client_id && (
                      <span className="truncate rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {clientName(todo.client_id)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-3 gap-2">
            <Link
              to="/people"
              className="flex items-center gap-2 rounded-xl border border-border/70 bg-card p-3 text-xs font-semibold text-foreground transition-all hover:border-[#FF4B33]/40 hover:bg-[#FF4B33]/5"
            >
              <Users className="size-4 text-[#FF4B33]" />
              <span className="truncate">Onboard Client</span>
            </Link>
            <Link
              to="/clients"
              className="flex items-center gap-2 rounded-xl border border-border/70 bg-card p-3 text-xs font-semibold text-foreground transition-all hover:border-[#FF4B33]/40 hover:bg-accent/50"
            >
              <MessageSquare className="size-4 text-blue-500" />
              <span className="truncate">Threads</span>
            </Link>
            <Link
              to="/time"
              className="flex items-center gap-2 rounded-xl border border-border/70 bg-card p-3 text-xs font-semibold text-foreground transition-all hover:border-[#FF4B33]/40 hover:bg-accent/50"
            >
              <Clock className="size-4 text-emerald-500" />
              <span className="truncate">Timesheet</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
