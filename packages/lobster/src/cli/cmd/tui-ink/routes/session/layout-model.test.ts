import { describe, expect, test } from "bun:test"
import {
  cycleDockSide,
  cyclePanelTab,
  PANEL_TABS,
  resolveInteractionMode,
  type DockSide,
  type PanelTab,
} from "./layout-model"

describe("resolveInteractionMode", () => {
  test("returns EXEC when session is busy", () => {
    const mode = resolveInteractionMode({
      activeTab: "context",
      isBusy: true,
      isPlanning: false,
    })

    expect(mode).toBe("EXEC")
  })

  test("returns DIFF when diff panel is active and session is idle", () => {
    const mode = resolveInteractionMode({
      activeTab: "diff",
      isBusy: false,
      isPlanning: false,
    })

    expect(mode).toBe("DIFF")
  })

  test("returns PLAN while planning in non-diff tabs", () => {
    const mode = resolveInteractionMode({
      activeTab: "logbook",
      isBusy: false,
      isPlanning: true,
    })

    expect(mode).toBe("PLAN")
  })

  test("returns NORMAL by default", () => {
    const mode = resolveInteractionMode({
      activeTab: "activity",
      isBusy: false,
      isPlanning: false,
    })

    expect(mode).toBe("NORMAL")
  })
})

describe("cycleDockSide", () => {
  test("cycles right -> left -> hidden -> right", () => {
    const order: DockSide[] = ["right", "left", "hidden", "right"]
    let side: DockSide = "right"
    for (const expected of order.slice(1)) {
      side = cycleDockSide(side)
      expect(side).toBe(expected)
    }
  })
})

describe("cyclePanelTab", () => {
  test("cycles forward through all tabs", () => {
    let tab: PanelTab = PANEL_TABS[0]
    for (let index = 1; index < PANEL_TABS.length; index++) {
      tab = cyclePanelTab(tab, 1)
      expect(tab).toBe(PANEL_TABS[index])
    }
  })

  test("cycles backward from first tab to last tab", () => {
    const tab = cyclePanelTab(PANEL_TABS[0], -1)
    expect(tab).toBe(PANEL_TABS[PANEL_TABS.length - 1])
  })
})
