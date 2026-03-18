#!/usr/bin/env node
import { Command } from "commander";
import { config as dotenvConfig } from "dotenv";
import cron from "node-cron";
import { loadConfig } from "./config.js";
import { captureCycle, takeSnapshot } from "./capture.js";
import { reviewEntries, showStatus } from "./review.js";
import { publishEntries, exportCsv } from "./publish.js";

// Load .env from cwd
dotenvConfig();

const program = new Command();

program
  .name("clockyfi")
  .description("Smart time-tracking CLI — auto-detects work and publishes to Clockify")
  .version("0.1.0");

program
  .command("start")
  .description("Start capturing activity at the configured interval")
  .action(async () => {
    const config = loadConfig();
    const intervalMin = config.capture_interval_minutes;

    console.log(`ClockyfI started. Capturing every ${intervalMin} minutes.`);
    console.log(`Enabled collectors: ${Object.entries(config.collectors).filter(([, v]) => v).map(([k]) => k).join(", ")}`);
    console.log("Press Ctrl+C to stop.\n");

    // Run immediately
    await captureCycle();

    // Then on schedule
    const cronExpr = `*/${intervalMin} * * * *`;
    cron.schedule(cronExpr, async () => {
      await captureCycle();
    });
  });

program
  .command("capture")
  .description("Run a single capture cycle (snapshot + interpret)")
  .action(async () => {
    await captureCycle();
  });

program
  .command("snapshot")
  .description("Take a raw snapshot without interpreting")
  .action(async () => {
    const snapshots = await takeSnapshot();
    console.log(`Took ${snapshots.length} snapshot(s):`);
    for (const s of snapshots) {
      console.log(`  [${s.collector}] ${s.raw_data}`);
    }
  });

program
  .command("review")
  .description("Review and approve today's draft entries")
  .option("-d, --date <date>", "Review entries for a specific date (YYYY-MM-DD)")
  .action(async (opts) => {
    await reviewEntries(opts.date);
  });

program
  .command("status")
  .description("Show today's entries and their status")
  .action(() => {
    showStatus();
  });

program
  .command("publish")
  .description("Push approved entries to Clockify")
  .option("-d, --date <date>", "Publish entries for a specific date (YYYY-MM-DD)")
  .action(async (opts) => {
    await publishEntries(opts.date);
  });

program
  .command("export")
  .description("Export entries to CSV")
  .option("-d, --date <date>", "Export entries for a specific date (YYYY-MM-DD)")
  .option("-o, --output <path>", "Output file path")
  .action((opts) => {
    exportCsv(opts.date, opts.output);
  });

program
  .command("projects")
  .description("List Clockify projects and tasks")
  .action(async () => {
    const { getProjectsWithTasks } = await import("./clockify-api.js");
    const projects = await getProjectsWithTasks();
    for (const p of projects) {
      console.log(`📁 ${p.name} (${p.id})${p.clientName ? ` [${p.clientName}]` : ""}`);
      for (const t of p.tasks) {
        console.log(`   └─ ${t.name} (${t.id})`);
      }
    }
    console.log(`\nTotal: ${projects.length} projects`);
  });

program.parse();
