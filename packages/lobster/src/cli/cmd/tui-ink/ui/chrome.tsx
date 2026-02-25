/** @jsxImportSource react */
import React from "react"
import { Box, Text } from "ink"
import { useDesignTokens, type BadgeTone } from "./design"

export function PanelHeader(props: { title: string; subtitle?: string; right?: string }) {
  const tokens = useDesignTokens()
  return (
    <Box justifyContent="space-between">
      <Box gap={1}>
        <Text color={tokens.text.primary}>{props.title}</Text>
        {props.subtitle ? <Text color={tokens.text.muted}>{props.subtitle}</Text> : null}
      </Box>
      {props.right ? <Text color={tokens.text.muted}>{props.right}</Text> : null}
    </Box>
  )
}

export function SegmentedTabs<T extends string>(props: {
  active: T
  tabs: Array<{ id: T; label: string; count?: number }>
  onSelect: (id: T) => void
}) {
  const tokens = useDesignTokens()
  return (
    <Box gap={2} marginTop={1} marginBottom={1}>
      {props.tabs.map((tab) => {
        const active = tab.id === props.active
        const suffix = tab.count === undefined ? "" : ` ${tab.count}`
        return (
          <Box key={tab.id}>
            <Text color={active ? tokens.text.primary : tokens.text.muted} bold={active} dimColor={!active}>
              {`${tab.label}${suffix}`}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

export function StatusBadge(props: { tone?: BadgeTone; label: string }) {
  const tokens = useDesignTokens()
  const tone = props.tone ?? "muted"
  return <Text color={tokens.status[tone]}>{props.label}</Text>
}

export function KeyHints(props: { items: string[] }) {
  const tokens = useDesignTokens()
  return (
    <Box gap={1} marginTop={1}>
      {props.items.map((item, index) => (
        <React.Fragment key={item}>
          {index > 0 && (
            <Text color={tokens.text.muted} dimColor>
              ·
            </Text>
          )}
          <Text color={tokens.text.muted} dimColor>
            {item}
          </Text>
        </React.Fragment>
      ))}
    </Box>
  )
}

export function EmptyState(props: { title: string; detail?: string }) {
  const tokens = useDesignTokens()
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={tokens.text.muted}>{props.title}</Text>
      {props.detail ? (
        <Text color={tokens.text.muted} dimColor>
          {props.detail}
        </Text>
      ) : null}
    </Box>
  )
}
