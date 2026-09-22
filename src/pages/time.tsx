import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { duration } from "@/lib/utils";

type Client = { id: string; name: string };
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

export default function TimePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const [active, setActive] = useState<Log | null>(null);
  const [history, setHistory] = useState<Log[]>([]);
  const [clientId, setClientId] = useState("");
  const [filter, setFilter] = useState({ client: ALL, from: "", to: "" });
  const [stoppedAt, setStoppedAt] = useState<string | null>(null); // set = clock-out dialog open
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    // ponytail: capped at 500 rows, paginate if a filter ever needs more
    let past = supabase
      .from("time_logs")
      .select(COLS)
      .not("clock_out", "is", null)
      .order("clock_in", { ascending: false })
      .limit(500);
    if (filter.client !== ALL) past = past.eq("client_id", filter.client);
    // date inputs are local days
    if (filter.from) past = past.gte("clock_in", new Date(`${filter.from}T00:00`).toISOString());
    if (filter.to) past = past.lte("clock_in", new Date(`${filter.to}T23:59:59.999`).toISOString());

    const [running, done] = await Promise.all([
      supabase.from("time_logs").select(COLS).is("clock_out", null).maybeSingle(),
      past,
    ]);
    const error = running.error ?? done.error;
    if (error) return void toast.error(error.message);
    setActive(running.data);
    setHistory(done.data ?? []);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => (error ? toast.error(error.message) : setClients(data)));
  }, []);

  // re-render every second while the timer runs
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

  async function clockIn() {
    setBusy(true);
    // clock_in from the same clock as clock_out, so durations never go negative
    const { error } = await supabase
      .from("time_logs")
      .insert({ client_id: clientId, clock_in: new Date().toISOString() });
    setBusy(false);
    if (error)
      toast.error(error.code === "23505" ? "You already have a timer running." : error.message);
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
    // RLS drops a disallowed update silently (no error, zero rows), so check it landed
    if (!data.length) return void toast.error("Couldn't clock out: the timer wasn't updated.");
    toast.success(
      `Logged ${duration(elapsed(active, stoppedAt))} for ${clientName(active.client_id)}`,
    );
    setStoppedAt(null);
    setDescription("");
    load();
  }

  const total = history.reduce((sum, log) => sum + elapsed(log), 0);

  return (
    <div className="grid gap-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {active ? `Working on ${clientName(active.client_id)}` : "Clock in"}
          </CardTitle>
          <CardDescription>
            {active ? `Started at ${time(active.clock_in)}` : "Pick a client to start the timer."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {active ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="font-mono text-5xl font-semibold tabular-nums tracking-tight">
                {duration(elapsed(active))}
              </p>
              <Button
                size="lg"
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={() => setStoppedAt(new Date().toISOString())}
              >
                Clock out
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="min-w-0 flex-1 sm:w-64 sm:flex-none" aria-label="Client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={clockIn} disabled={!clientId || busy}>
                Clock in
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!stoppedAt} onOpenChange={(open) => !open && setStoppedAt(null)}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-xl">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              clockOut();
            }}
          >
            <DialogHeader>
              <DialogTitle>What did you work on?</DialogTitle>
              <DialogDescription>
                {active &&
                  stoppedAt &&
                  `${clientName(active.client_id)} · ${duration(elapsed(active, stoppedAt))}`}
              </DialogDescription>
            </DialogHeader>
            <Textarea
              aria-label="Work description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Cut v2 of the launch reel, color pass"
              rows={4}
              required
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setStoppedAt(null)}>
                Keep timer running
              </Button>
              <Button type="submit" disabled={busy}>
                Save &amp; clock out
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">History</h2>
          <div className="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto">
            <Select
              value={filter.client}
              onValueChange={(client) => setFilter((f) => ({ ...f, client }))}
            >
              <SelectTrigger className="col-span-2 sm:w-44" aria-label="Filter by client">
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
            <Label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              From
              <Input
                type="date"
                className="min-w-0"
                value={filter.from}
                onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value }))}
              />
            </Label>
            <Label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              To
              <Input
                type="date"
                className="min-w-0"
                value={filter.to}
                onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value }))}
              />
            </Label>
          </div>
        </div>

        <Card className="overflow-hidden">
          {history.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No time logged for these filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="hidden sm:table-cell">In</TableHead>
                  <TableHead className="hidden sm:table-cell">Out</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden sm:table-cell">Work</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="align-top">
                      <p className="font-medium">{clientName(log.client_id)}</p>
                      <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:hidden">
                        <p>
                          {new Date(log.clock_in).toLocaleDateString()} · {time(log.clock_in)} –{" "}
                          {time(log.clock_out!)}
                        </p>
                        <p className="whitespace-pre-wrap text-sm">{log.work_description}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      {new Date(log.clock_in).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      {time(log.clock_in)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      {time(log.clock_out!)}
                    </TableCell>
                    <TableCell className="text-right align-top font-mono tabular-nums sm:align-middle">
                      {duration(elapsed(log))}
                    </TableCell>
                    <TableCell className="hidden min-w-64 whitespace-pre-wrap text-muted-foreground sm:table-cell">
                      {log.work_description}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  {/* hidden cells, not colSpan, so the row still lines up on phones */}
                  <TableCell colSpan={3} className="hidden sm:table-cell" />
                  <TableCell className="text-right font-mono tabular-nums">
                    {duration(total)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell" />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </Card>
      </section>
    </div>
  );
}
