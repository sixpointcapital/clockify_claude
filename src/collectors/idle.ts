import { execSync } from "child_process";

/**
 * Returns the user's idle time in seconds using platform-specific methods.
 * macOS: IOKit HIDIdleTime. Windows: Win32 GetLastInputInfo via PowerShell.
 */
export function getIdleTimeSeconds(): number {
  if (process.platform === "win32") {
    return getIdleTimeWindows();
  }
  return getIdleTimeMac();
}

function getIdleTimeMac(): number {
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

function getIdleTimeWindows(): number {
  try {
    const psScript = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public struct LASTINPUTINFO {
  public uint cbSize;
  public uint dwTime;
}
public class IdleTime {
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint GetIdleTime() {
    LASTINPUTINFO lii = new LASTINPUTINFO();
    lii.cbSize = (uint)Marshal.SizeOf(lii);
    GetLastInputInfo(ref lii);
    return ((uint)Environment.TickCount - lii.dwTime);
  }
}
'@
Write-Output ([IdleTime]::GetIdleTime())
`.trim();

    const result = execSync(
      `powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`,
      { timeout: 3000, encoding: "utf-8" }
    ).trim();
    // Result is in milliseconds
    const ms = parseInt(result, 10);
    if (isNaN(ms)) return 0;
    return Math.floor(ms / 1000);
  } catch {
    return 0;
  }
}
