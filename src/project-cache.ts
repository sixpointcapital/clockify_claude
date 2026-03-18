import { getProjects, getProjectsWithTasks, type ClockifyProject, type ClockifyTask } from "./clockify-api.js";

export type ProjectWithTasks = ClockifyProject & { tasks: ClockifyTask[] };

let cachedProjects: ClockifyProject[] | null = null;
let cachedProjectsWithTasks: ProjectWithTasks[] | null = null;

/**
 * Get projects from cache, fetching only on first call or after refresh.
 */
export async function getCachedProjects(): Promise<ClockifyProject[]> {
  if (!cachedProjects) {
    cachedProjects = await getProjects();
  }
  return cachedProjects;
}

/**
 * Get projects with tasks from cache, fetching only on first call or after refresh.
 */
export async function getCachedProjectsWithTasks(): Promise<ProjectWithTasks[]> {
  if (!cachedProjectsWithTasks) {
    cachedProjectsWithTasks = await getProjectsWithTasks();
  }
  return cachedProjectsWithTasks;
}

/**
 * Clear the cache so next call fetches fresh data.
 */
export function refreshProjectCache(): void {
  cachedProjects = null;
  cachedProjectsWithTasks = null;
}

/**
 * Resolve a project name to its ID using the cache.
 */
export async function resolveProjectId(name: string): Promise<string | null> {
  const projects = await getCachedProjects();
  const match = projects.find(p => p.name.toLowerCase() === name.toLowerCase());
  return match?.id ?? null;
}
