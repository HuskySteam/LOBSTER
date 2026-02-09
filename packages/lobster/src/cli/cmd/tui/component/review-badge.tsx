import { Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useLobster } from "../context/lobster"

interface ReviewBadgeProps {
  compact?: boolean
}

export function ReviewBadge(props: ReviewBadgeProps) {
  const { theme } = useTheme()
  const lobster = useLobster()

  return (
    <Show when={!props.compact} fallback={
      <text fg={theme.info}>↻ {lobster.reviewLoop()?.phase}</text>
    }>
      <text fg={theme.warning}>
        iter {lobster.reviewLoop()?.iteration ?? 0}/{lobster.reviewLoop()?.max_iterations ?? "?"}
      </text>
    </Show>
  )
}
