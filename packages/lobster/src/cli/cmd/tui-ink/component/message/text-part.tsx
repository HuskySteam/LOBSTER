/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { useTheme, type ThemeColors } from "../../theme"

/**
 * Renders assistant text with basic markdown formatting.
 * Handles code blocks, inline code, bold, italic, and links.
 */
export function TextPart(props: { text: string }) {
  const { theme } = useTheme()
  const trimmed = props.text.trim()
  if (!trimmed) return null

  const lines = trimmed.split("\n")
  const elements: React.ReactElement[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(
        <Box key={`code-${elements.length}`} flexDirection="column" marginTop={0} marginBottom={0} paddingLeft={1}>
          {lang && <Text color={theme.textMuted} dimColor>{lang}</Text>}
          {codeLines.map((cl, j) => (
            <Text key={j} color={theme.accent}>{cl}</Text>
          ))}
        </Box>,
      )
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      elements.push(
        <Text key={`h-${elements.length}`} color={theme.primary} bold>
          {headingMatch[2]}
        </Text>,
      )
      i++
      continue
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<Text key={`br-${elements.length}`}>{""}</Text>)
      i++
      continue
    }

    // Normal line with inline formatting
    elements.push(
      <InlineText key={`t-${elements.length}`} line={line} theme={theme} />,
    )
    i++
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {elements}
    </Box>
  )
}

function InlineText(props: { line: string; theme: ThemeColors }) {
  const { line, theme } = props
  // Simple rendering: bold (**text**), inline code (`text`), italic (*text*)
  const parts: React.ReactElement[] = []
  let remaining = line
  let key = 0

  while (remaining.length > 0) {
    // Bold **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/)
    if (boldMatch) {
      parts.push(<Text key={key++} bold>{boldMatch[1]}</Text>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Inline code `text`
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      parts.push(<Text key={key++} color={theme.accent}>{codeMatch[1]}</Text>)
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Italic *text*
    const italicMatch = remaining.match(/^\*([^*]+)\*/)
    if (italicMatch) {
      parts.push(<Text key={key++} dimColor>{italicMatch[1]}</Text>)
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    // Regular text up to next special char
    const nextSpecial = remaining.search(/[*`]/)
    if (nextSpecial === -1) {
      parts.push(<Text key={key++} color={theme.text}>{remaining}</Text>)
      break
    }
    if (nextSpecial > 0) {
      parts.push(<Text key={key++} color={theme.text}>{remaining.slice(0, nextSpecial)}</Text>)
      remaining = remaining.slice(nextSpecial)
      continue
    }
    // Special char that didn't match a pattern - consume it
    parts.push(<Text key={key++} color={theme.text}>{remaining[0]}</Text>)
    remaining = remaining.slice(1)
  }

  return <Text>{parts}</Text>
}
