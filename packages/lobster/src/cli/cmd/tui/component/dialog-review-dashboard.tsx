import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useLobster } from "@tui/context/lobster"
import { Show, For, createSignal } from "solid-js"

function progressBar(percent: number, width: number = 20): string {
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * width)
  const empty = width - filled
  return "\u2588".repeat(filled) + "\u2591".repeat(empty)
}

export function DialogReviewDashboard() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const lobster = useLobster()
  const [hover, setHover] = createSignal(false)

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Review Loop Dashboard
        </text>
        <box
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={hover() ? theme.primary : undefined}
          onMouseOver={() => setHover(true)}
          onMouseOut={() => setHover(false)}
          onMouseUp={() => dialog.clear()}
        >
          <text fg={hover() ? theme.selectedListItemText : theme.textMuted}>esc</text>
        </box>
      </box>

      <Show
        when={lobster.reviewLoop()}
        fallback={
          <box gap={1}>
            <text fg={theme.textMuted}>No active review loop</text>
            <text fg={theme.textMuted}>
              Use <span style={{ fg: theme.accent }}>/review</span> command to start a review loop
            </text>
          </box>
        }
      >
        {(rl) => (
          <>
            <box>
              <text fg={theme.text}>
                Task: <span style={{ fg: theme.accent }}>{rl().task ?? "unnamed task"}</span>
              </text>
              <text fg={theme.text}>
                Iteration: <span style={{ fg: theme.accent }}>{rl().iteration ?? 0}</span>
                {" / "}
                <span style={{ fg: theme.textMuted }}>{rl().max_iterations ?? "?"}</span>
              </text>
            </box>

            <box>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                Phase:
              </text>
              <box flexDirection="row">
                <For each={lobster.phaseList()}>
                  {(phase, index) => (
                    <box flexDirection="row">
                      <Show when={index() > 0}>
                        <text fg={theme.textMuted}>{" \u2500\u2500\u25B6 "}</text>
                      </Show>
                      <text
                        fg={
                          phase.status === "active"
                            ? theme.accent
                            : phase.status === "done"
                              ? theme.success
                              : theme.textMuted
                        }
                        attributes={phase.status === "active" ? TextAttributes.BOLD : undefined}
                      >
                        [{phase.name}]
                      </text>
                    </box>
                  )}
                </For>
              </box>
              <box flexDirection="row">
                <For each={lobster.phaseList()}>
                  {(phase, index) => (
                    <box flexDirection="row">
                      <Show when={index() > 0}>
                        <text fg={theme.textMuted}>{"     "}</text>
                      </Show>
                      <text
                        fg={
                          phase.status === "active"
                            ? theme.accent
                            : phase.status === "done"
                              ? theme.success
                              : theme.textMuted
                        }
                      >
                        {phase.status === "active"
                          ? " ACTIVE "
                          : phase.status === "done"
                            ? "  done  "
                            : "waiting "}
                      </text>
                    </box>
                  )}
                </For>
              </box>
            </box>

            <box>
              <text fg={theme.text} attributes={TextAttributes.BOLD}>
                Quality Score:
              </text>
              <box flexDirection="row" gap={1}>
                <text
                  fg={
                    lobster.qualityScore() >= 70
                      ? theme.success
                      : lobster.qualityScore() >= 40
                        ? theme.warning
                        : theme.error
                  }
                >
                  {progressBar(lobster.qualityScore())}
                </text>
                <text fg={theme.text}>{lobster.qualityScore()}%</text>
              </box>
            </box>

            <Show when={rl().history && rl().history!.length > 0}>
              <box>
                <text fg={theme.text} attributes={TextAttributes.BOLD}>
                  Verdict History:
                </text>
                <For each={rl().history}>
                  {(entry) => (
                    <box>
                      <box flexDirection="row" gap={1}>
                        <text fg={theme.textMuted}>#{entry.iteration}:</text>
                        <text
                          fg={
                            entry.verdict === "PASS"
                              ? theme.success
                              : entry.verdict === "NEEDS_REVISION"
                                ? theme.warning
                                : theme.accent
                          }
                          attributes={TextAttributes.BOLD}
                        >
                          {entry.verdict}
                        </text>
                        <Show when={entry.issues && entry.issues.length > 0}>
                          <text fg={theme.textMuted}>
                            ({entry.issues!.length} {entry.issues!.length === 1 ? "issue" : "issues"})
                          </text>
                        </Show>
                      </box>
                      <Show when={entry.issues && entry.issues.length > 0}>
                        <For each={entry.issues}>
                          {(issue) => (
                            <text fg={theme.textMuted}>  - {issue}</text>
                          )}
                        </For>
                      </Show>
                    </box>
                  )}
                </For>
              </box>
            </Show>

            <Show when={lobster.totalIssuesFound() > 0}>
              <text fg={theme.textMuted}>
                Total issues found: {lobster.totalIssuesFound()}
              </text>
            </Show>
          </>
        )}
      </Show>
    </box>
  )
}
