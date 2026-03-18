import { loadConfig } from "./config.js";
import { getActiveWindow } from "./collectors/active-window.js";
import { getCurrentEvents } from "./collectors/calendar.js";
import { getIdleTimeSeconds } from "./collectors/idle.js";
import {
  insertSnapshot,
  insertEntry,
  getRecentSnapshots,
  type Snapshot,
  type TimeEntry,
} from "./db.js";
import { type ClockifyProject, type ClockifyTask } from "./clockify-api.js";
import { getCachedProjectsWithTasks } from "./project-cache.js";
import { interpretActivity } from "./interpreter.js";

/**
 * Takes a single snapshot of all enabled collectors and stores raw data.
 */
export async function takeSnapshot(): Promise<Snapshot[]> {
  const config = loadConfig();
  const now = new Date().toISOString();
  const snapshots: Snapshot[] = [];

  if (config.collectors.active_window) {
    const win = getActiveWindow();
    const raw = JSON.stringify(win);
    const id = insertSnapshot({ timestamp: now, collector: "active_window", raw_data: raw });
    snapshots.push({ id, timestamp: now, collector: "active_window", raw_data: raw });
  }

  if (config.collectors.calendar) {
    const events = await getCurrentEvents(
      config.calendar.ical_url || undefined,
      config.calendar.use_icalbuddy
    );
    if (events.length > 0) {
      const raw = JSON.stringify(events);
      const id = insertSnapshot({ timestamp: now, collector: "calendar", raw_data: raw });
      snapshots.push({ id, timestamp: now, collector: "calendar", raw_data: raw });
    }
  }

  return snapshots;
}

/**
 * Processes recent snapshots: interprets them with LLM and creates a draft time entry.
 */
export async function processSnapshots(): Promise<TimeEntry | null> {
  const config = loadConfig();
  const mergeWindow = config.merge_window_minutes;
  const recent = getRecentSnapshots(mergeWindow);

  if (recent.length === 0) return null;

  // Fetch Clockify projects for context
  let projects: Array<ClockifyProject & { tasks: ClockifyTask[] }> = [];
  try {
    projects = await getCachedProjectsWithTasks();
  } catch (err) {
    console.error("Warning: Could not fetch Clockify projects:", (err as Error).message);
  }

  const interpreted = await interpretActivity(
    recent.map(s => ({ collector: s.collector, raw_data: s.raw_data, timestamp: s.timestamp })),
    projects,
    config.clockify.project_hints
  );

  const now = new Date();
  const startTime = new Date(recent[0].timestamp);
  const date = now.toISOString().split("T")[0];

  const entry: TimeEntry = {
    date,
    start_time: startTime.toISOString(),
    end_time: now.toISOString(),
    description: interpreted.description,
    project_id: interpreted.project_id,
    project_name: interpreted.project_name,
    task_id: interpreted.task_id,
    task_name: interpreted.task_name,
    status: "draft",
    snapshot_ids: recent.map(s => s.id).join(","),
  };

  const id = insertEntry(entry);
  entry.id = id;

  return entry;
}

/**
 * Single capture cycle: snapshot + process.
 * Skips capture if user has been idle beyond the configured threshold.
 * Returns "idle" if skipped, or the capture result.
 */
export async function captureCycle(): Promise<"idle" | "captured" | "empty"> {
  const config = loadConfig();
  const idleThreshold = (config.idle_threshold_minutes ?? 5) * 60;
  const idleSeconds = getIdleTimeSeconds();

  if (idleSeconds >= idleThreshold) {
    console.log(`[${new Date().toLocaleTimeString()}] User idle for ${Math.floor(idleSeconds / 60)}m — skipping capture.`);
    return "idle";
  }

  const snapshots = await takeSnapshot();
  if (snapshots.length === 0) {
    console.log(`[${new Date().toLocaleTimeString()}] No activity detected.`);
    return "empty";
  }

  console.log(`[${new Date().toLocaleTimeString()}] Captured ${snapshots.length} snapshot(s). Interpreting...`);

  const entry = await processSnapshots();
  if (entry) {
    console.log(`  → "${entry.description}" (${entry.project_name || "no project"}) [${entry.status}]`);
  }
  return "captured";
}
