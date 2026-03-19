#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Load .env from the project directory
const projectDir = resolve(import.meta.dirname || process.cwd(), "..");
dotenvConfig({ path: resolve(projectDir, ".env") });

// Change cwd to project dir so config.yaml and .db are found
process.chdir(projectDir);

import { loadConfig } from "./config.js";
import { takeSnapshot, processSnapshots } from "./capture.js";
import { getIdleTimeSeconds } from "./collectors/idle.js";
import {
  getEntriesToday,
  getEntriesByStatus,
  updateEntryStatus,
  updateEntry,
  deleteEntry,
  type TimeEntry,
} from "./db.js";
import { createTimeEntry } from "./clockify-api.js";
import { getCachedProjects, getCachedProjectsWithTasks, refreshProjectCache, resolveProjectId } from "./project-cache.js";
import { exportCsv } from "./publish.js";

// Background capture state
let captureInterval: ReturnType<typeof setInterval> | null = null;

const server = new McpServer({
  name: "clockyfi",
  version: "0.1.0",
});

// ─── Tool: start_tracking ───────────────────────────────────────────────────

server.tool(
  "start_tracking",
  "Start automatic background time tracking. Captures what you're working on at regular intervals.",
  {
    interval_minutes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Capture interval in minutes (default: from config.yaml)"),
  },
  async ({ interval_minutes }) => {
    if (captureInterval) {
      return { content: [{ type: "text", text: "Tracking is already running. Use stop_tracking first." }] };
    }

    const config = loadConfig();
    const interval = interval_minutes || config.capture_interval_minutes;

    // Run first capture immediately
    const snapshots = await takeSnapshot();
    let firstResult = `Took ${snapshots.length} snapshot(s).`;

    try {
      const entry = await processSnapshots();
      if (entry) {
        firstResult += ` Interpreted: "${entry.description}" (${entry.project_name || "no project"})`;
      }
    } catch (err) {
      firstResult += ` Interpretation skipped: ${(err as Error).message}`;
    }

    // Schedule recurring captures (skip if user is idle)
    const idleThreshold = (config.idle_threshold_minutes ?? 5) * 60;
    captureInterval = setInterval(async () => {
      try {
        const idleSeconds = getIdleTimeSeconds();
        if (idleSeconds >= idleThreshold) {
          await server.sendLoggingMessage({ level: "debug", data: `Idle ${Math.floor(idleSeconds / 60)}m — skipping capture.` });
          return;
        }
        await takeSnapshot();
        const entry = await processSnapshots();
        if (entry) {
          await server.sendLoggingMessage({
            level: "info",
            data: `Captured: "${entry.description}" (${entry.project_name || "no project"})`,
          });
        }
      } catch {
        // Silent — entries will be reviewed later
      }
    }, interval * 60 * 1000);

    return {
      content: [{
        type: "text",
        text: `Tracking started — capturing every ${interval} minutes.\n${firstResult}\nI'll quietly track in the background. Ask me to "show status" or "review entries" anytime.`,
      }],
    };
  }
);

// ─── Tool: stop_tracking ────────────────────────────────────────────────────

server.tool(
  "stop_tracking",
  "Stop automatic background time tracking.",
  {},
  async () => {
    if (!captureInterval) {
      return { content: [{ type: "text", text: "Tracking is not running." }] };
    }
    clearInterval(captureInterval);
    captureInterval = null;
    return { content: [{ type: "text", text: "Tracking stopped." }] };
  }
);

// ─── Tool: capture_now ──────────────────────────────────────────────────────

server.tool(
  "capture_now",
  "Take a snapshot of current activity right now and interpret it.",
  {},
  async () => {
    const snapshots = await takeSnapshot();
    if (snapshots.length === 0) {
      return { content: [{ type: "text", text: "No activity detected." }] };
    }

    let result = `Captured ${snapshots.length} snapshot(s):\n`;
    for (const s of snapshots) {
      result += `  [${s.collector}] ${s.raw_data}\n`;
    }

    try {
      const entry = await processSnapshots();
      if (entry) {
        result += `\nInterpreted as: "${entry.description}"\nProject: ${entry.project_name || "(none)"}\nTask: ${entry.task_name || "(none)"}\nStatus: draft — use review_entries to approve.`;
      }
    } catch (err) {
      result += `\nCould not interpret: ${(err as Error).message}`;
    }

    return { content: [{ type: "text", text: result }] };
  }
);

// ─── Tool: show_status ──────────────────────────────────────────────────────

server.tool(
  "show_status",
  "Show all time entries for today with their status (draft/approved/published).",
  {},
  async () => {
    const entries = getEntriesToday();
    if (entries.length === 0) {
      return { content: [{ type: "text", text: "No entries for today yet." }] };
    }

    const counts = { draft: 0, approved: 0, published: 0, skipped: 0 };
    let table = "| ID | Time | Description | Project | Status |\n|---|---|---|---|---|\n";

    for (const e of entries) {
      const start = new Date(e.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      const end = new Date(e.end_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      table += `| ${e.id} | ${start}-${end} | ${e.description} | ${e.project_name || "-"} | ${e.status} |\n`;
      counts[e.status]++;
    }

    // Check for overlaps among unpublished entries
    const unpublished = entries.filter(e => e.status !== "published");
    const sorted = [...unpublished].sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const overlaps: string[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const currEnd = new Date(sorted[i].end_time).getTime();
      const nextStart = new Date(sorted[i + 1].start_time).getTime();
      if (currEnd > nextStart) {
        overlaps.push(`  ⚠ #${sorted[i].id} overlaps with #${sorted[i + 1].id}`);
      }
    }

    table += `\nDraft: ${counts.draft} | Approved: ${counts.approved} | Published: ${counts.published} | Skipped: ${counts.skipped}`;
    if (overlaps.length > 0) {
      table += `\n\n**⚠ TIME OVERLAPS — fix before publishing:**\n${overlaps.join("\n")}`;
    }
    table += `\nTracking: ${captureInterval ? "running" : "stopped"}`;

    return { content: [{ type: "text", text: table }] };
  }
);

// ─── Tool: review_entries ───────────────────────────────────────────────────

server.tool(
  "review_entries",
  "Show draft entries for review. Returns entries so you can discuss changes with the user before approving.",
  {
    date: z.string().optional().describe("Date in YYYY-MM-DD format (default: today)"),
  },
  async ({ date }) => {
    const entries = date
      ? getEntriesByStatus("draft", date)
      : getEntriesToday("draft");

    if (entries.length === 0) {
      return { content: [{ type: "text", text: "No draft entries to review." }] };
    }

    let result = `Found ${entries.length} draft entries:\n\n`;
    for (const e of entries) {
      const start = new Date(e.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      const end = new Date(e.end_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      result += `**#${e.id}** ${start} - ${end}\n`;
      result += `  Description: ${e.description}\n`;
      result += `  Project: ${e.project_name || "(none)"} | Task: ${e.task_name || "(none)"}\n\n`;
    }

    // Check for overlaps among drafts
    const sorted = [...entries].sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const overlaps: string[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const currEnd = new Date(sorted[i].end_time).getTime();
      const nextStart = new Date(sorted[i + 1].start_time).getTime();
      if (currEnd > nextStart) {
        overlaps.push(
          `  ⚠ #${sorted[i].id} overlaps with #${sorted[i + 1].id}`
        );
      }
    }
    if (overlaps.length > 0) {
      result += `**⚠ TIME OVERLAPS DETECTED — fix before publishing:**\n${overlaps.join("\n")}\n\n`;
    }

    result += `You can:\n`;
    result += `- approve_entry with an ID to approve\n`;
    result += `- edit_entry to change description/project/times\n`;
    result += `- delete_entry to remove\n`;
    result += `- approve_all to approve everything\n`;
    result += `Or tell me what to change in plain English.`;

    return { content: [{ type: "text", text: result }] };
  }
);

// ─── Tool: approve_entry ────────────────────────────────────────────────────

server.tool(
  "approve_entry",
  "Approve a specific draft entry by ID.",
  {
    entry_id: z.number().int().positive().describe("The entry ID to approve"),
  },
  async ({ entry_id }) => {
    try {
      updateEntryStatus(entry_id, "approved");
      return { content: [{ type: "text", text: `Entry #${entry_id} approved. Use publish_entries to push to Clockify.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Tool: approve_all ──────────────────────────────────────────────────────

server.tool(
  "approve_all",
  "Approve all draft entries for today (or a specific date).",
  {
    date: z.string().optional().describe("Date in YYYY-MM-DD format (default: today)"),
  },
  async ({ date }) => {
    const entries = date
      ? getEntriesByStatus("draft", date)
      : getEntriesToday("draft");

    if (entries.length === 0) {
      return { content: [{ type: "text", text: "No draft entries to approve." }] };
    }

    for (const e of entries) {
      updateEntryStatus(e.id!, "approved");
    }

    return { content: [{ type: "text", text: `Approved ${entries.length} entries. Use publish_entries to push to Clockify.` }] };
  }
);

// ─── Tool: edit_entry ───────────────────────────────────────────────────────

server.tool(
  "edit_entry",
  "Edit a time entry's description, project, or task.",
  {
    entry_id: z.number().int().positive().describe("The entry ID to edit"),
    description: z.string().optional().describe("New description"),
    project_id: z.string().optional().describe("New Clockify project ID"),
    project_name: z.string().optional().describe("New project name"),
    task_id: z.string().optional().describe("New Clockify task ID"),
    task_name: z.string().optional().describe("New task name"),
    start_time: z.string().optional().describe("New start time (ISO 8601)"),
    end_time: z.string().optional().describe("New end time (ISO 8601)"),
  },
  async ({ entry_id, description, project_id, project_name, task_id, task_name, start_time, end_time }) => {
    const fields: Partial<TimeEntry> = {};
    if (description) fields.description = description;
    if (project_id) fields.project_id = project_id;
    if (project_name) fields.project_name = project_name;
    if (task_id) fields.task_id = task_id;
    if (task_name) fields.task_name = task_name;
    if (start_time) fields.start_time = start_time;
    if (end_time) fields.end_time = end_time;

    if (Object.keys(fields).length === 0) {
      return { content: [{ type: "text", text: "No changes specified." }] };
    }

    try {
      updateEntry(entry_id, fields);
      return { content: [{ type: "text", text: `Entry #${entry_id} updated.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Tool: delete_entry ─────────────────────────────────────────────────────

server.tool(
  "delete_entry",
  "Delete a time entry by ID.",
  {
    entry_id: z.number().int().positive().describe("The entry ID to delete"),
  },
  async ({ entry_id }) => {
    try {
      deleteEntry(entry_id);
      return { content: [{ type: "text", text: `Entry #${entry_id} deleted.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Tool: publish_entries ──────────────────────────────────────────────────

server.tool(
  "publish_entries",
  "Push all approved entries to Clockify.",
  {
    date: z.string().optional().describe("Date in YYYY-MM-DD format (default: today)"),
  },
  async ({ date }) => {
    const entries = date
      ? getEntriesByStatus("approved", date)
      : getEntriesToday("approved");

    if (entries.length === 0) {
      return { content: [{ type: "text", text: "No approved entries to publish. Review and approve entries first." }] };
    }

    // Check for time overlaps before publishing
    const sorted = [...entries].sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const overlaps: string[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const currEnd = new Date(sorted[i].end_time).getTime();
      const nextStart = new Date(sorted[i + 1].start_time).getTime();
      if (currEnd > nextStart) {
        overlaps.push(
          `  ⚠ #${sorted[i].id} (ends ${new Date(sorted[i].end_time).toLocaleTimeString()}) overlaps with #${sorted[i + 1].id} (starts ${new Date(sorted[i + 1].start_time).toLocaleTimeString()})`
        );
      }
    }
    if (overlaps.length > 0) {
      return {
        content: [{ type: "text", text:
          `Cannot publish — ${overlaps.length} time overlap(s) detected:\n\n${overlaps.join("\n")}\n\nFix overlaps using edit_entry to adjust start/end times, or delete_entry to remove duplicates.`
        }],
        isError: true,
      };
    }

    let result = `Publishing ${entries.length} entries to Clockify...\n`;
    let success = 0;
    let failed = 0;

    for (const entry of entries) {
      try {
        let projectId = entry.project_id || undefined;
        const taskId = entry.task_id || undefined;

        // If we have a project name but no project ID, resolve it via cache
        if (!projectId && entry.project_name) {
          const resolved = await resolveProjectId(entry.project_name);
          if (resolved) {
            projectId = resolved;
            updateEntry(entry.id!, { project_id: resolved });
          }
        }

        const clockifyId = await createTimeEntry({
          start: entry.start_time,
          end: entry.end_time,
          description: entry.description,
          projectId,
          taskId,
        });
        updateEntryStatus(entry.id!, "published");
        result += `  #${entry.id} → Clockify (${clockifyId})\n`;
        success++;
      } catch (err) {
        result += `  #${entry.id} FAILED: ${(err as Error).message}\n`;
        failed++;
      }
    }

    result += `\nDone: ${success} published, ${failed} failed.`;
    return { content: [{ type: "text", text: result }] };
  }
);

// ─── Tool: list_projects ───────────────────────────────────────────────────

server.tool(
  "list_projects",
  "List all available Clockify projects and their tasks.",
  {},
  async () => {
    try {
      const projects = await getCachedProjectsWithTasks();
      let result = `Found ${projects.length} projects:\n\n`;
      for (const p of projects) {
        result += `**${p.name}** (${p.id})${p.clientName ? ` [${p.clientName}]` : ""}\n`;
        for (const t of p.tasks) {
          result += `  - ${t.name} (${t.id})\n`;
        }
      }
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error fetching projects: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Tool: refresh_projects ──────────────────────────────────────────────────

server.tool(
  "refresh_projects",
  "Refresh the cached list of Clockify projects (use when projects have been added/removed).",
  {},
  async () => {
    refreshProjectCache();
    const projects = await getCachedProjectsWithTasks();
    return { content: [{ type: "text", text: `Refreshed! ${projects.length} projects loaded.` }] };
  }
);

// ─── Tool: export_csv ───────────────────────────────────────────────────────

server.tool(
  "export_csv",
  "Export today's entries to a CSV file.",
  {
    date: z.string().optional().describe("Date in YYYY-MM-DD format (default: today)"),
    output_path: z.string().optional().describe("Output file path"),
  },
  async ({ date, output_path }) => {
    try {
      exportCsv(date, output_path);
      const filePath = output_path || `clockyfi_${date || new Date().toISOString().split("T")[0]}.csv`;
      return { content: [{ type: "text", text: `Exported to ${filePath}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ─── Tool: add_manual_entry ─────────────────────────────────────────────────

server.tool(
  "add_manual_entry",
  "Manually add a time entry (e.g., for a meeting or task you did offline).",
  {
    description: z.string().describe("What you were working on"),
    start_time: z.string().describe("Start time (ISO 8601 or HH:MM)"),
    end_time: z.string().describe("End time (ISO 8601 or HH:MM)"),
    project_name: z.string().optional().describe("Clockify project name"),
    project_id: z.string().optional().describe("Clockify project ID"),
    task_name: z.string().optional().describe("Task name"),
    task_id: z.string().optional().describe("Task ID"),
  },
  async ({ description, start_time, end_time, project_name, project_id, task_name, task_id }) => {
    const { insertEntry } = await import("./db.js");

    // Handle simple HH:MM format — convert to today's ISO
    const today = new Date().toISOString().split("T")[0];
    const toIso = (t: string) => {
      if (t.includes("T")) return t;
      return `${today}T${t}:00.000Z`;
    };

    const entry = {
      date: today,
      start_time: toIso(start_time),
      end_time: toIso(end_time),
      description,
      project_id: project_id || null,
      project_name: project_name || null,
      task_id: task_id || null,
      task_name: task_name || null,
      status: "draft" as const,
      snapshot_ids: null,
    };

    const id = insertEntry(entry);
    return {
      content: [{
        type: "text",
        text: `Created entry #${id}: "${description}" (${start_time} - ${end_time}). Status: draft.`,
      }],
    };
  }
);

// ─── Start server ───────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// ─── Auto-start tracking ────────────────────────────────────────────────────
// If Claude Code is open, we should be recording.
{
  const config = loadConfig();
  const interval = config.capture_interval_minutes;
  const idleThreshold = (config.idle_threshold_minutes ?? 5) * 60;
  captureInterval = setInterval(async () => {
    try {
      const idleSeconds = getIdleTimeSeconds();
      if (idleSeconds >= idleThreshold) {
        await server.sendLoggingMessage({ level: "debug", data: `Idle ${Math.floor(idleSeconds / 60)}m — skipping capture.` });
        return;
      }
      await takeSnapshot();
      const entry = await processSnapshots();
      if (entry) {
        await server.sendLoggingMessage({
          level: "info",
          data: `Captured: "${entry.description}" (${entry.project_name || "no project"})`,
        });
      }
    } catch {
      // Silent — entries will be reviewed later
    }
  }, interval * 60 * 1000);
}
