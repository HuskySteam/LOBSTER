import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { For, Show, createMemo } from "solid-js"
import { TextAttributes } from "@opentui/core"

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.substring(0, max - 1) + "\u2026"
}

export function TeamTasks(props: { teamName: string }) {
  const sync = useSync()
  const { theme } = useTheme()

  const tasks = createMemo(() => (sync.data.team_tasks[props.teamName] ?? []).filter((t) => t.status !== "deleted"))

  const statusColor = (task: { status: string; blockedBy: string[] }) => {
    if (task.blockedBy.length > 0) return theme.error
    if (task.status === "in_progress") return theme.warning
    if (task.status === "completed") return theme.success
    return theme.textMuted
  }

  const statusLabel = (task: { status: string; blockedBy: string[] }) => {
    if (task.blockedBy.length > 0) return "blocked"
    return task.status
  }

  return (
    <Show when={tasks().length > 0}>
      <box gap={0}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Team Tasks
        </text>
        <For each={tasks()}>
          {(task) => (
            <box flexDirection="row" gap={1}>
              <text flexShrink={0} style={{ fg: statusColor(task) }}>
                {"\u2022"}
              </text>
              <text flexShrink={0} fg={theme.textMuted}>
                #{task.id.slice(0, 4)}
              </text>
              <text fg={theme.text} wrapMode="none" flexGrow={1}>
                {truncate(task.subject, 28)}
              </text>
              <text flexShrink={0} fg={statusColor(task)}>
                {statusLabel(task)}
              </text>
              <Show when={task.owner}>
                <text flexShrink={0} fg={theme.textMuted}>
                  @{task.owner}
                </text>
              </Show>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}
