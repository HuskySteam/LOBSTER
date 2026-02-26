/** @jsxImportSource react */
import { Text } from "ink"
import React, { type ReactNode } from "react"
import { useTheme } from "../theme"

interface LinkProps {
  href: string
  children?: ReactNode
}

const OSC = "\u001B]"
const BEL = "\u0007"

export function formatTerminalHyperlink(label: string, href: string) {
  return `${OSC}8;;${href}${BEL}${label}${OSC}8;;${BEL}`
}

export function Link(props: LinkProps) {
  const { theme } = useTheme()
  const label =
    typeof props.children === "string" || typeof props.children === "number" ? String(props.children) : props.href

  return (
    <Text color={theme.accent} underline>
      {formatTerminalHyperlink(label, props.href)}
    </Text>
  )
}
