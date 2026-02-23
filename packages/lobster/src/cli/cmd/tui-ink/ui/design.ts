/** @jsxImportSource react */
import { useMemo } from "react"
import { useTheme, type ThemeColors } from "../theme"

export type BadgeTone = "accent" | "success" | "warning" | "error" | "muted"

export interface InkDesignTokens {
  panel: {
    background: string
    border: string
    borderActive: string
  }
  text: {
    primary: string
    muted: string
    accent: string
    selected: string
  }
  status: Record<BadgeTone, string>
  list: {
    selectedBackground: string
    selectedText: string
    marker: string
  }
  spacing: {
    x: number
    y: number
    gap: number
  }
}

function parseHexColor(input: string) {
  const value = input.trim()
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value)
  if (!match) return
  const raw = match[1]!
  if (raw.length === 3) {
    const r = Number.parseInt(raw[0]! + raw[0]!, 16)
    const g = Number.parseInt(raw[1]! + raw[1]!, 16)
    const b = Number.parseInt(raw[2]! + raw[2]!, 16)
    return { r, g, b }
  }
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  return { r, g, b }
}

function srgbToLinear(value: number) {
  const normalized = value / 255
  if (normalized <= 0.03928) return normalized / 12.92
  return ((normalized + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(input: string) {
  const rgb = parseHexColor(input)
  if (!rgb) return
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(left: string, right: string) {
  const l1 = relativeLuminance(left)
  const l2 = relativeLuminance(right)
  if (l1 === undefined || l2 === undefined) return 1
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function pickReadableText(background: string, preferred: string, fallback: string) {
  const candidates = Array.from(new Set([preferred, fallback, "#ffffff", "#000000"]))
  let best = candidates[0] ?? fallback
  let bestScore = -1
  for (const candidate of candidates) {
    const score = contrastRatio(background, candidate)
    if (score <= bestScore) continue
    best = candidate
    bestScore = score
  }
  return best
}

function buildTokens(theme: ThemeColors): InkDesignTokens {
  const selectedBackground = theme.primary
  const selectedText = pickReadableText(selectedBackground, theme.selectedListItemText, theme.text)
  return {
    panel: {
      background: theme.backgroundPanel,
      border: theme.border,
      borderActive: theme.borderActive,
    },
    text: {
      primary: theme.text,
      muted: theme.textMuted,
      accent: theme.accent,
      selected: theme.selectedListItemText,
    },
    status: {
      accent: theme.accent,
      success: theme.success,
      warning: theme.warning,
      error: theme.error,
      muted: theme.textMuted,
    },
    list: {
      selectedBackground,
      selectedText,
      marker: theme.secondary,
    },
    spacing: {
      x: 1,
      y: 1,
      gap: 1,
    },
  }
}

export function useDesignTokens() {
  const { theme } = useTheme()
  return useMemo(() => buildTokens(theme), [theme])
}

export function separator(width: number) {
  return "-".repeat(Math.max(8, width))
}
