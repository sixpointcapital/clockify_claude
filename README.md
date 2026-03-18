# ClockyfI MCP

**Smart time tracking for Claude Code.** ClockyfI automatically captures what you're working on, interprets your activity using AI, and publishes billable time entries to Clockify — all from your terminal.

No more alt-tabbing to a time tracker. Just work. ClockyfI runs silently in the background and builds your timesheet for you.

## How It Works

```
You work → ClockyfI captures → AI interprets → You review → Publish to Clockify
```

1. **Capture** — Every 10 minutes, ClockyfI snapshots your active window, browser tab, and calendar events
2. **Interpret** — Claude AI turns raw activity into a meaningful description with context tags like `[claude-code]`, `[app.sixpoint.io]`, `[zoom]`
3. **Review** — Draft entries are shown for your approval before anything is published
4. **Publish** — Approved entries are pushed to Clockify as billable time entries

## Features

- **Auto-start** — Opens with Claude Code, no manual start needed
- **Idle detection** — Pauses capture when you step away (configurable threshold)
- **Context tags** — Entries include where you worked: `[terminal]`, `[excel-desktop]`, `[slack]`, `[github.com]`
- **Calendar integration** — Paste your Outlook/Google iCal URL to capture meetings
- **Overlap prevention** — Blocks publishing if time entries overlap
- **Project matching** — AI matches activity to your existing Clockify projects
- **Project caching** — Fetches Clockify projects once, not every capture cycle
- **Billable by default** — All published entries are marked billable

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USER/clockyfi-mcp.git
cd clockyfi-mcp
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your keys:

```env
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLOCKIFY_API_KEY=your-clockify-api-key
CLOCKIFY_WORKSPACE_ID=your-workspace-id
```

**Where to find these:**
- **Anthropic API Key** — [console.anthropic.com](https://console.anthropic.com/)
- **Clockify API Key** — Clockify → Profile → Settings → API
- **Clockify Workspace ID** — Clockify → Workspace Settings → URL contains the ID

### 3. Configure Settings

Edit `config.yaml`:

```yaml
capture_interval_minutes: 10    # How often to capture
idle_threshold_minutes: 5       # Skip capture if idle this long

collectors:
  active_window: true           # Capture focused app/window
  calendar: true                # Capture calendar events

calendar:
  # Paste your Outlook/Google iCal URL here
  ical_url: "https://outlook.office365.com/owa/calendar/YOUR_LINK/calendar.ics"
  use_icalbuddy: false

clockify:
  default_project_id: ""
  project_hints: {}
```

**Getting your iCal URL:**
- **Outlook** — Settings → Calendar → Shared calendars → Publish a calendar → Copy ICS link
- **Google Calendar** — Settings → Calendar → Secret address in iCal format

### 4. Add to Claude Code

The project includes a `.mcp.json` file. To connect it to Claude Code:

1. Open Claude Code in the project directory
2. Run `/mcp` and enable the `clockyfi` server
3. That's it — tracking starts automatically

Or manually add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "clockyfi": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "/path/to/clockyfi-mcp"
    }
  }
}
```

### 5. Build (optional, for production)

```bash
npm run build
```

## Usage

Once connected, just talk to Claude naturally:

| Command | What it does |
|---------|-------------|
| `status` | Show today's entries with overlap warnings |
| `capture now` | Take a snapshot right now |
| `review entries` | See draft entries, edit or approve |
| `approve all` | Approve all drafts |
| `publish` | Push approved entries to Clockify |
| `list projects` | Show available Clockify projects |
| `refresh projects` | Reload project list from Clockify |
| `start tracking` | Manually start (auto-starts by default) |
| `stop tracking` | Pause background tracking |

### Example Session

```
You: status

ClockyfI:
| ID | Time | Description | Project | Status |
|---|---|---|---|---|
| 1 | 09:00 AM-09:10 AM | Fixing auth flow in clockyfi-mcp repo [claude-code] | IT OPs | draft |
| 2 | 09:10 AM-09:30 AM | Team standup with engineering [zoom] | IT OPs | draft |
| 3 | 09:30 AM-09:40 AM | Reviewing PR on app.sixpoint.io dashboard [github.com] | IT OPs | draft |

You: approve all and publish
```

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `start_tracking` | Start background capture with optional interval override |
| `stop_tracking` | Stop background capture |
| `capture_now` | Immediate snapshot + interpretation |
| `show_status` | Today's entries with overlap detection |
| `review_entries` | Draft entries with edit/approve options |
| `approve_entry` | Approve a single entry by ID |
| `approve_all` | Approve all drafts |
| `edit_entry` | Edit description, project, task, or times |
| `delete_entry` | Remove an entry |
| `add_manual_entry` | Manually log time (for offline work) |
| `publish_entries` | Push to Clockify (blocks on overlaps) |
| `list_projects` | Show Clockify projects and tasks |
| `refresh_projects` | Clear project cache and reload |
| `export_csv` | Export entries to CSV |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Claude Code                        │
│                                                      │
│  "status" ──→ MCP Server ──→ SQLite DB              │
│  "publish" ──→ MCP Server ──→ Clockify API          │
└─────────────────────────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    Active Window  Calendar    Idle Detector
    (AppleScript)  (iCal URL)  (IOKit)
         │            │            │
         └────────────┼────────────┘
                      ▼
              Claude Sonnet AI
            (Activity Interpreter)
                      │
                      ▼
               SQLite Database
          (snapshots → entries)
                      │
                      ▼
              Clockify API
          (billable time entries)
```

## Collectors

| Collector | Source | Data Captured |
|-----------|--------|---------------|
| **Active Window** | AppleScript (macOS) | App name, window title, browser URLs, document names |
| **Calendar** | iCal URL or icalBuddy | Current meeting title and time |
| **Idle Detector** | macOS IOKit | Seconds since last keyboard/mouse input |

## Project Structure

```
clockyfi-mcp/
├── src/
│   ├── mcp-server.ts          # MCP server + all tools
│   ├── capture.ts             # Snapshot + interpretation pipeline
│   ├── interpreter.ts         # Claude AI activity interpretation
│   ├── db.ts                  # SQLite schema + queries
│   ├── config.ts              # YAML config loader
│   ├── project-cache.ts       # Clockify project caching
│   ├── clockify-api.ts        # Clockify REST API client
│   ├── publish.ts             # Publish + CSV export
│   ├── review.ts              # Interactive review (CLI mode)
│   ├── index.ts               # CLI entry point
│   └── collectors/
│       ├── active-window.ts   # Window/app capture
│       ├── calendar.ts        # iCal + icalBuddy
│       └── idle.ts            # Idle time detection
├── config.yaml                # User configuration
├── .env.example               # Environment template
├── .mcp.json                  # Claude Code MCP registration
├── package.json
└── tsconfig.json
```

## Requirements

- **Node.js** 18+
- **macOS** (active window capture uses AppleScript, idle detection uses IOKit)
- **Clockify account** with API key
- **Anthropic API key** for activity interpretation
- **Claude Code** for MCP integration

## License

MIT
