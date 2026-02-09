import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useLobster } from "@tui/context/lobster"
import type { PatternInsight } from "@tui/context/lobster"
import { Show, For, createSignal, createMemo } from "solid-js"

export function DialogPatterns() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const lobster = useLobster()
  const [hover, setHover] = createSignal(false)

  const antipatterns = createMemo(() =>
    lobster.patterns().filter((p: PatternInsight) => p.type === "recurring_antipattern")
  )

  const trends = createMemo(() =>
    lobster.patterns().filter(
      (p: PatternInsight) => p.type === "improving_trend" || p.type === "degrading_trend"
    )
  )

  const lessons = createMemo(() =>
    lobster.patterns().filter((p: PatternInsight) => p.type === "lesson_learned")
  )

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Pattern Insights
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
        when={lobster.patterns().length > 0}
        fallback={
          <box gap={1}>
            <text fg={theme.textMuted}>No pattern insights yet</text>
            <text fg={theme.textMuted}>
              Run <span style={{ fg: theme.accent }}>/patterns</span> or complete a{" "}
              <span style={{ fg: theme.accent }}>review_loop</span> to generate insights
            </text>
          </box>
        }
      >
        <Show when={antipatterns().length > 0}>
          <box>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Recurring Anti-Patterns
            </text>
            <For each={antipatterns()}>
              {(pattern) => (
                <box>
                  <box flexDirection="row" gap={1}>
                    <text
                      fg={
                        pattern.trend === "degrading"
                          ? theme.error
                          : pattern.trend === "improving"
                            ? theme.success
                            : theme.warning
                      }
                    >
                      {"\u25B2"}
                    </text>
                    <text fg={theme.text}>
                      {pattern.title}{" "}
                      <span style={{ fg: theme.textMuted }}>
                        ({pattern.frequency}x, {pattern.trend})
                      </span>
                    </text>
                  </box>
                  <Show when={pattern.related_files.length > 0}>
                    <text fg={theme.textMuted}>
                      {"  Last seen: "}
                      {pattern.related_files.join(", ")}
                    </text>
                  </Show>
                </box>
              )}
            </For>
          </box>
        </Show>

        <Show when={trends().length > 0}>
          <box>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Trends
            </text>
            <For each={trends()}>
              {(pattern) => (
                <box flexDirection="row" gap={1}>
                  <text
                    fg={
                      pattern.trend === "improving"
                        ? theme.success
                        : theme.error
                    }
                  >
                    {pattern.trend === "improving" ? "\u2191" : "\u2193"}
                  </text>
                  <text
                    fg={
                      pattern.trend === "improving"
                        ? theme.success
                        : theme.error
                    }
                  >
                    {pattern.title}
                  </text>
                  <text fg={theme.textMuted}>
                    {pattern.description}
                  </text>
                </box>
              )}
            </For>
          </box>
        </Show>

        <Show when={lessons().length > 0}>
          <box>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Lessons Learned
            </text>
            <For each={lessons()}>
              {(pattern) => (
                <box>
                  <box flexDirection="row" gap={1}>
                    <text fg={theme.text}>*</text>
                    <text fg={theme.text}>{pattern.title}</text>
                  </box>
                  <Show when={pattern.description}>
                    <text fg={theme.textMuted}>{"  "}{pattern.description}</text>
                  </Show>
                </box>
              )}
            </For>
          </box>
        </Show>
      </Show>
    </box>
  )
}
