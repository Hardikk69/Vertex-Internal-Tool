import { BarChart3, Clock, Download, FileBarChart, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { Loading, LoadFailed } from "@/components/async-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { decimalHours, downloadCsv, groupBy, hoursMinutes, localDate, localTime } from "@/lib/utils";

type Row = {
  client_id: string;
  user_id: string;
  clock_in: string;
  clock_out: string;
  work_description: string;
  client: { name: string } | null;
  user: { name: string } | null;
};
type Group = { id: string; name: string; rows: Row[]; ms: number };

// Supabase returns at most "Max rows" (default 1000) per request, so page through.
// ponytail: keep PAGE ≤ the project's Max rows setting, or pages get skipped
const PAGE = 1000;

const ms = (r: Row) => new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime();
const total = (rows: Row[]) => rows.reduce((sum, r) => sum + ms(r), 0);

// rows per client or per person, most hours first
function groups(rows: Row[], by: "client" | "user"): Group[] {
  const key = (r: Row) => (by === "client" ? r.client_id : r.user_id);
  return [...groupBy(rows, key)]
    .map(([id, rs]) => ({ id, name: rs[0][by]?.name ?? "—", rows: rs, ms: total(rs) }))
    .sort((a, b) => b.ms - a.ms);
}

// Admin-only: everyone's finished time, by client and by person. RLS is what lets
// admins read other people's logs; for anyone else this would only show their own.
export default function ReportsPage() {
  const { profile } = useAuth();
  const today = localDate(new Date());
  const [range, setRange] = useState({ from: `${today.slice(0, 8)}01`, to: today }); // this month so far
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.is_admin) return;
    let stale = false;
    setFailed(null);
    (async () => {
      const all: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("time_logs")
          .select("client_id, user_id, clock_in, clock_out, work_description, client:clients(name), user:users(name)")
          .not("clock_out", "is", null)
          // date inputs are local days
          .gte("clock_in", new Date(`${range.from}T00:00`).toISOString())
          .lte("clock_in", new Date(`${range.to}T23:59:59.999`).toISOString())
          .order("clock_in")
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) {
          toast.error(error.message);
          if (!stale) setFailed(error.message);
          return;
        }
        // cast: without generated types supabase-js types the to-one embeds as arrays
        all.push(...(data as unknown as Row[]));
        if (data.length < PAGE) break;
      }
      if (!stale) setRows(all);
    })();
    return () => {
      stale = true;
    };
  }, [range, profile]);

  if (!profile?.is_admin) return <Navigate to="/time" replace />;

  const byClient = rows ? groups(rows, "client") : [];
  const byPerson = rows ? groups(rows, "user") : [];
  const totalMs = rows ? total(rows) : 0;

  function exportCsv() {
    downloadCsv(`vmh-hours-${range.from}-to-${range.to}.csv`, [
      ["Date", "Client", "Person", "Start", "End", "Hours", "Description"],
      ...rows!.map((r) => [
        localDate(r.clock_in),
        r.client?.name ?? "",
        r.user?.name ?? "",
        localTime(r.clock_in),
        localTime(r.clock_out),
        decimalHours(ms(r)),
        r.work_description,
      ]),
    ]);
  }

  return (
    <div className="space-y-5">
      {/* SaaS Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Vertex Agency</span>
            <span>/</span>
            <span className="font-semibold text-foreground">Reports</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#FF4B33]/15 text-[#FF4B33]">
              <FileBarChart className="size-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Time Reports
            </h1>
            {rows && (
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {rows.length} entries
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Agency-wide billable hours breakdown across all clients and team members.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="rounded-xl text-xs h-9 border-border/80"
            onClick={exportCsv}
            disabled={!rows?.length}
          >
            <Download className="mr-1.5 size-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Hours</span>
            <Clock className="size-3.5 text-blue-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">
              {rows ? hoursMinutes(totalMs) : "—"}
            </span>
            <span className="text-[11px] text-muted-foreground">logged</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Entries</span>
            <BarChart3 className="size-3.5 text-[#FF4B33]" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">
              {rows ? rows.length : "—"}
            </span>
            <span className="text-[11px] text-muted-foreground">time logs</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Clients</span>
            <TrendingUp className="size-3.5 text-emerald-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">
              {byClient.length}
            </span>
            <span className="text-[11px] text-muted-foreground">billed</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">Team</span>
            <Users className="size-3.5 text-purple-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">
              {byPerson.length}
            </span>
            <span className="text-[11px] text-muted-foreground">members</span>
          </div>
        </div>
      </div>

      {/* Date Range Filter Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 sm:grid-cols-2 backdrop-blur-md shadow-sm">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">From Date</Label>
          <Input
            type="date"
            className="h-9 rounded-xl bg-background/60 text-xs"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value || r.from }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">To Date</Label>
          <Input
            type="date"
            className="h-9 rounded-xl bg-background/60 text-xs"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value || r.to }))}
          />
        </div>
      </div>

      {/* Content */}
      {failed && (
        <Card className="rounded-2xl">
          {/* a fresh range object is what re-runs the fetch effect */}
          <LoadFailed message={failed} onRetry={() => setRange((r) => ({ ...r }))} />
        </Card>
      )}

      {!failed && !rows && (
        <Card className="rounded-2xl p-10">
          <Loading />
        </Card>
      )}

      {rows?.length === 0 && (
        <Card className="rounded-2xl border-dashed border-border/70 p-10">
          <div className="grid justify-items-center gap-2 text-center text-sm text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/60">
              <Clock className="size-6" />
            </div>
            <h3 className="mt-2 text-sm font-semibold text-foreground">No time logged</h3>
            <p className="text-xs text-muted-foreground">
              No entries found in this date range. Adjust the filters above.
            </p>
          </div>
        </Card>
      )}

      {!!rows?.length && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: By Client (7 cols) */}
          <section className="space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">By Client</h2>
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {byClient.length} clients
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {byClient.map((c) => {
                const personBreakdown = groups(c.rows, "user");
                const pct = totalMs ? Math.round((c.ms / totalMs) * 100) : 0;

                return (
                  <Card key={c.id} className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
                    {/* Client Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border/40">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#FF4B33]/15 text-sm font-bold text-[#FF4B33]">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {c.rows.length} entries · {personBreakdown.length} team member{personBreakdown.length !== 1 && "s"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-bold text-foreground">{hoursMinutes(c.ms)}</p>
                        <p className="text-[10px] text-muted-foreground">{pct}% of total</p>
                      </div>
                    </div>

                    {/* Usage Bar */}
                    <div className="px-4 pt-3 pb-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent/60">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#FF4B33] to-[#FF6B55] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Person Rows */}
                    <div className="divide-y divide-border/30 px-4">
                      {personBreakdown.map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-2.5 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-foreground">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate font-medium text-foreground/80">{p.name}</span>
                          </div>
                          <span className="shrink-0 font-mono font-semibold text-foreground/70 tabular-nums">
                            {hoursMinutes(p.ms)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Right Column: By Person (5 cols) */}
          <section className="space-y-4 lg:col-span-5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight">By Team Member</h2>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {byPerson.length} people
              </span>
            </div>

            <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm divide-y divide-border/40">
              {byPerson.map((p) => {
                const pct = totalMs ? Math.round((p.ms / totalMs) * 100) : 0;
                return (
                  <div key={p.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#FF4B33]/15 text-xs font-bold text-[#FF4B33]">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.rows.length} entries</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-bold text-foreground">{hoursMinutes(p.ms)}</p>
                        <p className="text-[10px] text-muted-foreground">{pct}%</p>
                      </div>
                    </div>

                    <div className="h-1 w-full overflow-hidden rounded-full bg-accent/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </Card>

            {/* Summary Card */}
            <Card className="rounded-2xl border-border/60 p-4 shadow-sm">
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Period Summary</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-accent/40 p-3 text-center">
                    <p className="font-mono text-lg font-bold text-foreground">{hoursMinutes(totalMs)}</p>
                    <p className="text-[10px] text-muted-foreground">Total Hours</p>
                  </div>
                  <div className="rounded-xl bg-accent/40 p-3 text-center">
                    <p className="font-mono text-lg font-bold text-foreground">
                      {rows.length ? hoursMinutes(Math.round(totalMs / byPerson.length)) : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Avg per Person</p>
                  </div>
                </div>
              </div>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
