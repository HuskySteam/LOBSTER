/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { useTheme } from "../theme"

interface AgentBadgeProps {
  name: string
  variant: "pill" | "dot"
  color?: string
}

export function AgentBadge(props: AgentBadgeProps) {
  const { theme } = useTheme()
  const color = props.color ?? theme.secondary

  if (props.variant === "pill") {
    return (
      <Box flexShrink={0}>
        <Text backgroundColor={color} color={theme.background}>
          {" "}{props.name}{" "}
        </Text>
      </Box>
    )
  }

  return (
    <Text color={theme.text}>
      <Text color={color}>{"●"}</Text> {props.name}
    </Text>
  )
}
