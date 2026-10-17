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
  location?: string;
  meetingLink?: string;
  notes?: string;
  completed?: boolean;
};

export const CALENDAR_STORAGE_KEY = "vmh_calendar_events";

export function getStoredEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(CALENDAR_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read calendar events from storage", e);
  }
  return [];
}

export function saveStoredEvents(events: CalendarEvent[]) {
  try {
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(events));
    // Dispatch custom event so other tabs/components can listen
    window.dispatchEvent(new Event("vmh-calendar-updated"));
  } catch (e) {
    console.error("Failed to save calendar events", e);
  }
}
