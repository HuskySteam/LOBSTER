import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { For, Show, createMemo } from "solid-js"
import { TextAttributes } from "@opentui/core"

export function TeamStatus(props: { teamName: string }) {
  const sync = useSync()
  const { theme } = useTheme()

  const team = createMemo(() => sync.data.teams[props.teamName])
  const tasks = createMemo(() => sync.data.team_tasks[props.teamName] ?? [])

  const taskSummary = createMemo(() => {
    const all = tasks().filter((t) => t.status !== "deleted")
    return {
      total: all.length,
      in_progress: all.filter((t) => t.status === "in_progress").length,
      completed: all.filter((t) => t.status === "completed").length,
      blocked: all.filter((t) => t.blockedBy.length > 0).length,
    }
  })

  const progress = createMemo(() => {
    const summary = taskSummary()
    if (summary.total === 0) return { percent: 0, filled: 0, barWidth: 20 }
    const percent = Math.round((summary.completed / summary.total) * 100)
    const barWidth = 20
    const filled = Math.round((percent / 100) * barWidth)
    return { percent, filled, barWidth }
  })

  const statusColor = (status: string) => {
    if (status === "active" || status === "working" || status === "busy") return theme.success
    if (status === "idle" || status === "waiting") return theme.warning
    if (status === "shutdown" || status === "disconnected" || status === "error") return theme.error
    return theme.textMuted
  }

  return (
    <Show when={team()}>
      <box gap={1}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Team
          </text>
          <text fg={theme.accent}>{team()!.name}</text>
          <text fg={theme.textMuted}>({team()!.members.length} members)</text>
        </box>
        <box>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Members
          </text>
          <For each={team()!.members}>
            {(member) => (
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} style={{ fg: statusColor(member.status) }}>
                  {"\u2022"}
                </text>
                <text fg={theme.text} wrapMode="none">
                  {member.name}
                </text>
                <text fg={theme.textMuted}>{member.agentType}</text>
                <text fg={statusColor(member.status)}>{member.status}</text>
              </box>
            )}
          </For>
        </box>
        <Show when={tasks().length > 0}>
          <box>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Tasks
            </text>
            <box flexDirection="row" gap={2}>
              <text fg={theme.textMuted}>{taskSummary().total} total</text>
              <Show when={taskSummary().in_progress > 0}>
                <text fg={theme.warning}>{taskSummary().in_progress} active</text>
              </Show>
              <Show when={taskSummary().completed > 0}>
                <text fg={theme.success}>{taskSummary().completed} done</text>
              </Show>
              <Show when={taskSummary().blocked > 0}>
                <text fg={theme.error}>{taskSummary().blocked} blocked</text>
              </Show>
            </box>
            <text fg={theme.textMuted}>
              Progress: [
              <span style={{ fg: theme.success }}>
                {"=".repeat(progress().filled)}{progress().filled < progress().barWidth ? ">" : ""}
              </span>
              <span style={{ fg: theme.textMuted }}>
                {" ".repeat(Math.max(0, progress().barWidth - progress().filled - (progress().filled < progress().barWidth ? 1 : 0)))}
              </span>
              ] {progress().percent}% ({taskSummary().completed}/{taskSummary().total})
            </text>
          </box>
        </Show>
      </box>
    </Show>
  )
}
