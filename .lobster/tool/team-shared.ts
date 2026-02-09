import path from "path"

export interface Subtask {
  id: number
  title: string
  description: string
  assigned_to: string
  status: "pending" | "assigned" | "in_progress" | "completed" | "blocked" | "failed"
  depends_on: number[]
  priority: "high" | "medium" | "low"
  files_affected: string[]
  result?: { summary: string, files_changed: string[], issues_found?: string[], verdict?: string }
  started_at?: string
  completed_at?: string
}

export interface TeamSession {
  id: string
  task: string
  created_at: string
  updated_at: string
  status: "planning" | "active" | "completed" | "failed"
  subtasks: Subtask[]
  plan_id?: string
}

export function detectFileConflicts(subtasks: Subtask[]): Array<{ file: string, subtasks: number[] }> {
  const fileMap: Record<string, number[]> = {}
  for (const st of subtasks) {
    for (const file of st.files_affected) {
      if (!fileMap[file]) fileMap[file] = []
      fileMap[file].push(st.id)
    }
  }
  return Object.entries(fileMap)
    .filter(([_, ids]) => ids.length > 1)
    .map(([file, ids]) => ({ file, subtasks: ids }))
}

export async function loadSession(
  teamDir: string,
  sessionId?: string
): Promise<{ session: TeamSession, sessionPath: string } | { error: string }> {
  let resolvedId = sessionId
  if (!resolvedId) {
    const latestPath = path.join(teamDir, "latest.json")
    const latestFile = Bun.file(latestPath)
    const exists = await latestFile.exists()
    if (!exists) {
      return { error: "No team sessions found. Use the `team_coordinate` tool to create one." }
    }
    const latest = await latestFile.json().catch(() => null)
    if (!latest?.id) {
      return { error: "Could not read latest session pointer." }
    }
    resolvedId = latest.id
  }

  const sessionPath = path.join(teamDir, `${resolvedId}.json`)
  const sessionFile = Bun.file(sessionPath)
  const exists = await sessionFile.exists()

  if (!exists) {
    return { error: `Team session not found: ${resolvedId}` }
  }

  const session: TeamSession | null = await sessionFile.json().catch(() => null)
  if (!session) {
    return { error: `Team session file is corrupted: ${resolvedId}` }
  }

  return { session, sessionPath }
}
