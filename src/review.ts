import Table from "cli-table3";
import inquirer from "inquirer";
import {
  getEntriesToday,
  getEntriesByStatus,
  updateEntryStatus,
  updateEntry,
  deleteEntry,
  type TimeEntry,
} from "./db.js";

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function buildTable(entries: TimeEntry[]): string {
  const table = new Table({
    head: ["ID", "Time", "Description", "Project", "Task", "Status"],
    colWidths: [6, 22, 35, 20, 15, 10],
    wordWrap: true,
  });

  for (const e of entries) {
    table.push([
      e.id,
      `${formatTime(e.start_time)}\n${formatTime(e.end_time)}`,
      e.description,
      e.project_name || "-",
      e.task_name || "-",
      e.status,
    ]);
  }

  return table.toString();
}

export async function reviewEntries(date?: string): Promise<void> {
  const entries = date
    ? getEntriesByStatus("draft", date)
    : getEntriesToday("draft");

  if (entries.length === 0) {
    console.log("No draft entries to review.");
    return;
  }

  console.log(`\n📋 Draft entries for review:\n`);
  console.log(buildTable(entries));

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { name: "Approve all", value: "approve_all" },
        { name: "Review one by one", value: "review_each" },
        { name: "Skip (do nothing)", value: "skip" },
      ],
    },
  ]);

  if (action === "approve_all") {
    for (const e of entries) {
      updateEntryStatus(e.id!, "approved");
    }
    console.log(`Approved ${entries.length} entries. Run 'clockyfi publish' to push to Clockify.`);
  } else if (action === "review_each") {
    for (const e of entries) {
      console.log(`\n--- Entry #${e.id} ---`);
      console.log(`  Time: ${formatTime(e.start_time)} - ${formatTime(e.end_time)}`);
      console.log(`  Description: ${e.description}`);
      console.log(`  Project: ${e.project_name || "(none)"}`);
      console.log(`  Task: ${e.task_name || "(none)"}`);

      const { entryAction } = await inquirer.prompt([
        {
          type: "list",
          name: "entryAction",
          message: `Entry #${e.id}:`,
          choices: [
            { name: "Approve", value: "approve" },
            { name: "Edit description", value: "edit" },
            { name: "Skip (keep as draft)", value: "skip" },
            { name: "Delete", value: "delete" },
          ],
        },
      ]);

      if (entryAction === "approve") {
        updateEntryStatus(e.id!, "approved");
        console.log("  ✓ Approved");
      } else if (entryAction === "edit") {
        const { newDesc } = await inquirer.prompt([
          { type: "input", name: "newDesc", message: "New description:", default: e.description },
        ]);
        updateEntry(e.id!, { description: newDesc });
        updateEntryStatus(e.id!, "approved");
        console.log("  ✓ Updated & approved");
      } else if (entryAction === "delete") {
        deleteEntry(e.id!);
        console.log("  ✗ Deleted");
      } else {
        console.log("  - Skipped");
      }
    }
  }
}

export function showStatus(): void {
  const today = getEntriesToday();
  if (today.length === 0) {
    console.log("No entries for today.");
    return;
  }

  console.log(`\n📊 Today's entries:\n`);
  console.log(buildTable(today));

  const counts = { draft: 0, approved: 0, published: 0, skipped: 0 };
  for (const e of today) {
    counts[e.status]++;
  }
  console.log(`\nDraft: ${counts.draft} | Approved: ${counts.approved} | Published: ${counts.published} | Skipped: ${counts.skipped}`);
}
