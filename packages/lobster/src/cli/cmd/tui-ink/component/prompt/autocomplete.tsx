/** @jsxImportSource react */
import { Box, Text } from "ink"
import React, { useMemo } from "react"
import { useTheme } from "../../theme"
import { computeAutocompleteLayout, truncateWithEllipsis } from "./autocomplete-layout"
import { useDesignTokens } from "../../ui/design"

export interface AutocompleteOption {
  label: string
  value: string
  description?: string
}

interface AutocompleteProps {
  options: AutocompleteOption[]
  selected: number
  maxVisible?: number
  width?: number
}

export function Autocomplete({ options, selected, maxVisible = 8, width }: AutocompleteProps) {
  const { theme } = useTheme()
  const tokens = useDesignTokens()
  const popupWidth = useMemo(() => {
    const layoutWidth = width ?? 80
    const available = Math.max(16, layoutWidth - 1)
    return Math.min(120, available)
  }, [width])
  const contentWidth = useMemo(() => Math.max(20, popupWidth - 4), [popupWidth])
  const layout = useMemo(() => computeAutocompleteLayout(contentWidth), [contentWidth])

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
      borderStyle="single"
      borderColor={tokens.panel.borderActive}
      paddingLeft={1}
      paddingRight={1}
      width={popupWidth}
      overflow="hidden"
    >
      {offset > 0 && (
        <Text color={theme.textMuted} dimColor>
          {"  "}... {offset} more above
        </Text>
      )}
      {visible.map((opt) => {
        const idx = globalIdx++
        const isSelected = idx === selected
        const marker = isSelected ? "> " : "  "
        const label = truncateWithEllipsis(opt.label, layout.labelWidth).padEnd(layout.labelWidth, " ")
        const description = truncateWithEllipsis(opt.description ?? "", layout.descriptionWidth)
        return (
          <Box key={`${opt.value}:${opt.label}`} flexDirection="row" overflow="hidden">
            <Text
              color={isSelected ? tokens.list.selectedText : theme.text}
              bold={isSelected}
              backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
            >
              {marker}
              {label}
            </Text>
            {layout.showDescription && opt.description && (
              <Text
                color={isSelected ? tokens.list.selectedText : theme.textMuted}
                dimColor={!isSelected}
                backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
              >
                {" "}
                {description}
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
