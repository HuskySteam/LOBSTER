import { type Accessor, createMemo, createSignal, Match, Show, Switch } from "solid-js"
import { useRouteData } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { EmptyBorder } from "@tui/component/border"
import type { Session } from "@lobster-ai/sdk/v2"
import { useCommandDialog } from "@tui/component/dialog-command"
import { useKeybind } from "../../context/keybind"
import { useTerminalDimensions } from "@opentui/solid"
import { useSessionCost } from "../../hooks/use-session-cost"
import { useContextTokens } from "../../hooks/use-context-tokens"
import { useLocal } from "../../context/local"

export function Header() {
  const route = useRouteData("session")
  const sync = useSync()
  const session = createMemo(() => sync.session.get(route.sessionID)!)
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? [])

  const cost = useSessionCost(messages)

  const contextTokens = useContextTokens(messages, () => sync.data.provider)
  const context = createMemo(() => contextTokens()?.display)

  const { theme } = useTheme()
  const keybind = useKeybind()
  const command = useCommandDialog()
  const local = useLocal()
  const [hover, setHover] = createSignal<"parent" | "prev" | "next" | null>(null)
  const dimensions = useTerminalDimensions()
  const narrow = createMemo(() => dimensions().width < 80)

  return (
    <box flexShrink={0}>
      <box
        paddingTop={1}
        paddingLeft={1}
        paddingRight={1}
        paddingBottom={1}
        flexShrink={0}
      >
        <Switch>
          <Match when={session()?.parentID}>
            <box flexDirection="column" gap={1}>
              <box flexDirection={narrow() ? "column" : "row"} justifyContent="space-between" gap={narrow() ? 1 : 0}>
                <text fg={theme.text}>
                  Subagent session
                </text>
                <box flexDirection="row" gap={1} flexShrink={0}>
                  <Show when={context()}>
                    <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
                      {local.model.parsed().model} · {context()} · {cost()}
                    </text>
                  </Show>
                </box>
              </box>
              <box flexDirection="row" gap={2}>
                <box
                  onMouseOver={() => setHover("parent")}
                  onMouseOut={() => setHover(null)}
                  onMouseUp={() => command.trigger("session.parent")}
                  backgroundColor={hover() === "parent" ? theme.backgroundElement : undefined}
                >
                  <text fg={theme.text}>
                    Parent <span style={{ fg: theme.textMuted }}>{keybind.print("session_parent")}</span>
                  </text>
                </box>
                <box
                  onMouseOver={() => setHover("prev")}
                  onMouseOut={() => setHover(null)}
                  onMouseUp={() => command.trigger("session.child.previous")}
                  backgroundColor={hover() === "prev" ? theme.backgroundElement : undefined}
                >
                  <text fg={theme.text}>
                    Prev <span style={{ fg: theme.textMuted }}>{keybind.print("session_child_cycle_reverse")}</span>
                  </text>
                </box>
                <box
                  onMouseOver={() => setHover("next")}
                  onMouseOut={() => setHover(null)}
                  onMouseUp={() => command.trigger("session.child.next")}
                  backgroundColor={hover() === "next" ? theme.backgroundElement : undefined}
                >
                  <text fg={theme.text}>
                    Next <span style={{ fg: theme.textMuted }}>{keybind.print("session_child_cycle")}</span>
                  </text>
                </box>
              </box>
            </box>
          </Match>
          <Match when={true}>
            <box flexDirection={narrow() ? "column" : "row"} justifyContent="space-between" gap={1}>
              <text fg={theme.text}>{session()?.title}</text>
              <box flexDirection="row" gap={1} flexShrink={0}>
                <Show when={context()}>
                  <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
                    {local.model.parsed().model} · {context()} · {cost()}
                  </text>
                </Show>
              </box>
            </box>
          </Match>
        </Switch>
      </box>
      <box border={["top"]} borderColor={theme.borderSubtle} customBorderChars={{...EmptyBorder, horizontal: "─"}} />
    </box>
  )
}
