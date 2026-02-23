/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useAppStore } from "../store"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { useHotkeyInputGuard } from "../ui/hotkey-input-guard"
import { Spinner } from "./spinner"
import { dedupeMarketplaceBySpec, loadPluginMarketplace, pluginSpecName, type MarketplacePlugin } from "./plugin-marketplace"
import { EmptyState, KeyHints, PanelHeader, SegmentedTabs, StatusBadge } from "../ui/chrome"
import { useDesignTokens } from "../ui/design"

export type PluginTab = "installed" | "marketplace" | "add"

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

export function resolveInitialPluginTab(input: {
  initialTab?: PluginTab
  installedCount: number
}): PluginTab {
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

  const guardedAddInputChange = useMemo(
    () => wrapOnChange(setAddInput),
    [wrapOnChange],
  )
  const guardedQueryChange = useMemo(
    () => wrapOnChange(setQuery),
    [wrapOnChange],
  )

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
    const sorted = dedupeMarketplaceBySpec(deduped).toSorted((a, b) =>
      a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
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
    if (props.initialTab) return
    setTab((current) => {
      if (current !== "marketplace" && current !== "installed") return current
      return resolveInitialPluginTab({
        initialTab: undefined,
        installedCount: installed.length,
      })
    })
  }, [installed.length, props.initialTab])

  useEffect(() => {
    setQuery("")
    setSelected(0)
  }, [tab])

  useEffect(() => {
    if (tab === "add") return
    const length = tab === "installed" ? visibleInstalled.length : visibleMarketplace.length
    if (length === 0) {
      if (selected !== 0) setSelected(0)
      return
    }
    if (selected >= length) setSelected(length - 1)
  }, [installed.length, selected, tab, visibleMarketplace.length])

  useInput((ch, key) => {
    if (key.escape) {
      markHotkeyConsumed()
      dialog.clear()
      return
    }
    if (key.tab) {
      markHotkeyConsumed()
      setTab((current) => nextTab(current, !!key.shift))
      return
    }
    if (tab === "installed") {
      if (key.upArrow) setSelected((value) => Math.max(0, value - 1))
      if (key.downArrow) setSelected((value) => Math.min(visibleInstalled.length - 1, value + 1))
      if (ch === "x" || key.delete || key.backspace) {
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
      if (ch === "r") {
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
        const result = await sync.client.global.config.get()
        const current = result.data?.plugin ?? []
        const next = current.filter((value) => value !== spec)
        await sync.client.global.config.update({ config: { plugin: next } })
        await sync.client.instance.dispose()
        await sync.bootstrap()
        setSelected((value) => Math.max(0, value - 1))
      } finally {
        setLoading(false)
      }
    },
    [loading, sync],
  )

  const installPlugin = useCallback(
    async (spec: string) => {
      if (!spec.trim() || loading) return
      setLoading(true)
      try {
        const result = await sync.client.global.config.get()
        const current = result.data?.plugin ?? []
        if (!current.includes(spec)) {
          await sync.client.global.config.update({ config: { plugin: [...current, spec] } })
          await sync.client.instance.dispose()
          await sync.bootstrap()
        }
      } finally {
        setLoading(false)
      }
    },
    [loading, sync],
  )

  const addPlugin = useCallback(
    async (spec: string) => {
      if (!spec.trim() || loading) return
      setLoading(true)
      try {
        const result = await sync.client.global.config.get()
        const current = result.data?.plugin ?? []
        if (!current.includes(spec.trim())) {
          await sync.client.global.config.update({ config: { plugin: [...current, spec.trim()] } })
          await sync.client.instance.dispose()
          await sync.bootstrap()
        }
        setAddInput("")
        setTab("installed")
      } finally {
        setLoading(false)
      }
    },
    [loading, sync],
  )

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <PanelHeader
        title="Plugin Manager"
        subtitle={`${installed.length} installed`}
        right="esc close"
      />
      <Box gap={1}>
        <StatusBadge tone="accent" label={tab.toUpperCase()} />
        {tab === "marketplace" && marketplaceFetchedAt ? (
          <Text color={tokens.text.muted} dimColor>
            updated {new Date(marketplaceFetchedAt).toLocaleTimeString()}
          </Text>
        ) : null}
      </Box>

      <SegmentedTabs
        active={tab}
        onSelect={setTab}
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
                <Box
                  key={plugin.raw}
                  paddingLeft={1}
                  paddingRight={1}
                >
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
          <KeyHints items={["tab switch", "up/down navigate", "x remove", "esc close"]} />
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
              title={marketplaceHadError ? "Could not load marketplace sources." : "All marketplace plugins are installed."}
              detail="Press r to refresh marketplace sources."
            />
          ) : (
            <>
              <Text color={tokens.text.muted}>
                {visibleMarketplace.length} available - Enter to install
              </Text>
              {visibleMarketplace.map((plugin, index) => {
                const isSelected = index === selected
                return (
                  <Box
                    key={`${plugin.source}:${plugin.spec}`}
                    paddingLeft={1}
                    paddingRight={1}
                  >
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
                      [{plugin.source}]{" "}
                    </Text>
                    <Text
                      color={isSelected ? tokens.list.selectedText : tokens.text.primary}
                      backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                    >
                      {plugin.name}
                    </Text>
                    {plugin.description ? (
                      <Text
                        color={isSelected ? tokens.list.selectedText : tokens.text.muted}
                        backgroundColor={isSelected ? tokens.list.selectedBackground : undefined}
                      >
                        {" - "}
                        {plugin.description}
                      </Text>
                    ) : null}
                  </Box>
                )
              })}
              <KeyHints items={["tab switch", "up/down navigate", "enter install", "r refresh", "esc close"]} />
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
          <Text color={tokens.text.muted} dimColor>Tip: /plugin install {"<name|spec>"}</Text>
          <KeyHints items={["tab switch", "enter add", "esc close"]} />
        </Box>
      )}
    </Box>
  )
}
