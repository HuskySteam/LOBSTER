/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { useTheme } from "../theme"
import { logo, decoChars } from "@/cli/logo"

const DECO_SET = new Set(decoChars)
const MASCOT_COLOR = "#ff5a1f"
const MASCOT = [
  "    █      █",
  "     █    █",
  "  ████████████",
  "  ██  ████  ██",
  "  ████████████",
  " ██  ██  ██  ██",
]

function tintHex(base: string, overlay: string, alpha: number): string {
  const parseHex = (hex: string) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  })
  if (!base || !overlay) return base || overlay || "#000000"
  const b = parseHex(base)
  const o = parseHex(overlay)
  const r = Math.round(b.r + (o.r - b.r) * alpha)
  const g = Math.round(b.g + (o.g - b.g) * alpha)
  const bl = Math.round(b.b + (o.b - b.b) * alpha)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`
}

export function Logo() {
  const { theme } = useTheme()

  const renderLine = (line: string, lineIndex: number) => {
    const fg = theme.text
    const accent = theme.accent
    const shadow = tintHex(theme.background || "#0a0a0a", fg, 0.25)
    const elements: React.ReactNode[] = []
    let textBuf = ""
    let decoBuf = ""
    let key = 0

    const flushText = () => {
      if (textBuf) {
        elements.push(<Text key={key++} color={fg} bold>{textBuf}</Text>)
        textBuf = ""
      }
    }

    const flushDeco = () => {
      if (decoBuf) {
        elements.push(<Text key={key++} color={accent}>{decoBuf}</Text>)
        decoBuf = ""
      }
    }

    for (const ch of line) {
      if (DECO_SET.has(ch)) {
        flushText()
        decoBuf += ch
      } else if (ch === "_" || ch === "^" || ch === "~") {
        flushText()
        flushDeco()
        switch (ch) {
          case "_":
            elements.push(<Text key={key++} color={fg} backgroundColor={shadow} bold>{" "}</Text>)
            break
          case "^":
            elements.push(<Text key={key++} color={fg} backgroundColor={shadow} bold>{"▀"}</Text>)
            break
          case "~":
            elements.push(<Text key={key++} color={shadow} bold>{"▀"}</Text>)
            break
        }
      } else {
        flushDeco()
        textBuf += ch
      }
    }

    flushText()
    flushDeco()

    return <Box key={lineIndex} flexDirection="row">{elements}</Box>
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        {MASCOT.map((line, index) => (
          <Text key={`mascot-${index}`} color={MASCOT_COLOR} bold>
            {line}
          </Text>
        ))}
      </Box>
      {logo.map((line, i) => renderLine(line, i))}
    </Box>
  )
}
