/** @jsxImportSource react */
import { Box, Text, useStdout } from "ink"
import React, { useMemo } from "react"
import { useTheme } from "../../theme"
import { computeAutocompleteLayout, truncateWithEllipsis } from "./autocomplete-layout"

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
  const { stdout } = useStdout()
  const popupWidth = useMemo(
    () => Math.max(30, Math.min(120, (stdout?.columns ?? 80) - 4)),
    [stdout?.columns],
  )
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
      borderStyle="round"
      borderColor={theme.border}
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
          <Box key={opt.value + idx} flexDirection="row" overflow="hidden">
            <Text color={isSelected ? theme.secondary : theme.text} bold={isSelected}>
              {marker}
              {label}
            </Text>
            {layout.showDescription && opt.description && (
              <Text color={isSelected ? theme.secondary : theme.textMuted} dimColor={!isSelected}>
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
