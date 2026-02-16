/** @jsxImportSource react */
import { Text } from "ink"
import React from "react"
import { useTheme } from "../theme"

interface ReviewBadgeProps {
  phase?: string
  iteration?: number
  maxIterations?: number
  compact?: boolean
}

export function ReviewBadge(props: ReviewBadgeProps) {
  const { theme } = useTheme()

  if (!props.phase && props.iteration === undefined) return null

  if (props.compact) {
    return <Text color={theme.accent}>{"↻ "}{props.phase ?? "review"}</Text>
  }

  return (
    <Text color={theme.warning}>
      iter {props.iteration ?? 0}/{props.maxIterations ?? "?"}
    </Text>
  )
}
