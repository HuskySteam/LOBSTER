import { TextAttributes } from "@opentui/core"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "../ui/dialog"
import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "@tui/context/keybind"
import { createSignal, For } from "solid-js"

const KEYBIND_GROUPS = [
  {
    title: "Session",
    bindings: [
      { action: "New session", key: "session_new" },
      { action: "Switch session", key: "session_list" },
      { action: "Cancel session", key: undefined, label: "Ctrl+K" },
      { action: "Clear/restore chat", key: undefined, label: "Ctrl+L" },
    ],
  },
  {
    title: "Agent & Model",
    bindings: [
      { action: "Switch model", key: "model_list" },
      { action: "Cycle model", key: "model_cycle_recent" },
      { action: "Switch agent", key: "agent_list" },
      { action: "Cycle agent", key: "agent_cycle" },
    ],
  },
  {
    title: "Navigation",
    bindings: [
      { action: "Command palette", key: "command_list" },
      { action: "Toggle sidebar", key: "sidebar_toggle" },
      { action: "View status", key: "status_view" },
      { action: "Timeline", key: "timeline" },
    ],
  },
  {
    title: "System",
    bindings: [
      { action: "Switch theme", key: "theme_list" },
      { action: "Suspend terminal", key: "terminal_suspend" },
      { action: "Show shortcuts", key: undefined, label: "Ctrl+?" },
    ],
  },
]

export function DialogKeybinds() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const keybind = useKeybind()
  const [hover, setHover] = createSignal(false)

  useKeyboard((evt) => {
    if (evt.name === "return" || evt.name === "escape") {
      dialog.clear()
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Keyboard Shortcuts
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
      <scrollbox maxHeight={20}>
        <For each={KEYBIND_GROUPS}>
          {(group) => (
            <box paddingBottom={1}>
              <text attributes={TextAttributes.BOLD} fg={theme.text}>
                {group.title}
              </text>
              <For each={group.bindings}>
                {(binding) => {
                  const key = binding.label ?? (binding.key ? keybind.print(binding.key as any) : "")
                  return (
                    <box flexDirection="row" justifyContent="space-between" paddingLeft={1}>
                      <text fg={theme.textMuted}>{binding.action}</text>
                      <text fg={theme.text}>{key || "\u2014"}</text>
                    </box>
                  )
                }}
              </For>
            </box>
          )}
        </For>
      </scrollbox>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={() => dialog.clear()}>
          <text fg={theme.selectedListItemText}>ok</text>
        </box>
      </box>
    </box>
  )
}
