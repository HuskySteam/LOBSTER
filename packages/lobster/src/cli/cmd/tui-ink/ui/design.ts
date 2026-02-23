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

function buildTokens(theme: ThemeColors): InkDesignTokens {
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
      selectedBackground: theme.primary,
      selectedText: theme.selectedListItemText,
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
