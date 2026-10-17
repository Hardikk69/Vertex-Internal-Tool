import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Unknown-duration wait. Pages render this instead of null, so a slow fetch
// doesn't read as a blank page or as "you have no data".
export function Loading({ className }: { className?: string }) {
  return (
    <div role="status" className={cn("grid justify-items-center py-10", className)}>
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

// A failed fetch needs a way out, not just a toast that expires.
export function LoadFailed({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("grid justify-items-center gap-3 py-10 text-center", className)}
    >
      <AlertCircle className="size-5 text-destructive" />
      <p className="text-sm text-muted-foreground">{message ?? "Couldn't load this."}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
