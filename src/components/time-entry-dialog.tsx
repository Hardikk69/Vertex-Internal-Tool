import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { hoursMinutes, localDate, localTime } from "@/lib/utils";

type Entry = { id: string; client_id: string; clock_in: string; clock_out: string | null; work_description: string | null };

// Add (entry = null) or edit/delete a finished time log. Mount it only while open,
// so the form starts from the entry every time.
export function TimeEntryDialog({
  entry,
  clients,
  onClose,
  onSaved,
}: {
  entry: Entry | null;
  clients: { id: string; name: string; archived: boolean }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    client_id: entry?.client_id ?? "",
    date: localDate(entry?.clock_in ?? new Date()),
    start: entry ? localTime(entry.clock_in) : "",
    end: entry?.clock_out ? localTime(entry.clock_out) : "",
    description: entry?.work_description ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const clientTrigger = useRef<HTMLButtonElement>(null);
  const endInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const start = new Date(`${form.date}T${form.start}`);
  const end = new Date(`${form.date}T${form.end}`);
  const nextDay = end < start; // e.g. 22:00 – 01:00
  if (nextDay) end.setDate(end.getDate() + 1);
  const ms = end.getTime() - start.getTime(); // NaN until date, start and end are filled in

  async function run(query: PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>, done: string) {
    setBusy(true);
    const { data, error } = await query;
    setBusy(false);
    if (error) return void toast.error(error.message);
    // RLS drops a disallowed write silently (no error, zero rows), so check it landed
    if (!data?.length) return void toast.error("Couldn't save: the entry wasn't changed.");
    toast.success(done);
    onSaved();
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    // The submit stays enabled so a blocker can be named. Date, start, end and
    // description carry native `required`; these two the browser can't see.
    if (!form.client_id) {
      toast.error("Pick a client first.");
      clientTrigger.current?.focus();
      return;
    }
    if (!(ms > 0)) {
      toast.error("End time has to be after the start time.");
      endInput.current?.focus();
      return;
    }
    const row = {
      client_id: form.client_id,
      clock_in: start.toISOString(),
      clock_out: end.toISOString(),
      work_description: form.description.trim(),
    };
    const table = supabase.from("time_logs");
    run(
      (entry ? table.update(row).eq("id", entry.id) : table.insert(row)).select("id"),
      entry ? "Entry updated" : `Logged ${hoursMinutes(ms)}`,
    );
  }

  function remove() {
    if (entry)
      run(supabase.from("time_logs").delete().eq("id", entry.id).select("id"), "Entry deleted");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-xl">
        <form className="grid gap-4" onSubmit={save}>
          <DialogHeader>
            <DialogTitle>{entry ? "Edit entry" : "Add time entry"}</DialogTitle>
            <DialogDescription>
              {ms > 0
                ? `${hoursMinutes(ms)}${nextDay ? " · ends the next day" : ""}`
                : "Pick a client, the day and when you started and finished."}
            </DialogDescription>
          </DialogHeader>
          <Select value={form.client_id} onValueChange={(client_id) => set({ client_id })}>
            <SelectTrigger ref={clientTrigger} aria-label="Client">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {/* archived clients stay pickable only for entries already on them */}
              {clients
                .filter((c) => !c.archived || c.id === entry?.client_id)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Label className="col-span-2 grid gap-1 text-xs text-muted-foreground sm:col-span-1">
              Date
              <Input
                type="date"
                required
                value={form.date}
                onChange={(e) => set({ date: e.target.value })}
              />
            </Label>
            <Label className="grid gap-1 text-xs text-muted-foreground">
              Start
              <Input type="time" required value={form.start} onChange={(e) => set({ start: e.target.value })} />
            </Label>
            <Label className="grid gap-1 text-xs text-muted-foreground">
              End
              <Input
                ref={endInput}
                type="time"
                required
                value={form.end}
                onChange={(e) => set({ end: e.target.value })}
              />
            </Label>
          </div>
          <Textarea
            aria-label="Work description"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="What did you work on?"
            rows={3}
            required
          />
          {/* its own bordered row: delete never sits where muscle memory expects Save */}
          {entry && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {confirming ? "This can't be undone." : "Delete this entry"}
              </span>
              {confirming ? (
                <span className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                    Keep it
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={remove}
                    disabled={busy}
                    aria-busy={busy}
                  >
                    {busy && <Loader2 className="animate-spin" />}
                    Delete entry
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirming(true)}
                >
                  Delete
                </Button>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving…
                </>
              ) : entry ? (
                "Save"
              ) : (
                "Add entry"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
