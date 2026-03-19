import { readFileSync } from "fs";
import { homedir } from "os";
import { existsSync } from "fs";

/**
 * Reads the last N commands from zsh history to understand what the user
 * has been doing in the terminal.
 */
export function getRecentShellHistory(count: number = 20): string[] {
  const historyPaths = [
    `${homedir()}/.zsh_history`,
    `${homedir()}/.bash_history`,
  ];

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
