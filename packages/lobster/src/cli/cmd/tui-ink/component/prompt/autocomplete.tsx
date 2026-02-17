/** @jsxImportSource react */
import { Box, Text } from "ink"
import React, { useMemo } from "react"
import { useTheme } from "../../theme"

export interface AutocompleteOption {
  label: string
  value: string
  description?: string
}

interface AutocompleteProps {
  options: AutocompleteOption[]
  selected: number
  maxVisible?: number
}

export function Autocomplete({ options, selected, maxVisible = 8 }: AutocompleteProps) {
  const { theme } = useTheme()

  const { visible, offset } = useMemo(() => {
    if (options.length <= maxVisible) return { visible: options, offset: 0 }
    const half = Math.floor(maxVisible / 2)
    let off = 0
    if (selected < half) off = 0
    else if (selected > options.length - maxVisible + half) off = options.length - maxVisible
    else off = selected - half
    return { visible: options.slice(off, off + maxVisible), offset: off }
  }, [options, selected, maxVisible])

  if (options.length === 0) return null

  let globalIdx = offset

  return (
    <Box
      flexDirection="column"
      marginLeft={1}
      borderStyle="round"
      borderColor={theme.border}
      paddingLeft={1}
      paddingRight={1}
    >
      {offset > 0 && (
        <Text color={theme.textMuted} dimColor>
          {"  "}... {offset} more above
        </Text>
      )}
      {visible.map((opt) => {
        const idx = globalIdx++
        const isSelected = idx === selected
        return (
          <Box key={opt.value + idx} gap={1}>
            <Text color={isSelected ? theme.secondary : theme.text} bold={isSelected}>
              {isSelected ? "▸" : " "} {opt.label}
            </Text>
            {opt.description && (
              <Text color={isSelected ? theme.secondary : theme.textMuted} dimColor={!isSelected}>
                {opt.description}
              </Text>
            )}
          </Box>
        )
      })}
      {offset + maxVisible < options.length && (
        <Text color={theme.textMuted} dimColor>
          {"  "}... {options.length - offset - maxVisible} more below
        </Text>
      )}
    </Box>
  )
}
