export interface AutocompleteLayout {
  showDescription: boolean
  labelWidth: number
  descriptionWidth: number
}

export function truncateWithEllipsis(value: string, width: number): string {
  if (width <= 0) return ""
  if (value.length <= width) return value
  if (width <= 3) return ".".repeat(width)
  return `${value.slice(0, width - 3)}...`
}

export function computeAutocompleteLayout(totalWidth: number): AutocompleteLayout {
  const safeWidth = Math.max(20, totalWidth)
  const markerWidth = 2
  const descriptionThreshold = 60
  const showDescription = safeWidth >= descriptionThreshold

  if (!showDescription) {
    return {
      showDescription: false,
      labelWidth: Math.max(8, safeWidth - markerWidth),
      descriptionWidth: 0,
    }
  }

  const contentWidth = safeWidth - markerWidth - 1
  const rawLabel = Math.floor(contentWidth * 0.35)
  const labelWidth = Math.max(18, Math.min(38, rawLabel))
  const descriptionWidth = Math.max(12, contentWidth - labelWidth)

  return {
    showDescription: true,
    labelWidth,
    descriptionWidth,
  }
}
