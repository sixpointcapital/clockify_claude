import fs from "fs";
import path from "path";
import yaml from "js-yaml";

export interface Config {
  capture_interval_minutes: number;
  merge_window_minutes: number;
  idle_threshold_minutes: number;
  collectors: {
    active_window: boolean;
    calendar: boolean;
    browser: boolean;
    slack: boolean;
    git: boolean;
    filesystem: boolean;
  };
  calendar: {
    use_icalbuddy: boolean;
    ical_url: string;
  };
  clockify: {
    default_project_id: string;
    project_hints: Record<string, string>;
  };
}

const CONFIG_PATH = path.resolve(process.cwd(), "config.yaml");

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config file not found at ${CONFIG_PATH}. Copy config.yaml.example and customize it.`);
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return yaml.load(raw) as Config;
}
