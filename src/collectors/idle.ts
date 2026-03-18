import { execSync } from "child_process";

/**
 * Returns the user's idle time in seconds on macOS using IOKit HIDIdleTime.
 */
export function getIdleTimeSeconds(): number {
  try {
    const result = execSync(
      "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print $NF; exit}'",
      { timeout: 3000, encoding: "utf-8" }
    ).trim();
    // HIDIdleTime is in nanoseconds
    const nanos = parseInt(result, 10);
    if (isNaN(nanos)) return 0;
    return Math.floor(nanos / 1_000_000_000);
  } catch {
    return 0;
  }
}
