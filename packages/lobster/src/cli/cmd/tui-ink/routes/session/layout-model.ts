export const PANEL_TABS = ["context", "logbook", "diff", "activity"] as const

export type PanelTab = (typeof PANEL_TABS)[number]
export type DockSide = "left" | "right" | "hidden"
export type InteractionMode = "NORMAL" | "PLAN" | "EXEC" | "DIFF"

const DOCK_ORDER: DockSide[] = ["right", "left", "hidden"]

export function cycleDockSide(current: DockSide): DockSide {
  const index = DOCK_ORDER.indexOf(current)
  if (index < 0) return DOCK_ORDER[0]
  return DOCK_ORDER[(index + 1) % DOCK_ORDER.length]!
}

export function cyclePanelTab(current: PanelTab, direction: 1 | -1): PanelTab {
  const index = PANEL_TABS.indexOf(current)
  if (index < 0) return PANEL_TABS[0]
  const next = (index + direction + PANEL_TABS.length) % PANEL_TABS.length
  return PANEL_TABS[next]!
}

export function resolveInteractionMode(input: {
  activeTab: PanelTab
  isBusy: boolean
  isPlanning: boolean
}): InteractionMode {
  if (input.isBusy) return "EXEC"
  if (input.activeTab === "diff") return "DIFF"
  if (input.isPlanning) return "PLAN"
  return "NORMAL"
}
