import { Clock, Download } from "lucide-react";
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

function Line({ name, ms, strong }: { name: string; ms: number; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 p-4 font-medium" : "flex justify-between gap-4 px-4 py-2 text-sm text-muted-foreground"}>
      <span className="min-w-0 truncate">{name}</span>
      <span className="shrink-0 tabular-nums">{hoursMinutes(ms)}</span>
    </div>
  );
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
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {rows ? (
              <>
                <span className="font-medium text-foreground">{hoursMinutes(total(rows))}</span> across{" "}
                {byClient.length} {byClient.length === 1 ? "client" : "clients"} · {rows.length}{" "}
                {rows.length === 1 ? "entry" : "entries"}
              </>
            ) : failed ? (
              "Couldn't load"
            ) : (
              "Loading…"
            )}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto">
          <Label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
            From
            <Input
              type="date"
              className="min-w-0"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value || r.from }))}
            />
          </Label>
          <Label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
            To
            <Input
              type="date"
              className="min-w-0"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value || r.to }))}
            />
          </Label>
          <Button variant="outline" className="col-span-2" onClick={exportCsv} disabled={!rows?.length}>
            <Download /> Export CSV
          </Button>
        </div>
      </div>

      {failed && (
        <Card>
          {/* a fresh range object is what re-runs the fetch effect */}
          <LoadFailed message={failed} onRetry={() => setRange((r) => ({ ...r }))} />
        </Card>
      )}

      {!failed && !rows && (
        <Card>
          <Loading />
        </Card>
      )}

      {rows?.length === 0 && (
        <Card>
          <div className="grid justify-items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Clock className="size-5" />
            No time logged in this range.
          </div>
        </Card>
      )}

      {!!rows?.length && (
        <div className="grid gap-8 md:grid-cols-[1fr_260px]">
          <section className="grid content-start gap-3">
            <h2 className="text-lg font-semibold">By client</h2>
            {byClient.map((c) => (
              <Card key={c.id} className="divide-y">
                <Line name={c.name} ms={c.ms} strong />
                {groups(c.rows, "user").map((p) => (
                  <Line key={p.id} name={p.name} ms={p.ms} />
                ))}
              </Card>
            ))}
          </section>
          <section className="grid content-start gap-3">
            <h2 className="text-lg font-semibold">By person</h2>
            <Card className="divide-y">
              {groups(rows, "user").map((p) => (
                <Line key={p.id} name={p.name} ms={p.ms} strong />
              ))}
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
