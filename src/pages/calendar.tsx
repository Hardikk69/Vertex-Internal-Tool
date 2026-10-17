import { 
  AlertCircle, 
  ArrowLeft, 
  ArrowRight, 
  Calendar as CalendarIcon, 
  Check, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  ExternalLink, 
  Filter, 
  Flame, 
  ListTodo,
  MapPin, 
  MoreVertical, 
  Phone, 
  Plus, 
  Sparkles, 
  Tag, 
  Trash2, 
  Users, 
  Video 
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { Loading } from "@/components/async-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn, localDate } from "@/lib/utils";

export type EventType = "meeting" | "deadline" | "shoot" | "review" | "milestone";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  type: EventType;
  clientId?: string | null;
  clientName?: string;
  location?: string; // e.g. "Google Meet", "Studio B", "Client Office"
  meetingLink?: string;
  notes?: string;
  completed?: boolean;
};

import { CALENDAR_STORAGE_KEY, saveStoredEvents } from "@/lib/calendar";

const STORAGE_KEY = CALENDAR_STORAGE_KEY;

const EVENT_TYPE_CONFIG: Record<EventType, { label: string; badge: string; dot: string; icon: any }> = {
  meeting: {
    label: "Meeting / Call",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30",
    dot: "bg-blue-500",
    icon: Video,
  },
  deadline: {
    label: "Deadline",
    badge: "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-semibold",
    dot: "bg-red-500",
    icon: Clock,
  },
  shoot: {
    label: "Video / Photo Shoot",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
    dot: "bg-amber-500",
    icon: Flame,
  },
  review: {
    label: "Client Review / QC",
    badge: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30",
    dot: "bg-purple-500",
    icon: CheckCircle2,
  },
  milestone: {
    label: "Timeline Milestone",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
    dot: "bg-emerald-500",
    icon: Sparkles,
  },
};

const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: "evt-1",
    title: "Client Kickoff & Concept Alignment",
    date: localDate(new Date()),
    startTime: "10:30",
    endTime: "11:30",
    type: "meeting",
    clientName: "Apex Athletics",
    location: "Google Meet",
    meetingLink: "https://meet.google.com",
    notes: "Review moodboard, shot list, and talent availability for the upcoming campaign.",
  },
  {
    id: "evt-2",
    title: "Deliver 3x Hook Reels v1 Cut",
    date: localDate(new Date()),
    startTime: "16:00",
    type: "deadline",
    clientName: "Lumina Skincare",
    notes: "Export in 4K ProRes and 1080x1920 MP4 for TikTok/Reels testing.",
  },
  {
    id: "evt-3",
    title: "Studio Product Shoot - 4K Macro",
    date: localDate(new Date(Date.now() + 86400000 * 1)),
    startTime: "11:00",
    endTime: "15:00",
    type: "shoot",
    clientName: "Velo Electric",
    location: "Studio B (Downtown)",
    notes: "Lighting kit ready, smoke machine, Ronin 4D + Macro probe lens.",
  },
  {
    id: "evt-4",
    title: "Q4 Brand Campaign Sign-off",
    date: localDate(new Date(Date.now() + 86400000 * 3)),
    startTime: "15:00",
    endTime: "16:00",
    type: "review",
    clientName: "Apex Athletics",
    location: "Zoom",
    notes: "Final client review with marketing director.",
  },
  {
    id: "evt-5",
    title: "Ad Spend Campaign Launch & Delivery",
    date: localDate(new Date(Date.now() + 86400000 * 5)),
    type: "milestone",
    clientName: "Apex Athletics",
    notes: "All campaign deliverables published and live on Meta Ads manager.",
  },
];

export default function CalendarPage() {
  const { profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => localDate(new Date()));
  const [viewMode, setViewMode] = useState<"month" | "timeline">("month");
  const [filterType, setFilterType] = useState<string>("all");

  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to load local calendar events", e);
    }
    return INITIAL_EVENTS;
  });

  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Form inputs
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState(selectedDate);
  const [formStartTime, setFormStartTime] = useState("10:00");
  const [formEndTime, setFormEndTime] = useState("11:00");
  const [formType, setFormType] = useState<EventType>("meeting");
  const [formClient, setFormClient] = useState<string>("none");
  const [formLocation, setFormLocation] = useState("");
  const [formMeetingLink, setFormMeetingLink] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSyncToTodo, setFormSyncToTodo] = useState(false);

  // Sync to localStorage and notify listeners
  useEffect(() => {
    saveStoredEvents(events);
  }, [events]);

  // Load clients
  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name")
      .eq("archived", false)
      .order("name")
      .then(({ data }) => {
        if (data) setClients(data);
      });
  }, []);

  const openAddDialog = (presetDate?: string) => {
    setEditingEvent(null);
    setFormTitle("");
    setFormDate(presetDate || selectedDate);
    setFormStartTime("10:00");
    setFormEndTime("11:00");
    setFormType("meeting");
    setFormClient("none");
    setFormLocation("");
    setFormMeetingLink("");
    setFormNotes("");
    setFormSyncToTodo(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (evt: CalendarEvent) => {
    setEditingEvent(evt);
    setFormTitle(evt.title);
    setFormDate(evt.date);
    setFormStartTime(evt.startTime || "10:00");
    setFormEndTime(evt.endTime || "11:00");
    setFormType(evt.type);
    setFormClient(evt.clientId || "none");
    setFormLocation(evt.location || "");
    setFormMeetingLink(evt.meetingLink || "");
    setFormNotes(evt.notes || "");
    setFormSyncToTodo(false);
    setIsDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      return toast.error("Please enter a title for the plan.");
    }

    const clientObj = clients.find((c) => c.id === formClient);
    const clientName = clientObj ? clientObj.name : formClient !== "none" ? formClient : undefined;
    const clientIdVal = formClient === "none" ? null : formClient;

    if (editingEvent) {
      setEvents((prev) =>
        prev.map((evt) =>
          evt.id === editingEvent.id
            ? {
                ...evt,
                title: formTitle.trim(),
                date: formDate,
                startTime: formStartTime || undefined,
                endTime: formEndTime || undefined,
                type: formType,
                clientId: clientIdVal,
                clientName,
                location: formLocation.trim() || undefined,
                meetingLink: formMeetingLink.trim() || undefined,
                notes: formNotes.trim() || undefined,
              }
            : evt,
        ),
      );
      toast.success("Schedule updated");
    } else {
      const newEvt: CalendarEvent = {
        id: `evt-${Date.now()}`,
        title: formTitle.trim(),
        date: formDate,
        startTime: formStartTime || undefined,
        endTime: formEndTime || undefined,
        type: formType,
        clientId: clientIdVal,
        clientName,
        location: formLocation.trim() || undefined,
        meetingLink: formMeetingLink.trim() || undefined,
        notes: formNotes.trim() || undefined,
        completed: false,
      };
      setEvents((prev) => [...prev, newEvt]);

      // If user checked "Also add to To-Do list", insert into public.todos
      if (formSyncToTodo) {
        const { error: todoErr } = await supabase.from("todos").insert({
          title: formStartTime ? `${formTitle.trim()} (${formStartTime})` : formTitle.trim(),
          due_date: formDate,
          client_id: clientIdVal,
        });

        if (todoErr) {
          toast.error(`Event added, but To-Do sync failed: ${todoErr.message}`);
        } else {
          toast.success("Event added to calendar and synced to your To-Do list!");
        }
      } else {
        toast.success("Added to calendar & schedule");
      }
    }

    setIsDialogOpen(false);
  };

  const deleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    toast.success("Event deleted");
  };

  const toggleCompleted = (id: string) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, completed: !e.completed } : e)),
    );
  };

  // Calendar month navigation
  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const jumpToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(localDate(today));
  };

  // Build grid days for the month
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 (Sun) - 6 (Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days: { dateStr: string; dayNumber: number; inMonth: boolean }[] = [];

    // Preceding padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevDate = new Date(year, month - 1, d);
      days.push({ dateStr: localDate(prevDate), dayNumber: d, inMonth: false });
    }

    // Days in current month
    for (let i = 1; i <= daysInMonth; i++) {
      const curDate = new Date(year, month, i);
      days.push({ dateStr: localDate(curDate), dayNumber: i, inMonth: true });
    }

    // Trailing padding days to fill 35 or 42 slots
    const totalSlots = days.length <= 35 ? 35 : 42;
    const remaining = totalSlots - days.length;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      days.push({ dateStr: localDate(nextDate), dayNumber: i, inMonth: false });
    }

    return days;
  }, [currentMonth]);

  // Selected date's events
  const selectedDateEvents = useMemo(() => {
    return events
      .filter((e) => e.date === selectedDate)
      .sort((a, b) => (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));
  }, [events, selectedDate]);

  // Filtered events for timeline view
  const timelineEvents = useMemo(() => {
    return [...events]
      .filter((e) => filterType === "all" || e.type === filterType)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || ""));
  }, [events, filterType]);

  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="grid gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#FF4B33]/15 text-[#FF4B33]">
              <CalendarIcon className="size-4" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Schedule &amp; Timeline</h1>
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {events.length} planned
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Plan your days, client shoots, meetings, project deadlines, and delivery timelines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex rounded-xl border border-border/70 bg-card p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={cn(
                "rounded-lg px-3 py-1 font-semibold transition-all",
                viewMode === "month"
                  ? "bg-foreground text-background shadow-sm dark:bg-white dark:text-neutral-950"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Month View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={cn(
                "rounded-lg px-3 py-1 font-semibold transition-all",
                viewMode === "timeline"
                  ? "bg-foreground text-background shadow-sm dark:bg-white dark:text-neutral-950"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Timeline List
            </button>
          </div>

          <Button onClick={() => openAddDialog()} className="brand-gradient text-xs font-semibold text-white shadow-md">
            <Plus className="mr-1.5 size-4" /> Add Event / Deadline
          </Button>
        </div>
      </div>

      {viewMode === "month" ? (
        /* MONTH GRID & DAY DETAIL SPLIT */
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Interactive Month Calendar (7 cols) */}
          <div className="space-y-4 lg:col-span-7">
            <Card className="rounded-3xl border-border/70 p-5 shadow-sm backdrop-blur-md">
              {/* Month Header Navigation */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-foreground sm:text-lg">{monthLabel}</h2>

                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={jumpToToday} className="rounded-xl text-xs h-8">
                    Today
                  </Button>
                  <Button variant="ghost" size="icon" onClick={prevMonth} className="size-8 rounded-xl">
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={nextMonth} className="size-8 rounded-xl">
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Day of Week Labels */}
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              {/* Calendar Days Matrix */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((d) => {
                  const isSelected = d.dateStr === selectedDate;
                  const isToday = d.dateStr === localDate(new Date());
                  const dayEvents = events.filter((e) => e.date === d.dateStr);

                  return (
                    <button
                      key={d.dateStr}
                      type="button"
                      onClick={() => setSelectedDate(d.dateStr)}
                      className={cn(
                        "group relative flex min-h-20 flex-col items-start justify-between rounded-2xl border p-2 text-left transition-all",
                        isSelected
                          ? "border-[#FF4B33] bg-[#FF4B33]/10 shadow-sm"
                          : isToday
                            ? "border-foreground/30 bg-accent/40"
                            : d.inMonth
                              ? "border-border/40 bg-card/60 hover:border-foreground/20 hover:bg-accent/30"
                              : "border-transparent text-muted-foreground/40 opacity-40 hover:opacity-75"
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                            isToday
                              ? "brand-gradient font-bold text-white shadow-sm"
                              : isSelected
                                ? "text-[#FF4B33] font-bold"
                                : "text-foreground"
                          )}
                        >
                          {d.dayNumber}
                        </span>

                        {dayEvents.length > 0 && (
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      {/* Event Dot Indicators */}
                      <div className="mt-1 flex flex-wrap gap-1 w-full">
                        {dayEvents.slice(0, 3).map((e) => {
                          const config = EVENT_TYPE_CONFIG[e.type] || EVENT_TYPE_CONFIG.meeting;
                          return (
                            <div
                              key={e.id}
                              className={cn("h-1.5 rounded-full flex-1 min-w-2", config.dot)}
                              title={`${e.title} (${config.label})`}
                            />
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Right Column: Selected Day Details & Schedule (5 cols) */}
          <div className="space-y-4 lg:col-span-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
                  Day Schedule
                </h2>
                <p className="text-xs text-muted-foreground">{selectedDateLabel}</p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => openAddDialog(selectedDate)}
                className="rounded-xl text-xs h-8"
              >
                <Plus className="mr-1 size-3.5" /> Add to this day
              </Button>
            </div>

            {selectedDateEvents.length === 0 ? (
              <Card className="rounded-3xl border-dashed border-border/70 p-8 text-center shadow-sm">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
                  <CalendarIcon className="size-6" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">No events or deadlines</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your day is open. Schedule a meeting, shoot, or deadline for this date.
                </p>
                <Button
                  size="sm"
                  onClick={() => openAddDialog(selectedDate)}
                  className="mt-4 brand-gradient rounded-xl text-xs text-white"
                >
                  <Plus className="mr-1 size-3.5" /> Plan Event
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {selectedDateEvents.map((evt) => {
                  const config = EVENT_TYPE_CONFIG[evt.type] || EVENT_TYPE_CONFIG.meeting;
                  const Icon = config.icon;

                  return (
                    <Card
                      key={evt.id}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl border border-border/70 p-4 shadow-sm transition-all hover:border-[#FF4B33]/40",
                        evt.completed && "opacity-60 bg-muted/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          {/* Type Badge & Time */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", config.badge)}>
                              {config.label}
                            </span>

                            {evt.startTime && (
                              <span className="flex items-center gap-1 font-mono text-xs font-semibold text-foreground">
                                <Clock className="size-3 text-muted-foreground" />
                                {evt.startTime}
                                {evt.endTime && ` – ${evt.endTime}`}
                              </span>
                            )}

                            {evt.clientName && (
                              <span className="rounded bg-accent/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {evt.clientName}
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <h4
                            onClick={() => openEditDialog(evt)}
                            className={cn(
                              "cursor-pointer text-sm font-bold text-foreground transition-colors hover:text-[#FF4B33]",
                              evt.completed && "line-through text-muted-foreground"
                            )}
                          >
                            {evt.title}
                          </h4>

                          {/* Location / Meeting link */}
                          {(evt.location || evt.meetingLink) && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {evt.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="size-3 text-[#FF4B33]" />
                                  {evt.location}
                                </span>
                              )}
                              {evt.meetingLink && (
                                <a
                                  href={evt.meetingLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-500 hover:underline"
                                >
                                  Join Link <ExternalLink className="size-3" />
                                </a>
                              )}
                            </div>
                          )}

                          {evt.notes && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {evt.notes}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleCompleted(evt.id)}
                            className={cn(
                              "flex size-7 items-center justify-center rounded-lg border transition-all",
                              evt.completed
                                ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                                : "border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                            )}
                            title={evt.completed ? "Mark incomplete" : "Mark completed"}
                          >
                            <Check className="size-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteEvent(evt.id)}
                            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-40 transition-all hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                            title="Delete"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TIMELINE VIEW */
        <div className="space-y-4">
          {/* Type Filter */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/60 p-3 shadow-sm backdrop-blur-md">
            <Filter className="size-4 text-muted-foreground mr-1" />
            <span className="text-xs font-medium text-muted-foreground mr-2">Filter Timeline:</span>
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={cn(
                "rounded-xl px-3 py-1 text-xs font-semibold transition-all",
                filterType === "all"
                  ? "brand-gradient text-white shadow-sm"
                  : "bg-accent/50 text-muted-foreground hover:text-foreground"
              )}
            >
              All Events
            </button>
            {(Object.keys(EVENT_TYPE_CONFIG) as EventType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={cn(
                  "rounded-xl px-3 py-1 text-xs font-semibold transition-all",
                  filterType === t
                    ? "brand-gradient text-white shadow-sm"
                    : "bg-accent/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {EVENT_TYPE_CONFIG[t].label}
              </button>
            ))}
          </div>

          {timelineEvents.length === 0 ? (
            <Card className="rounded-3xl p-12 text-center text-sm text-muted-foreground">
              No events found for this filter.
            </Card>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:bottom-0 before:left-2 before:top-2 before:w-0.5 before:bg-border/60">
              {timelineEvents.map((evt) => {
                const config = EVENT_TYPE_CONFIG[evt.type] || EVENT_TYPE_CONFIG.meeting;
                return (
                  <div key={evt.id} className="relative group">
                    <span className={cn("absolute -left-6 top-4 size-2.5 rounded-full ring-4 ring-background", config.dot)} />
                    <Card className="rounded-2xl border-border/70 p-4 shadow-sm transition-all hover:border-[#FF4B33]/40">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", config.badge)}>
                              {config.label}
                            </span>
                            <span className="text-xs font-bold text-foreground">
                              {new Date(`${evt.date}T00:00:00`).toLocaleDateString(undefined, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                            {evt.startTime && (
                              <span className="font-mono text-xs text-muted-foreground">
                                @ {evt.startTime}
                              </span>
                            )}
                            {evt.clientName && (
                              <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {evt.clientName}
                              </span>
                            )}
                          </div>
                          <h4
                            onClick={() => openEditDialog(evt)}
                            className="cursor-pointer text-sm font-bold text-foreground transition-colors hover:text-[#FF4B33]"
                          >
                            {evt.title}
                          </h4>
                          {evt.notes && <p className="text-xs text-muted-foreground">{evt.notes}</p>}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => openEditDialog(evt)} className="text-xs h-8">
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteEvent(evt.id)} className="text-xs h-8 text-destructive hover:bg-destructive/10">
                            Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Event Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <form onSubmit={handleSave} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {editingEvent ? "Edit Schedule Item" : "Schedule Meeting, Shoot or Deadline"}
              </DialogTitle>
              <DialogDescription>
                Plan your milestones, client check-ins, shoots, and critical delivery dates.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="evt-title" className="text-xs font-semibold">
                  Event / Milestone Title *
                </Label>
                <Input
                  id="evt-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Rough Cut Review with Client"
                  className="rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold">Type</Label>
                  <Select value={formType} onValueChange={(v) => setFormType(v as EventType)}>
                    <SelectTrigger className="rounded-xl text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(EVENT_TYPE_CONFIG) as EventType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {EVENT_TYPE_CONFIG[t].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold">Client</Label>
                  <Select value={formClient} onValueChange={setFormClient}>
                    <SelectTrigger className="rounded-xl text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">VMH Internal (No client)</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="evt-date" className="text-xs font-semibold">
                    Date *
                  </Label>
                  <Input
                    id="evt-date"
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="rounded-xl text-xs"
                    required
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="evt-start" className="text-xs font-semibold">
                    Start Time
                  </Label>
                  <Input
                    id="evt-start"
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="evt-end" className="text-xs font-semibold">
                    End Time
                  </Label>
                  <Input
                    id="evt-end"
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="evt-location" className="text-xs font-semibold">
                    Location / Platform
                  </Label>
                  <Input
                    id="evt-location"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="e.g. Studio A, Google Meet"
                    className="rounded-xl text-xs"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="evt-link" className="text-xs font-semibold">
                    Meeting / Call Link
                  </Label>
                  <Input
                    id="evt-link"
                    type="url"
                    value={formMeetingLink}
                    onChange={(e) => setFormMeetingLink(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="evt-notes" className="text-xs font-semibold">
                  Agenda / Preparation Notes
                </Label>
                <Textarea
                  id="evt-notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Items to prepare, equipment needed, agenda..."
                  className="rounded-xl text-xs"
                  rows={3}
                />
              </div>

              {/* Sync to To-Do toggle (only for new events) */}
              {!editingEvent && (
                <div className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-accent/30 p-3">
                  <Checkbox
                    id="sync-todo"
                    checked={formSyncToTodo}
                    onCheckedChange={(checked) => setFormSyncToTodo(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 text-xs">
                    <label htmlFor="sync-todo" className="cursor-pointer font-semibold text-foreground flex items-center gap-1.5">
                      <ListTodo className="size-3.5 text-[#FF4B33]" />
                      Also add this item to my To-Do list
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Creates an interactive checklist task on your To-Do page for this date.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" className="brand-gradient rounded-xl font-semibold text-white shadow-md">
                {editingEvent ? "Save Changes" : "Add to Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
