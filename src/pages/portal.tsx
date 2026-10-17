import { 
  ArrowRight, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Clock, 
  ExternalLink, 
  FileEdit, 
  Flame, 
  MapPin, 
  MessageSquare, 
  Sparkles, 
  Video 
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/auth";
import { CommentThread } from "@/components/comment-thread";
import { RetainerUsage } from "@/components/retainer-usage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarEvent, getStoredEvents } from "@/lib/calendar";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export default function PortalPage() {
  const { profile } = useAuth();
  const clientId = profile!.client_id!;
  const clientCompany = profile?.client?.name ?? "Your Project";
  const retainerHours = profile?.client?.retainer_hours ?? null;

  const [briefSubmitted, setBriefSubmitted] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "schedule">("chat");
  const [meetings, setMeetings] = useState<CalendarEvent[]>([]);

  // Check if onboarding brief was submitted
  useEffect(() => {
    supabase
      .from("client_briefs")
      .select("submitted_at")
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error) {
          setBriefSubmitted(!!data?.submitted_at);
        }
      });
  }, [clientId]);

  // Load meetings & schedule for this client
  const loadClientSchedule = useCallback(() => {
    const all = getStoredEvents();
    // Filter events matching client id or client name
    const forThisClient = all.filter((e) => {
      const matchId = e.clientId && e.clientId === clientId;
      const matchName = e.clientName && clientCompany && e.clientName.toLowerCase() === clientCompany.toLowerCase();
      return matchId || matchName;
    });

    // Sort by date and start time
    forThisClient.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || ""));
    setMeetings(forThisClient);
  }, [clientId, clientCompany]);

  useEffect(() => {
    loadClientSchedule();

    const handleUpdate = () => loadClientSchedule();
    window.addEventListener("vmh-calendar-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("vmh-calendar-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [loadClientSchedule]);

  // Upcoming meetings (filter out past completed or past dates)
  const upcomingMeetings = meetings.filter((m) => !m.completed);

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      {/* Client Header Card - Clean & Focused */}
      <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-xl bg-[#FF4B33]/15 text-[#FF4B33]">
              <Sparkles className="size-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {clientCompany}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Direct collaboration workspace with Vertex Media House.
          </p>
        </div>

        {/* Retainer Hours Meter */}
        <div className="rounded-2xl border border-border/70 bg-accent/30 p-3 sm:min-w-60">
          <RetainerUsage clientId={clientId} retainerHours={retainerHours} />
        </div>
      </div>

      {/* Brief Reminder Banner (only if brief isn't submitted yet) */}
      {!briefSubmitted && (
        <div className="flex flex-col gap-2 rounded-2xl border border-[#FF4B33]/30 bg-[#FF4B33]/10 p-3.5 text-xs text-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <FileEdit className="size-4 text-[#FF4B33] shrink-0" />
            <span>
              <strong>Project brief pending:</strong> Help us plan your content &amp; shoot by filling out the brief.
            </span>
          </div>
          <Button asChild size="sm" className="brand-gradient h-8 rounded-xl px-3 text-xs font-semibold text-white shrink-0">
            <Link to="/brief">
              Fill Out Brief <ArrowRight className="ml-1 size-3" />
            </Link>
          </Button>
        </div>
      )}

      {/* Scheduled Meetings / Next Event Spotlight (if any exist) */}
      {upcomingMeetings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CalendarIcon className="size-3.5 text-[#FF4B33]" />
              Scheduled Meetings &amp; Deadlines ({upcomingMeetings.length})
            </h2>
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === "schedule" ? "chat" : "schedule")}
              className="text-xs font-semibold text-[#FF4B33] hover:underline cursor-pointer"
            >
              {activeTab === "schedule" ? "Hide Schedule" : "View Details"}
            </button>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {upcomingMeetings.slice(0, 2).map((m) => (
              <div
                key={m.id}
                className="flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 capitalize">
                      {m.type}
                    </span>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {new Date(`${m.date}T00:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        weekday: "short",
                      })}
                      {m.startTime && ` · ${m.startTime}`}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground">{m.title}</h3>
                  {m.notes && <p className="text-xs text-muted-foreground line-clamp-2">{m.notes}</p>}
                </div>

                {(m.meetingLink || m.location) && (
                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                    {m.location && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="size-3 text-[#FF4B33]" /> {m.location}
                      </span>
                    )}
                    {m.meetingLink && (
                      <a
                        href={m.meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 font-semibold text-blue-500 hover:underline"
                      >
                        Join Call <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Action Tabs: Direct Chat vs Full Schedule */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm",
                activeTab === "chat"
                  ? "bg-foreground text-background shadow-sm dark:bg-white dark:text-neutral-950"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-1.5">
                <MessageSquare className="size-3.5" />
                Team Chat &amp; Files
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("schedule")}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm",
                activeTab === "schedule"
                  ? "bg-foreground text-background shadow-sm dark:bg-white dark:text-neutral-950"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-1.5">
                <CalendarIcon className="size-3.5" />
                All Scheduled Sessions ({meetings.length})
              </span>
            </button>
          </div>
        </div>

        {activeTab === "chat" ? (
          <div>
            <CommentThread clientId={clientId} userId={profile!.id} />
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-border/60 p-8 text-center text-xs text-muted-foreground">
                No meetings or calendar milestones scheduled for your project yet.
              </Card>
            ) : (
              meetings.map((m) => (
                <Card key={m.id} className="rounded-2xl border-border/70 p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                          {m.type}
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          {new Date(`${m.date}T00:00:00`).toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {m.startTime && (
                          <span className="font-mono text-xs text-muted-foreground">
                            @ {m.startTime} {m.endTime ? `– ${m.endTime}` : ""}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-foreground">{m.title}</h4>
                      {m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {m.meetingLink && (
                        <Button asChild size="sm" className="brand-gradient text-xs text-white rounded-xl">
                          <a href={m.meetingLink} target="_blank" rel="noreferrer">
                            Join Call <ExternalLink className="ml-1 size-3" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
