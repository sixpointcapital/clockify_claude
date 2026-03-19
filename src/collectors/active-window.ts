import { execSync } from "child_process";

export interface WindowInfo {
  app: string;
  title: string;
}

/**
 * Uses AppleScript (macOS) or PowerShell with Win32 API (Windows) to get
 * the currently focused application and window title.
 */
export function getActiveWindow(): WindowInfo {
  if (process.platform === "win32") {
    return getActiveWindowWindows();
  }
  return getActiveWindowMac();
}

function getActiveWindowMac(): WindowInfo {
  try {
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        set frontAppId to bundle identifier of first application process whose frontmost is true
      end tell

      try
        if frontAppId is "com.microsoft.Excel" then
          tell application "Microsoft Excel"
            set docName to name of active workbook
          end tell
          return frontApp & " | " & docName
        else if frontAppId is "com.microsoft.Word" then
          tell application "Microsoft Word"
            set docName to name of active document
          end tell
          return frontApp & " | " & docName
        else if frontAppId is "com.microsoft.Powerpoint" then
          tell application "Microsoft PowerPoint"
            set docName to name of active presentation
          end tell
          return frontApp & " | " & docName
        else if frontAppId starts with "com.google.Chrome" then
          tell application "Google Chrome"
            set tabTitle to title of active tab of front window
            set tabURL to URL of active tab of front window
          end tell
          return frontApp & " | " & tabTitle & " | " & tabURL
        else if frontAppId is "com.apple.Safari" then
          tell application "Safari"
            set tabTitle to name of current tab of front window
            set tabURL to URL of current tab of front window
          end tell
          return frontApp & " | " & tabTitle & " | " & tabURL
        else if frontAppId is "company.thebrowser.Browser" then
          tell application "Arc"
            set tabTitle to title of active tab of front window
            set tabURL to URL of active tab of front window
          end tell
          return frontApp & " | " & tabTitle & " | " & tabURL
        else
          tell application "System Events"
            tell process frontApp
              set winTitle to name of front window
            end tell
          end tell
          return frontApp & " | " & winTitle
        end if
      on error
        return frontApp & " | (no window title)"
      end try
    `;

    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 5000,
      encoding: "utf-8",
    }).trim();

    const parts = result.split(" | ");
    return {
      app: parts[0] || "Unknown",
      title: parts.slice(1).join(" | ") || "(no title)",
    };
  } catch {
    return { app: "Unknown", title: "(could not read active window)" };
  }
}

function getActiveWindowWindows(): WindowInfo {
  try {
    const psScript = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$hwnd = [Win32]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[Win32]::GetWindowText($hwnd, $sb, 256) | Out-Null
$pid = 0
[Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
Write-Output ($proc.ProcessName + ' | ' + $sb.ToString())
`.trim();

    const result = execSync(
      `powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`,
      { timeout: 5000, encoding: "utf-8" }
    ).trim();

    const parts = result.split(" | ");
    return {
      app: parts[0] || "Unknown",
      title: parts.slice(1).join(" | ") || "(no title)",
    };
  } catch {
    return { app: "Unknown", title: "(could not read active window)" };
  }
}
