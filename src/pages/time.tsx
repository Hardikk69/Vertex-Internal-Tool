import { 
  Calendar, 
  Clock, 
  Download, 
  History, 
  Loader2, 
  Pencil, 
  Play, 
  Plus, 
  Timer, 
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { Loading, LoadFailed } from "@/components/async-state";
import { TimeEntryDialog } from "@/components/time-entry-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { cn, decimalHours, downloadCsv, duration, groupBy, hoursMinutes, localDate, localTime } from "@/lib/utils";

type Client = { id: string; name: string; archived: boolean; retainer_hours?: number | null };
type Log = {
  id: string;
  client_id: string;
  clock_in: string;
  clock_out: string | null;
  work_description: string | null;
};

const COLS = "id, client_id, clock_in, clock_out, work_description";
const ALL = "all";
const elapsed = (log: Log, end = log.clock_out) =>
  (end ? new Date(end).getTime() : Date.now()) - new Date(log.clock_in).getTime();
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const sum = (logs: Log[]) => logs.reduce((ms, log) => ms + elapsed(log), 0);

export default function TimePage() {
  const { profile } = useAuth();
  const me = profile!.id;
  const [clients, setClients] = useState<Client[]>([]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const [active, setActive] = useState<Log | null>(null);
  const [history, setHistory] = useState<Log[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [filter, setFilter] = useState({ client: ALL, from: "", to: "" });
  const [stoppedAt, setStoppedAt] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Log | "new" | null>(null);
  const [, tick] = useState(0);
  const clientTrigger = useRef<HTMLButtonElement>(null);

  const localToday = localDate(new Date());

  const load = useCallback(async () => {
    let past = supabase
      .from("time_logs")
      .select(COLS)
      .eq("user_id", me)
      .not("clock_out", "is", null)
      .order("clock_in", { ascending: false })
      .limit(500);
    if (filter.client !== ALL) past = past.eq("client_id", filter.client);
    if (filter.from) past = past.gte("clock_in", new Date(`${filter.from}T00:00`).toISOString());
    if (filter.to) past = past.lte("clock_in", new Date(`${filter.to}T23:59:59.999`).toISOString());

    const [running, done] = await Promise.all([
      supabase.from("time_logs").select(COLS).eq("user_id", me).is("clock_out", null).maybeSingle(),
      past,
    ]);
    const error = running.error ?? done.error;
    if (error) {
      toast.error(error.message);
      return void setFailed(error.message);
    }
    setFailed(null);
    setActive(running.data);
    setHistory(done.data ?? []);
  }, [filter, me]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name, archived, retainer_hours")
      .order("name")
      .then(({ data, error }) => (error ? toast.error(error.message) : setClients(data ?? [])));
  }, []);

  // Timer ticker
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

  async function clockIn(targetClientId?: string) {
    const cId = targetClientId || clientId;
    if (!cId) {
      toast.error("Pick a client to start the timer.");
      clientTrigger.current?.focus();
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("time_logs")
      .insert({ client_id: cId, clock_in: new Date().toISOString() });
    setBusy(false);
    if (error)
      toast.error(error.code === "23505" ? "You already have a timer running." : error.message);
    else {
      toast.success(`Clocked in for ${clientName(cId)}`);
    }
    load();
  }

  async function clockOut() {
    if (!active || !stoppedAt) return;
    if (!description.trim()) return void toast.error("Add what you worked on first.");
    setBusy(true);
    const { data, error } = await supabase
      .from("time_logs")
      .update({ clock_out: stoppedAt, work_description: description.trim() })
      .eq("id", active.id)
      .select("id");
    setBusy(false);
    if (error) return void toast.error(error.message);
    if (!data.length) return void toast.error("Couldn't clock out: the timer wasn't updated.");
    toast.success(
      `Logged ${duration(elapsed(active, stoppedAt))} for ${clientName(active.client_id)}`,
    );
    setStoppedAt(null);
    setDescription("");
    load();
  }

  const total = sum(history ?? []);

  // Quick stats
  const todayLogs = useMemo(() => {
    return (history ?? []).filter((l) => localDate(l.clock_in) === localToday);
  }, [history, localToday]);

  const todayTime = sum(todayLogs) + (active ? elapsed(active) : 0);

  function exportCsv() {
    downloadCsv(`timesheet-${localDate(new Date())}.csv`, [
      ["Date", "Client", "Start", "End", "Hours", "Description"],
      ...[...(history ?? [])].reverse().map((log) => [
        localDate(log.clock_in),
        clientName(log.client_id),
        localTime(log.clock_in),
        localTime(log.clock_out!),
        decimalHours(elapsed(log)),
        log.work_description ?? "",
      ]),
    ]);
  }

  const activeClients = clients.filter((c) => !c.archived);

  return (
    <div className="grid gap-8">
      {/* Top Banner & Quick Metric Highlights */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Metric 1: Today's Time */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur-md">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#FF4B33]/15 text-[#FF4B33]">
            <Clock className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Today&apos;s Total</p>
            <p className="font-mono text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {hoursMinutes(todayTime)}
            </p>
          </div>
        </div>

        {/* Metric 2: Active Timer Status */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur-md">
          <div className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-2xl",
            active ? "bg-emerald-500/15 text-emerald-500" : "bg-accent text-muted-foreground"
          )}>
            <Timer className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Timer Status</p>
            <div className="flex items-center gap-2">
              <span className={cn(
                "size-2 rounded-full",
                active ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
              )} />
              <p className="truncate text-sm font-semibold text-foreground">
                {active ? clientName(active.client_id) : "Idle / Stopped"}
              </p>
            </div>
          </div>
        </div>

        {/* Metric 3: Filtered Total */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur-md">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-500">
            <History className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Filtered Timesheet</p>
            <p className="font-mono text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {hoursMinutes(total)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Stopwatch / Clock-In Hero Card */}
      <Card
        className={cn(
          "relative overflow-hidden rounded-3xl border transition-all duration-300 shadow-xl",
          active
            ? "border-[#FF4B33]/50 bg-gradient-to-br from-card via-card to-[#FF4B33]/10 shadow-[#FF4B33]/10"
            : "border-border/70 bg-gradient-to-br from-card to-card/60 shadow-black/5"
        )}
      >
        {active && (
          <div className="absolute inset-x-0 top-0 h-1.5 brand-gradient animate-pulse" />
        )}

        <CardContent className="p-6 sm:p-8">
          {active ? (
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#FF4B33]/15 px-3 py-1 text-xs font-semibold text-[#FF4B33]">
                  <span className="size-2 animate-ping rounded-full bg-[#FF4B33]" />
                  <span>Recording Session</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {clientName(active.client_id)}
                </h2>
                <p className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                  <Clock className="size-3.5" /> Started at {time(active.clock_in)} today
                </p>
              </div>

              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center md:items-end">
                <div className="rounded-2xl border border-border/60 bg-background/80 px-6 py-3 shadow-inner backdrop-blur-md">
                  <p className="font-mono text-4xl font-extrabold tracking-tight tabular-nums text-foreground sm:text-5xl">
                    {duration(elapsed(active))}
                  </p>
                </div>

                <Button
                  size="lg"
                  variant="destructive"
                  className="h-14 w-full rounded-2xl px-8 text-base font-semibold shadow-lg shadow-destructive/25 sm:w-auto"
                  onClick={() => setStoppedAt(new Date().toISOString())}
                >
                  Clock Out &amp; Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  Ready to track your work?
                </h2>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Select a client below or click a quick-start chip to start the live timer.
                </p>
              </div>

              {/* Quick Client Chips */}
              {activeClients.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Quick Launch:</p>
                  <div className="flex flex-wrap gap-2">
                    {activeClients.slice(0, 6).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setClientId(c.id);
                          clockIn(c.id);
                        }}
                        className="group flex items-center gap-1.5 rounded-xl border border-border/70 bg-accent/40 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-[#FF4B33]/50 hover:bg-[#FF4B33]/10 hover:text-[#FF4B33]"
                      >
                        <Play className="size-3 text-muted-foreground transition-colors group-hover:text-[#FF4B33]" />
                        <span>{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Selector Bar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger
                    ref={clientTrigger}
                    className="h-11 rounded-xl bg-background/60 text-sm font-medium sm:w-80"
                    aria-label="Client"
                  >
                    <SelectValue placeholder="Select client to clock in…" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  size="lg"
                  onClick={() => clockIn()}
                  disabled={busy}
                  aria-busy={busy}
                  className="brand-gradient h-11 rounded-xl px-6 font-semibold text-white shadow-md hover:opacity-95"
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Starting…
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 size-4 fill-current" /> Start Timer
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clock-Out Note Dialog */}
      <Dialog open={!!stoppedAt} onOpenChange={(open) => !open && setStoppedAt(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              clockOut();
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-xl">What did you accomplish?</DialogTitle>
              <DialogDescription>
                {active && stoppedAt && (
                  <span className="font-semibold text-foreground">
                    {clientName(active.client_id)} · {duration(elapsed(active, stoppedAt))}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor="work-desc" className="text-xs text-muted-foreground">
                Work description (required for client transparency)
              </Label>
              <Textarea
                id="work-desc"
                aria-label="Work description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Cut v2 of the launch reel, color grade, audio mixdown..."
                rows={4}
                className="rounded-xl text-sm"
                required
                autoFocus
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStoppedAt(null)}>
                Keep timer running
              </Button>
              <Button type="submit" disabled={busy} className="brand-gradient text-white">
                {busy ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save & Clock Out"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manual Entry Dialog */}
      {editing && (
        <TimeEntryDialog
          entry={editing === "new" ? null : editing}
          clients={clients}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {/* History & Filter Section */}
      <section className="grid gap-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground">Timesheet History</h2>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {history?.length ?? 0} entries
              </span>
            </div>
            {!!history?.length && (
              <p className="text-xs text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{hoursMinutes(total)}</span> across all matching entries
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="rounded-xl text-xs h-9" onClick={() => setEditing("new")}>
              <Plus className="mr-1 size-3.5" /> Add Manual Entry
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-xl text-xs h-9 text-muted-foreground hover:text-foreground"
              onClick={exportCsv}
              disabled={!history?.length}
            >
              <Download className="mr-1 size-3.5" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-card/40 p-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Client Filter</Label>
            <Select
              value={filter.client}
              onValueChange={(client) => setFilter((f) => ({ ...f, client }))}
            >
              <SelectTrigger className="h-9 rounded-xl bg-background/60 text-xs" aria-label="Filter by client">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">From Date</Label>
            <Input
              type="date"
              className="h-9 rounded-xl bg-background/60 text-xs"
              value={filter.from}
              onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">To Date</Label>
            <Input
              type="date"
              className="h-9 rounded-xl bg-background/60 text-xs"
              value={filter.to}
              onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
        </div>

        {/* Data View */}
        {failed ? (
          <Card className="rounded-2xl border-destructive/20 p-6">
            <LoadFailed
              message={failed}
              onRetry={() => {
                setFailed(null);
                load();
              }}
            />
          </Card>
        ) : !history ? (
          <Card className="rounded-2xl p-10">
            <Loading />
          </Card>
        ) : history.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-border/60 p-12 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
              <Clock className="size-6" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-foreground">No time logs found</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              No entries logged for these filter criteria. Start a timer or adjust the date range.
            </p>
          </Card>
        ) : (
          <div className="grid gap-6">
            {[...groupBy(history, (log) => day(log.clock_in))].map(([label, logs]) => (
              <div key={label} className="grid gap-2.5">
                {/* Date header bar */}
                <div className="flex items-center justify-between px-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-3.5 text-[#FF4B33]" />
                    <span className="font-semibold text-foreground">{label}</span>
                  </div>
                  <span className="font-mono font-bold text-foreground/80">
                    {hoursMinutes(sum(logs))}
                  </span>
                </div>

                <Card className="overflow-hidden rounded-2xl border-border/60 divide-y divide-border/40 shadow-sm">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="group flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-foreground">
                            {clientName(log.client_id)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {time(log.clock_in)} – {time(log.clock_out!)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm text-foreground/85">
                          {log.work_description || "No description provided"}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3 shrink-0 sm:justify-end">
                        <span className="font-mono text-sm font-bold text-foreground">
                          {hoursMinutes(elapsed(log))}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg text-muted-foreground opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100"
                          aria-label={`Edit ${clientName(log.client_id)} entry`}
                          onClick={() => setEditing(log)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
