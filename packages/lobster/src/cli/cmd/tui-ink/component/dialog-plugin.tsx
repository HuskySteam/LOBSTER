/** @jsxImportSource react */
import { Box, Text, useInput, useStdout } from "ink"
import TextInput from "ink-text-input"
import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useAppStore } from "../store"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { useHotkeyInputGuard } from "../ui/hotkey-input-guard"
import { isCtrlShortcut } from "../ui/hotkey"
import { Spinner } from "./spinner"
import {
  dedupeMarketplaceBySpec,
  loadPluginMarketplace,
  pluginSpecName,
  type MarketplacePlugin,
} from "./plugin-marketplace"
import { EmptyState, KeyHints, PanelHeader, SegmentedTabs, StatusBadge } from "../ui/chrome"
import { useDesignTokens } from "../ui/design"

type PluginTab = "installed" | "marketplace" | "add"

type InstalledPlugin = {
  name: string
  label: string
  tag: "npm" | "file" | "cc"
  raw: string
}

const TAB_ORDER: PluginTab[] = ["installed", "marketplace", "add"]

function nextTab(tab: PluginTab, reverse = false): PluginTab {
  const index = TAB_ORDER.indexOf(tab)
  if (index < 0) return "installed"
  if (reverse) return TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length]
  return TAB_ORDER[(index + 1) % TAB_ORDER.length]
}

function truncateLine(value: string, width: number) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (width <= 0) return ""
  if (normalized.length <= width) return normalized
  if (width <= 3) return ".".repeat(width)
  return `${normalized.slice(0, width - 3)}...`
}

export function resolveInitialPluginTab(input: { initialTab?: PluginTab; installedCount: number }): PluginTab {
  if (input.initialTab) return input.initialTab
  return input.installedCount > 0 ? "installed" : "marketplace"
}

function parseInstalledPlugin(spec: string): InstalledPlugin {
  if (spec.startsWith("github:") || spec.startsWith("https://github.com/")) {
    return {
      name: pluginSpecName(spec),
      label: spec,
      tag: "cc",
      raw: spec,
    }
  }
  if (spec.startsWith("file://")) {
    return {
      name: pluginSpecName(spec),
      label: spec.replace("file://", ""),
      tag: "file",
      raw: spec,
    }
  }
  return {
    name: pluginSpecName(spec),
    label: spec,
    tag: "npm",
    raw: spec,
  }
}

interface DialogPluginProps {
  initialTab?: PluginTab
}

export function DialogPlugin(props: DialogPluginProps = {}) {
  const tokens = useDesignTokens()
  const { stdout } = useStdout()
  const { sync } = useSDK()
  const dialog = useDialog()
  const { markHotkeyConsumed, wrapOnChange } = useHotkeyInputGuard()
  const config = useAppStore((s) => s.config)
  const pluginSpecs = useMemo<string[]>(() => (config as { plugin?: string[] })?.plugin ?? [], [config])
  const installed = useMemo<InstalledPlugin[]>(
    () => pluginSpecs.map(parseInstalledPlugin).toSorted((a, b) => a.name.localeCompare(b.name)),
    [pluginSpecs],
  )
  const [tab, setTab] = useState<PluginTab>(() =>
    resolveInitialPluginTab({
      initialTab: props.initialTab,
      installedCount: installed.length,
    }),
  )
  const [query, setQuery] = useState("")
  const [addInput, setAddInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const [marketplace, setMarketplace] = useState<MarketplacePlugin[]>([])
  const [marketplaceLoaded, setMarketplaceLoaded] = useState(false)
  const [marketplaceHadError, setMarketplaceHadError] = useState(false)
  const [marketplaceFetchedAt, setMarketplaceFetchedAt] = useState<number | undefined>(undefined)
  const lineWidth = useMemo(() => {
    const columns = stdout?.columns ?? 80
    return Math.max(32, Math.min(96, columns - 18))
  }, [stdout?.columns])

  const refreshAfterConfigChange = useCallback(async () => {
    await sync.client.instance.dispose()
    await sync.bootstrap()
  }, [sync])

  const switchTab = useCallback((next: PluginTab) => {
    setTab(next)
    setQuery("")
    setSelected(0)
  }, [])

  const cycleTab = useCallback((reverse = false) => {
    setTab((current) => nextTab(current, reverse))
    setQuery("")
    setSelected(0)
  }, [])

  const guardedAddInputChange = useMemo(() => wrapOnChange(setAddInput), [wrapOnChange])
  const guardedQueryChange = useMemo(() => wrapOnChange(setQuery), [wrapOnChange])

  const visibleInstalled = useMemo(() => {
    const filter = query.trim().toLowerCase()
    if (!filter) return installed
    return installed.filter((item) => {
      if (item.name.toLowerCase().includes(filter)) return true
      return item.label.toLowerCase().includes(filter)
    })
  }, [installed, query])

  const visibleMarketplace = useMemo(() => {
    const installedNames = new Set(installed.map((item) => item.name.toLowerCase()))
    const installedSpecs = new Set(pluginSpecs)
    const deduped = marketplace.filter((item) => {
      if (installedNames.has(item.name.toLowerCase())) return false
      if (installedSpecs.has(item.spec)) return false
      return true
    })
    const sorted = dedupeMarketplaceBySpec(deduped).toSorted(
      (a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
    )
    const filter = query.trim().toLowerCase()
    if (!filter) return sorted
    return sorted.filter((item) => {
      if (item.name.toLowerCase().includes(filter)) return true
      if (item.source.toLowerCase().includes(filter)) return true
      return item.description.toLowerCase().includes(filter)
    })
  }, [installed, marketplace, pluginSpecs, query])

  const loadMarketplace = useCallback(async () => {
    setMarketplaceLoaded(false)
    setMarketplaceHadError(false)
    try {
      const result = await sync.client.global.config.get()
      const sources = result.data?.plugin_marketplaces ?? []
      const loaded = await loadPluginMarketplace(sources)
      setMarketplace(loaded.plugins)
      setMarketplaceHadError(loaded.hadError)
      setMarketplaceFetchedAt(Date.now())
    } catch {
      setMarketplace([])
      setMarketplaceHadError(true)
    } finally {
      setMarketplaceLoaded(true)
    }
  }, [sync])

  useEffect(() => {
    if (tab !== "marketplace") return
    void loadMarketplace()
  }, [tab, loadMarketplace])

  useEffect(() => {
    if (tab === "add") return
    const length = tab === "installed" ? visibleInstalled.length : visibleMarketplace.length
    setSelected((value) => {
      if (length === 0) return value === 0 ? value : 0
      return value >= length ? length - 1 : value
    })
  }, [tab, visibleInstalled.length, visibleMarketplace.length])

  useInput((ch, key) => {
    if (key.escape) {
      markHotkeyConsumed()
      dialog.clear()
      return
    }
    if (key.tab) {
      markHotkeyConsumed()
      cycleTab(!!key.shift)
      return
    }
    if (tab === "installed") {
      if (key.upArrow) setSelected((value) => Math.max(0, value - 1))
      if (key.downArrow) setSelected((value) => Math.min(visibleInstalled.length - 1, value + 1))
      if (isCtrlShortcut(ch, key, "x")) {
        markHotkeyConsumed()
        const item = visibleInstalled[selected]
        if (item) void removePlugin(item.raw)
      }
      return
    }
    if (tab === "marketplace") {
      if (key.upArrow) setSelected((value) => Math.max(0, value - 1))
      if (key.downArrow) setSelected((value) => Math.min(visibleMarketplace.length - 1, value + 1))
      if (key.return) {
        markHotkeyConsumed()
        const item = visibleMarketplace[selected]
        if (item) void installPlugin(item.spec)
      }
      if (isCtrlShortcut(ch, key, "r")) {
        markHotkeyConsumed()
        void loadMarketplace()
      }
    }
  })

  const removePlugin = useCallback(
    async (spec: string) => {
      if (!spec || loading) return
      setLoading(true)
      try {
        await sync.client.global.config.get().then(async (result) => {
          const current = result.data?.plugin ?? []
          const next = current.filter((value) => value !== spec)
          await sync.client.global.config.update({ config: { plugin: next } })
          await refreshAfterConfigChange()
        })
        setSelected((value) => Math.max(0, value - 1))
      } finally {
        setLoading(false)
      }
    },
    [loading, refreshAfterConfigChange, sync],
  )

  const installPlugin = useCallback(
    async (spec: string) => {
      if (!spec.trim() || loading) return
      setLoading(true)
      try {
        await sync.client.global.config.get().then(async (result) => {
          const current = result.data?.plugin ?? []
          if (current.includes(spec)) return
          await sync.client.global.config.update({ config: { plugin: [...current, spec] } })
          await refreshAfterConfigChange()
        })
      } finally {
        setLoading(false)
      }
    },
    [loading, refreshAfterConfigChange, sync],
  )

  const addPlugin = useCallback(
    async (spec: string) => {
      if (!spec.trim() || loading) return
      setLoading(true)
      try {
        const trimmed = spec.trim()
        await sync.client.global.config.get().then(async (result) => {
          const current = result.data?.plugin ?? []
          if (current.includes(trimmed)) return
          await sync.client.global.config.update({ config: { plugin: [...current, trimmed] } })
          await refreshAfterConfigChange()
        })
        setAddInput("")
        switchTab("installed")
      } finally {
        setLoading(false)
      }
    },
    [loading, refreshAfterConfigChange, switchTab, sync],
  )

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <PanelHeader title="Plugin Manager" subtitle={`${installed.length} installed`} right="esc close" />
      <Box flexDirection="row" gap={2} marginTop={1}>
        <StatusBadge tone="accent" label={`[${tab.toUpperCase()}]`} />
        {tab === "marketplace" && marketplaceFetchedAt ? (
          <Text color={tokens.text.muted} dimColor>
            updated {new Date(marketplaceFetchedAt).toLocaleTimeString()}
          </Text>
        ) : null}
      </Box>

      <SegmentedTabs
        active={tab}
        onSelect={(value) => switchTab(value as PluginTab)}
        tabs={[
          { id: "installed", label: "Installed", count: installed.length },
          { id: "marketplace", label: "Marketplace", count: visibleMarketplace.length },
          { id: "add", label: "Add" },
        ]}
      />

      {tab !== "add" ? (
        <Box>
          <Text color={tokens.text.accent}>{"> "}</Text>
          <TextInput
            value={query}
            onChange={guardedQueryChange}
            placeholder={tab === "installed" ? "Filter installed plugins..." : "Filter marketplace..."}
            focus={true}
          />
        </Box>
      ) : null}

      {loading && (
        <Box marginTop={1} gap={1}>
          <Spinner color={tokens.text.accent} />
          <Text color={tokens.text.muted}>Working...</Text>
        </Box>
      )}

      {tab === "installed" && !loading && (
        <Box flexDirection="column" marginTop={1}>
          {visibleInstalled.length === 0 ? (
            <EmptyState
              title={installed.length === 0 ? "No plugins installed." : "No installed plugins match your filter."}
              detail="Press Tab to switch to Marketplace or Add."
            />
          ) : (
            visibleInstalled.map((plugin, index) => {
              const isSelected = index === selected
              return (
                <Box key={plugin.raw} paddingLeft={1} paddingRight={1}>
                  <Text
                    color={isSelected ? tokens.list.selectedText : tokens.list.marker}
                    backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                  >
                    {isSelected ? "> " : "  "}
                  </Text>
                  <Text
                    color={isSelected ? tokens.list.selectedText : tokens.text.accent}
                    backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                  >
                    [{plugin.tag}]{" "}
                  </Text>
                  <Text
                    color={isSelected ? tokens.list.selectedText : tokens.text.primary}
                    backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                  >
                    {plugin.label}
                  </Text>
                </Box>
              )
            })
          )}
          <KeyHints items={["tab switch", "up/down navigate", "ctrl+x remove", "esc close"]} />
        </Box>
      )}

      {tab === "marketplace" && !loading && (
        <Box flexDirection="column" marginTop={1}>
          {!marketplaceLoaded ? (
            <Box gap={1}>
              <Spinner color={tokens.text.accent} />
              <Text color={tokens.text.muted}>Loading marketplace...</Text>
            </Box>
          ) : visibleMarketplace.length === 0 ? (
            <EmptyState
              title={
                marketplaceHadError ? "Could not load marketplace sources." : "All marketplace plugins are installed."
              }
              detail="Press Ctrl+R to refresh marketplace sources."
            />
          ) : (
            <>
              <Text color={tokens.text.muted}>{visibleMarketplace.length} available | Enter to install</Text>
              {visibleMarketplace.map((plugin, index) => {
                const isSelected = index === selected
                const title = truncateLine(`[${plugin.source}] ${plugin.name}`, lineWidth)
                const description = plugin.description ? truncateLine(plugin.description, Math.max(12, lineWidth - 3)) : ""
                return (
                  <Box
                    key={`${plugin.source}:${plugin.spec}`}
                    flexDirection="column"
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <Text
                      color={isSelected ? tokens.list.selectedText : tokens.text.primary}
                      backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                    >
                      {`${isSelected ? "> " : "  "}${title}`}
                    </Text>
                    {description ? (
                      <Text
                        color={isSelected ? tokens.list.selectedText : tokens.text.muted}
                        backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                        dimColor={!isSelected}
                      >
                        {`   ${description}`}
                      </Text>
                    ) : null}
                  </Box>
                )
              })}
              <KeyHints items={["tab switch", "up/down navigate", "enter install", "ctrl+r refresh", "esc close"]} />
            </>
          )}
        </Box>
      )}

      {tab === "add" && !loading && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={tokens.text.muted}>Enter plugin spec (npm package, git URL, or file:// path):</Text>
          <Box marginTop={1}>
            <Text color={tokens.text.accent}>{"> "}</Text>
            <TextInput
              value={addInput}
              onChange={guardedAddInputChange}
              onSubmit={addPlugin}
              placeholder="e.g. feature-dev or file://.lobster/plugins/my-plugin.ts"
              focus={tab === "add"}
            />
          </Box>
          <Text color={tokens.text.muted} dimColor>
            Tip: /plugin install {"<name|spec>"}
          </Text>
          <KeyHints items={["tab switch", "enter add", "esc close"]} />
        </Box>
      )}
    </Box>
  )
}
