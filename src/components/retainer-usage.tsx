import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn, hoursMinutes, startOfMonth } from "@/lib/utils";

// "12h 30m of 40h retainer used this month". Totals come from hours_logged(), which
// is all a client can see of the time logs.
export function RetainerUsage({ clientId, retainerHours }: { clientId: string; retainerHours: number | null }) {
  const [hours, setHours] = useState<number | null>(null);

  useEffect(() => {
    setHours(null);
    supabase
      .rpc("hours_logged", { p_client: clientId, p_since: startOfMonth() })
      .then(({ data, error }) => !error && setHours(Number(data)));
  }, [clientId]);

  // skeleton, not a spinner: the loaded shape is known, so the page doesn't reflow
  if (hours === null)
    return (
      <div className="grid max-w-md gap-1.5">
        <p className="text-sm">
          <span className="inline-block h-4 w-44 animate-pulse rounded bg-muted align-middle" />
        </p>
        {!!retainerHours && <div className="h-1.5 animate-pulse rounded-full bg-muted" />}
      </div>
    );
  const used = hoursMinutes(hours * 3_600_000);
  if (!retainerHours) return <p className="text-sm text-muted-foreground">{used} logged this month</p>;

  const over = hours > retainerHours;
  return (
    <div className="grid max-w-md gap-1.5">
      {/* icon + words, so being over budget doesn't rely on red alone */}
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        {over && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />}
        <span>
          <span className={cn("font-medium", over ? "text-destructive" : "text-foreground")}>{used}</span> of{" "}
          {retainerHours}h retainer used this month
          {over && ` · over by ${hoursMinutes((hours - retainerHours) * 3_600_000)}`}
        </span>
      </p>
      <div
        role="progressbar"
        aria-label="Retainer hours used"
        aria-valuemin={0}
        aria-valuemax={retainerHours}
        aria-valuenow={Math.round(hours * 10) / 10}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-[#FF4B33]")}
          style={{ width: `${Math.min(100, (hours / retainerHours) * 100)}%` }}
        />
      </div>
    </div>
  );
}
