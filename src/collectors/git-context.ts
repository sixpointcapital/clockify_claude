import { execSync } from "child_process";

export interface GitContext {
  repo: string;
  branch: string;
  recentCommits: string[];
  changedFiles: string[];
}

/**
 * Captures git context from the most recently active repo.
 * Reads the cwd from the active terminal if possible, falls back to common paths.
 */
export function getGitContext(): GitContext | null {
  // Try to detect current working directory from recent shell history or common locations
  const repoPaths = findRecentRepoPaths();

  for (const repoPath of repoPaths) {
    try {
      const repo = execSync("git rev-parse --show-toplevel", {
        cwd: repoPath,
        timeout: 3000,
        encoding: "utf-8",
      }).trim();

      const repoName = repo.split("/").pop() || repo;

      const branch = execSync("git branch --show-current", {
        cwd: repo,
        timeout: 3000,
        encoding: "utf-8",
      }).trim();

      const recentCommits = execSync(
        'git log --oneline -5 --format="%s"',
        { cwd: repo, timeout: 3000, encoding: "utf-8" }
      )
        .trim()
        .split("\n")
        .filter(Boolean);

      const changedFiles = execSync(
        "git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null",
        { cwd: repo, timeout: 3000, encoding: "utf-8" }
      )
        .trim()
        .split("\n")
        .filter(Boolean);

      return { repo: repoName, branch, recentCommits, changedFiles };
    } catch {
      continue;
    }
  }

  return null;
}

function findRecentRepoPaths(): string[] {
  const paths: string[] = [];

  try {
    // Get cwd from recent shell history - look for cd commands
    const { readFileSync, existsSync } = require("fs");
    const { homedir } = require("os");

    const histPath = `${homedir()}/.zsh_history`;
    if (existsSync(histPath)) {
      const content = readFileSync(histPath, "utf-8");
      const lines = content.split("\n").slice(-50);

      for (const line of lines.reverse()) {
        const match = line.match(/;?\s*cd\s+(.+)/);
        if (match) {
          let dir = match[1].trim().replace(/^~/, homedir());
          if (!dir.startsWith("/")) dir = `${homedir()}/${dir}`;
          paths.push(dir);
        }
      }
    }
  } catch {
    // ignore
  }

  // Also check the current process cwd
  paths.push(process.cwd());

  return [...new Set(paths)];
}
