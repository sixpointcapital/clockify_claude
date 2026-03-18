const BASE_URL = "https://api.clockify.me/api/v1";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.CLOCKIFY_API_KEY;
  if (!apiKey) throw new Error("CLOCKIFY_API_KEY not set in .env");
  return {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
  };
}

function getWorkspaceId(): string {
  const id = process.env.CLOCKIFY_WORKSPACE_ID;
  if (!id) throw new Error("CLOCKIFY_WORKSPACE_ID not set in .env");
  return id;
}

export interface ClockifyProject {
  id: string;
  name: string;
  clientName?: string;
}

export interface ClockifyTask {
  id: string;
  name: string;
  projectId: string;
}

export interface ClockifyTimeEntry {
  start: string; // ISO 8601
  end: string;   // ISO 8601
  description: string;
  projectId?: string;
  taskId?: string;
}

export async function getProjects(): Promise<ClockifyProject[]> {
  const wsId = getWorkspaceId();
  const allProjects: ClockifyProject[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const res = await fetch(`${BASE_URL}/workspaces/${wsId}/projects?page=${page}&page-size=${pageSize}&archived=false`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(`Clockify API error: ${res.status} ${await res.text()}`);
    const projects = await res.json() as Array<{ id: string; name: string; clientName?: string }>;
    allProjects.push(...projects.map(p => ({ id: p.id, name: p.name, clientName: p.clientName })));
    if (projects.length < pageSize) break;
    page++;
  }

  return allProjects;
}

export async function getTasksForProject(projectId: string): Promise<ClockifyTask[]> {
  const wsId = getWorkspaceId();
  const res = await fetch(
    `${BASE_URL}/workspaces/${wsId}/projects/${projectId}/tasks?page-size=200&is-active=true`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error(`Clockify API error: ${res.status} ${await res.text()}`);
  const tasks = await res.json() as Array<{ id: string; name: string; projectId: string }>;
  return tasks.map(t => ({ id: t.id, name: t.name, projectId: t.projectId }));
}

export async function createTimeEntry(entry: ClockifyTimeEntry): Promise<string> {
  const wsId = getWorkspaceId();
  const body: Record<string, unknown> = {
    start: entry.start,
    end: entry.end,
    description: entry.description,
    billable: true,
  };
  if (entry.projectId) body.projectId = entry.projectId;
  if (entry.taskId) body.taskId = entry.taskId;

  const res = await fetch(`${BASE_URL}/workspaces/${wsId}/time-entries`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create time entry: ${res.status} ${text}`);
  }

  const data = await res.json() as { id: string };
  return data.id;
}

export async function getProjectsWithTasks(): Promise<Array<ClockifyProject & { tasks: ClockifyTask[] }>> {
  const projects = await getProjects();
  const results = await Promise.all(
    projects.map(async (p) => {
      const tasks = await getTasksForProject(p.id);
      return { ...p, tasks };
    })
  );
  return results;
}
