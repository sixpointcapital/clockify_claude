import { loadConfig } from "./config.js";
import { getActiveWindow } from "./collectors/active-window.js";
import { getCurrentEvents } from "./collectors/calendar.js";
import { getRecentShellHistory } from "./collectors/shell-history.js";
import { getGitContext } from "./collectors/git-context.js";
import {
  insertSnapshot,
  type Snapshot,
} from "./db.js";

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

  // Always capture shell history and git context for better interpretation
  const shellHistory = getRecentShellHistory(15);
  if (shellHistory.length > 0) {
    const raw = JSON.stringify(shellHistory);
    const id = insertSnapshot({ timestamp: now, collector: "shell_history", raw_data: raw });
    snapshots.push({ id, timestamp: now, collector: "shell_history", raw_data: raw });
  }

  const gitCtx = getGitContext();
  if (gitCtx) {
    const raw = JSON.stringify(gitCtx);
    const id = insertSnapshot({ timestamp: now, collector: "git_context", raw_data: raw });
    snapshots.push({ id, timestamp: now, collector: "git_context", raw_data: raw });
  }

  return snapshots;
}
