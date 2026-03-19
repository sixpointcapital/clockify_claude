import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";

/**
 * Reads the last N commands from shell history to understand what the user
 * has been doing in the terminal.
 * Supports zsh/bash history on macOS/Linux and PowerShell PSReadLine history on Windows.
 */
export function getRecentShellHistory(count: number = 20): string[] {
  const historyPaths = [
    `${homedir()}/.zsh_history`,
    `${homedir()}/.bash_history`,
  ];

  // On Windows, also check PowerShell PSReadLine history
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      historyPaths.push(
        join(appData, "Microsoft", "Windows", "PowerShell", "PSReadLine", "ConsoleHost_history.txt")
      );
    }
  }

  for (const histPath of historyPaths) {
    if (!existsSync(histPath)) continue;

    try {
      const content = readFileSync(histPath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim());

      // zsh history lines can be ": timestamp:0;command" format
      const commands = lines
        .slice(-count)
        .map(line => {
          // Strip zsh extended history format
          const match = line.match(/^:\s*\d+:\d+;(.*)$/);
          return match ? match[1].trim() : line.trim();
        })
        .filter(cmd => {
          // Filter out noise
          if (!cmd) return false;
          if (cmd.startsWith("#")) return false;
          return true;
        });

      return commands;
    } catch {
      continue;
    }
  }

  return [];
}
