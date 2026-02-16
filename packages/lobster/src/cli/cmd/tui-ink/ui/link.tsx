/** @jsxImportSource react */
import { Text } from "ink"
import React, { type ReactNode } from "react"
import { useTheme } from "../theme"

interface LinkProps {
  href: string
  children?: ReactNode
}

export function Link(props: LinkProps) {
  const { theme } = useTheme()
  return (
    <Text color={theme.accent} underline>
      {props.children ?? props.href}
    </Text>
  )
}
