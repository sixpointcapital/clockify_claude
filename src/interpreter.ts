import Anthropic from "@anthropic-ai/sdk";
import { ClockifyProject, ClockifyTask } from "./clockify-api.js";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export interface InterpretedActivity {
  description: string;
  project_name: string | null;
  project_id: string | null;
  task_name: string | null;
  task_id: string | null;
  confidence: "high" | "medium" | "low";
}

interface SnapshotData {
  collector: string;
  raw_data: string;
  timestamp: string;
}

export async function interpretActivity(
  snapshots: SnapshotData[],
  projects: Array<ClockifyProject & { tasks: ClockifyTask[] }>,
  projectHints: Record<string, string>
): Promise<InterpretedActivity> {
  const projectList = projects.map(p => {
    const taskNames = p.tasks.map(t => `  - ${t.name} (id: ${t.id})`).join("\n");
    return `- ${p.name} (id: ${p.id})${p.clientName ? ` [client: ${p.clientName}]` : ""}\n${taskNames}`;
  }).join("\n");

  const snapshotText = snapshots.map(s =>
    `[${s.timestamp}] ${s.collector}: ${s.raw_data}`
  ).join("\n");

  const hintsText = Object.entries(projectHints).length > 0
    ? `\nProject keyword hints:\n${Object.entries(projectHints).map(([k, v]) => `- "${k}" → project ID ${v}`).join("\n")}`
    : "";

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are a smart time-tracking assistant. Given raw activity snapshots from a user's computer, determine what they are ACTUALLY working on and match it to the best Clockify project/task.

Rules:
- BE SPECIFIC. Include concrete details from the snapshot: repo names, site domains, file names, document titles, meeting names.
- ALWAYS append a short context tag showing WHERE the work happened. Format: "description [context]"
  - For terminals/CLI: [claude-code], [terminal], [ssh]
  - For browsers: use the shortened domain [yourapp.company.com], [github.com], [docs.google.com]
  - For desktop apps: [excel-desktop], [word-desktop], [powerpoint-desktop]
  - For online apps: [excel-online], [google-sheets]
  - For meetings: [zoom], [teams], [google-meet]
  - For email: [outlook], [gmail]
- Good: "Admin dashboard configuration [yourapp.company.com]" or "Fixing API rate limits in clockyfi_mcp [claude-code]"
- Bad: "Code development and account management work" or "SixPoint platform administration and data analysis"
- If in a terminal/IDE, extract the repo or project name from the window title or path.
- If in a browser, include the site domain and page context.
- If a file name contains a deal/company name, use it.
- If they're in a meeting, use the meeting title.
- Describe the WORK, not the tool. "Building financial model for Aurora [excel-desktop]" not "Using Excel".
- Pick the best matching Clockify project and task. If unsure, set project to null.
- Be concise but specific: 5-20 words for the description (excluding the context tag).

Available Clockify projects and tasks:
${projectList}
${hintsText}

Activity snapshots:
${snapshotText}

Respond in JSON only (no markdown):
{
  "description": "concise work description [context-tag]",
  "project_name": "matched project name or null",
  "project_id": "matched project id or null",
  "task_name": "matched task name or null",
  "task_id": "matched task id or null",
  "confidence": "high|medium|low"
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    return JSON.parse(jsonMatch[0]) as InterpretedActivity;
  } catch {
    return {
      description: text.slice(0, 100),
      project_name: null,
      project_id: null,
      task_name: null,
      task_id: null,
      confidence: "low",
    };
  }
}
