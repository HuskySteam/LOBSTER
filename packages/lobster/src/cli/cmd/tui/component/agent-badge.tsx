import { Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useLocal } from "../context/local"

interface AgentBadgeProps {
  name: string
  variant: "pill" | "dot"
}

export function AgentBadge(props: AgentBadgeProps) {
  const { theme } = useTheme()
  const local = useLocal()

  return (
    <Show when={props.variant === "pill"} fallback={
      <text fg={theme.text}>
        <span style={{ fg: local.agent.color(props.name) }}>●</span> {props.name}
      </text>
    }>
      <box backgroundColor={local.agent.color(props.name)} flexShrink={0}>
        <text fg={theme.background}>
          {" "}{props.name}{" "}
        </text>
      </box>
    </Show>
  )
}
