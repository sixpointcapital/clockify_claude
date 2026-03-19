# Clockify Claude

**Your AI fills out your timesheet.** Clockify Claude runs inside Claude Code, watches what you're working on, and builds your Clockify timesheet automatically.

No browser tabs. No manual entries. No forgetting to log time. Just open Claude Code at the start of your day and it records everything — your meetings, your code, your emails, your Slack conversations. At the end of the day, review and publish. That's it.

## What it looks like

```
You: status

| ID | Time              | Description                                          | Project | Status |
|----|-------------------|------------------------------------------------------|---------|--------|
| 1  | 09:00 AM-09:30 AM | Fixing auth flow in clockyfi repo [claude-code]      | IT OPs  | draft  |
| 2  | 09:30 AM-10:00 AM | Team standup with engineering [teams]                 | IT OPs  | draft  |
| 3  | 10:00 AM-10:30 AM | Reviewing dashboard changes [yourapp.company.com]        | IT OPs  | draft  |

You: approve all and publish
Done: 3 published, 0 failed.
```

That's it. Three hours of work, logged in two sentences.

## Quick Start

```bash
git clone https://github.com/sixpointcapital/clockify_claude.git
cd clockify_claude
npm install
cp .env.example .env    # Set up your environment variables
open .env        # macOS
notepad .env     # Windows
```

Add your keys to `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLOCKIFY_API_KEY=your-clockify-api-key
CLOCKIFY_WORKSPACE_ID=your-workspace-id
```

Open Claude Code in the project directory, run `/mcp`, enable `clockyfi` — done. Tracking starts automatically.

## What you can say

Talk to Claude naturally. No commands to memorize.

- **"status"** — see today's entries
- **"capture now"** — snapshot what you're doing right now
- **"review entries"** — check drafts before publishing
- **"approve all and publish"** — send everything to Clockify
- **"assign IT OPs to all drafts"** — bulk edit projects
- **"delete entry 5"** — remove a bad entry
- **"list projects"** — see your Clockify projects
- **"add 2 hours for the client meeting I had at 3pm"** — manual entries too

## How it works

```
                    You work normally
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        Active Window          Calendar
      (app, tab, URL)       (Outlook)
              │                     │
              └──────────┬──────────┘
                         ▼
                    Claude AI
              "What are they doing?"
                         │
                         ▼
                  Draft time entry
          "Fixing auth flow [claude-code]"
                         │
                    You review
                         │
                         ▼
                    Clockify API
                (billable, published)
```

- **Captures** your active window, browser tabs, and current calendar event every 10 minutes
- **Skips** capture when you're idle (away from keyboard for 5+ minutes)
- **Interprets** activity with Claude AI into specific descriptions with context tags
- **Blocks** publishing if entries have time overlaps
- **All entries are billable** by default

## Calendar setup

Paste your Outlook calendar's iCal URL into `config.yaml` and your meetings show up automatically:

- **Outlook** — Settings → Calendar → Shared calendars → Publish a calendar → Copy ICS link

## What are context tags?

Every entry includes a tag showing *where* you worked:

| Tag | Meaning |
|-----|---------|
| `[claude-code]` | Terminal / CLI development |
| `[yourapp.company.com]` | Browser on that domain |
| `[excel-desktop]` | Desktop Excel |
| `[teams]` | Zoom meeting |
| `[slack]` | Slack conversation |
| `[github.com]` | GitHub in browser |

These come from your actual activity — the AI reads your window title, URL, or app name and tags accordingly.

## Requirements

- Node.js 18+
- macOS
- [Clockify](https://clockify.me) account
- [Anthropic API key](https://console.anthropic.com)
- [Claude Code](https://claude.ai/claude-code)

## License

MIT
