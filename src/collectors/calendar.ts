import { execSync } from "child_process";
import * as ical from "node-ical";

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  isNow: boolean;
}

/**
 * Fetches current events from an iCal URL or icalBuddy.
 * Returns events happening right now.
 */
export async function getCurrentEvents(
  icalUrl?: string,
  useIcalBuddy?: boolean
): Promise<CalendarEvent[]> {
  if (icalUrl) {
    return getEventsFromIcalUrl(icalUrl);
  }
  if (useIcalBuddy) {
    return getEventsFromIcalBuddy();
  }
  return [];
}

/**
 * Fetches and parses an iCal URL, returning events happening right now.
 */
async function getEventsFromIcalUrl(url: string): Promise<CalendarEvent[]> {
  try {
    const data = await ical.async.fromURL(url);
    const now = new Date();
    const events: CalendarEvent[] = [];

    for (const key of Object.keys(data)) {
      const component = data[key];
      if (!component || component.type !== "VEVENT") continue;

      const vevent = component as ical.VEvent;
      if (!vevent.start || !vevent.end) continue;
      const start = new Date(vevent.start as unknown as string);
      const end = new Date(vevent.end as unknown as string);

      // Only include events happening now
      if (now >= start && now <= end) {
        const summary = typeof vevent.summary === "string"
          ? vevent.summary
          : (vevent.summary as { val: string })?.val || "(no title)";
        events.push({
          title: summary,
          start: start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          end: end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          isNow: true,
        });
      }
    }

    return events;
  } catch (err) {
    console.error("Failed to fetch iCal URL:", (err as Error).message);
    return [];
  }
}

/**
 * Uses icalBuddy (macOS) to get current calendar events.
 * Install: brew install ical-buddy
 */
function getEventsFromIcalBuddy(): CalendarEvent[] {
  try {
    const result = execSync(
      `icalBuddy -f -ea -nc -b "" -ps "| ~ |" -po "title,datetime" -ic "" eventsFrom:"today" to:"today"`,
      { timeout: 5000, encoding: "utf-8" }
    ).trim();

    if (!result) return [];

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const events: CalendarEvent[] = [];

    for (const line of result.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split(" ~ ");
      if (parts.length < 2) continue;

      const title = parts[0].trim();
      const timeRange = parts[1].trim();
      const timeParts = timeRange.split(" - ");
      const startStr = timeParts[0]?.trim() || "";
      const endStr = timeParts[1]?.trim() || "";

      const startMin = parseTimeToMinutes(startStr);
      const endMin = parseTimeToMinutes(endStr);
      const isNow = startMin !== null && endMin !== null &&
        nowMinutes >= startMin && nowMinutes <= endMin;

      if (isNow) {
        events.push({ title, start: startStr, end: endStr, isNow: true });
      }
    }

    return events;
  } catch {
    return [];
  }
}

function parseTimeToMinutes(timeStr: string): number | null {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();

  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}
