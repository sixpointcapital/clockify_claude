import {
  getEntriesByStatus,
  getEntriesToday,
  updateEntryStatus,
  type TimeEntry,
} from "./db.js";
import { createTimeEntry } from "./clockify-api.js";
import fs from "fs";

export async function publishEntries(date?: string): Promise<void> {
  const entries = date
    ? getEntriesByStatus("approved", date)
    : getEntriesToday("approved");

  if (entries.length === 0) {
    console.log("No approved entries to publish. Run 'clockyfi review' first.");
    return;
  }

  console.log(`Publishing ${entries.length} entries to Clockify...`);

  let success = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      const clockifyId = await createTimeEntry({
        start: entry.start_time,
        end: entry.end_time,
        description: entry.description,
        projectId: entry.project_id || undefined,
        taskId: entry.task_id || undefined,
      });
      updateEntryStatus(entry.id!, "published");
      console.log(`  ✓ #${entry.id} → Clockify (${clockifyId})`);
      success++;
    } catch (err) {
      console.error(`  ✗ #${entry.id}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${success} published, ${failed} failed.`);
}

export function exportCsv(date?: string, outputPath?: string): void {
  const entries = date
    ? [...getEntriesByStatus("draft", date), ...getEntriesByStatus("approved", date), ...getEntriesByStatus("published", date)]
    : getEntriesToday();

  if (entries.length === 0) {
    console.log("No entries to export.");
    return;
  }

  const header = "id,date,start_time,end_time,description,project_name,task_name,status";
  const rows = entries.map(e =>
    [
      e.id,
      e.date,
      e.start_time,
      e.end_time,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${(e.project_name || "").replace(/"/g, '""')}"`,
      `"${(e.task_name || "").replace(/"/g, '""')}"`,
      e.status,
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");
  const filePath = outputPath || `clockyfi_${date || new Date().toISOString().split("T")[0]}.csv`;
  fs.writeFileSync(filePath, csv, "utf-8");
  console.log(`Exported ${entries.length} entries to ${filePath}`);
}
