/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { useHotkeyInputGuard } from "../ui/hotkey-input-guard"
import { Spinner } from "./spinner"
import { dedupeMarketplaceBySpec, loadPluginMarketplace, pluginSpecName, type MarketplacePlugin } from "./plugin-marketplace"

type Tab = "installed" | "marketplace" | "add"

type InstalledPlugin = {
  name: string
  label: string
  tag: "npm" | "file" | "cc"
  raw: string
}

const TAB_ORDER: Tab[] = ["installed", "marketplace", "add"]

function nextTab(tab: Tab, reverse = false): Tab {
  const index = TAB_ORDER.indexOf(tab)
  if (index < 0) return "installed"
  if (reverse) return TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length]
  return TAB_ORDER[(index + 1) % TAB_ORDER.length]
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
  initialTab?: Tab
}

export function DialogPlugin(props: DialogPluginProps = {}) {
  const { theme } = useTheme()
  const { sync } = useSDK()
  const dialog = useDialog()
  const { markHotkeyConsumed, wrapOnChange } = useHotkeyInputGuard()
  const config = useAppStore((s) => s.config)

  const [tab, setTab] = useState<Tab>(props.initialTab ?? "installed")
  const [addInput, setAddInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const [marketplace, setMarketplace] = useState<MarketplacePlugin[]>([])
  const [marketplaceLoaded, setMarketplaceLoaded] = useState(false)
  const [marketplaceHadError, setMarketplaceHadError] = useState(false)
  const guardedAddInputChange = useMemo(
    () => wrapOnChange(setAddInput),
    [wrapOnChange],
  )

  const pluginSpecs = useMemo<string[]>(() => (config as { plugin?: string[] })?.plugin ?? [], [config])
  const installed = useMemo<InstalledPlugin[]>(
    () => pluginSpecs.map(parseInstalledPlugin).toSorted((a, b) => a.name.localeCompare(b.name)),
    [pluginSpecs],
  )

  const visibleMarketplace = useMemo(() => {
    const installedNames = new Set(installed.map((item) => item.name.toLowerCase()))
    const installedSpecs = new Set(pluginSpecs)
    const filtered = marketplace.filter((item) => {
      if (installedNames.has(item.name.toLowerCase())) return false
      if (installedSpecs.has(item.spec)) return false
      return true
    })
    return dedupeMarketplaceBySpec(filtered).toSorted((a, b) =>
      a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
    )
  }, [installed, marketplace, pluginSpecs])

  const loadMarketplace = useCallback(async () => {
    setMarketplaceLoaded(false)
    setMarketplaceHadError(false)
    try {
      const result = await sync.client.global.config.get()
      const sources = result.data?.plugin_marketplaces ?? []
      const loaded = await loadPluginMarketplace(sources)
      setMarketplace(loaded.plugins)
      setMarketplaceHadError(loaded.hadError)
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
    const length = tab === "installed" ? installed.length : visibleMarketplace.length
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
      setSelected(0)
      return
    }
    if (tab === "installed") {
      if (key.upArrow) setSelected((value) => Math.max(0, value - 1))
      if (key.downArrow) setSelected((value) => Math.min(installed.length - 1, value + 1))
      if (ch === "x" || key.delete || key.backspace) {
        markHotkeyConsumed()
        void removePlugin(selected)
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
    }
  })

  const removePlugin = useCallback(
    async (index: number) => {
      const plugin = installed[index]
      if (!plugin || loading) return
      setLoading(true)
      try {
        const result = await sync.client.global.config.get()
        const current = result.data?.plugin ?? []
        const next = current.filter((value) => value !== plugin.raw)
        await sync.client.global.config.update({ config: { plugin: next } })
        await sync.client.instance.dispose()
        await sync.bootstrap()
        setSelected((value) => Math.max(0, value - 1))
      } finally {
        setLoading(false)
      }
    },
    [installed, loading, sync],
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
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>Plugins</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      <Box marginTop={1} gap={2}>
        <Text color={tab === "installed" ? theme.primary : theme.textMuted} bold={tab === "installed"}>
          Installed ({installed.length})
        </Text>
        <Text color={tab === "marketplace" ? theme.primary : theme.textMuted} bold={tab === "marketplace"}>
          Marketplace
        </Text>
        <Text color={tab === "add" ? theme.primary : theme.textMuted} bold={tab === "add"}>
          Add
        </Text>
        <Text color={theme.textMuted} dimColor>tab switch</Text>
      </Box>

      {loading && (
        <Box marginTop={1}><Spinner color={theme.accent} /> <Text color={theme.textMuted}>Working...</Text></Box>
      )}

      {tab === "installed" && !loading && (
        <Box flexDirection="column" marginTop={1}>
          {installed.length === 0 ? (
            <Text color={theme.textMuted}>  No plugins installed. Press tab to add one.</Text>
          ) : (
            installed.map((plugin, index) => {
              const isSelected = index === selected
              return (
                <Box key={plugin.raw}>
                  <Text color={isSelected ? theme.secondary : theme.textMuted}>
                    {isSelected ? "> " : "  "}
                  </Text>
                  <Text color={theme.accent}>[{plugin.tag}] </Text>
                  <Text color={isSelected ? theme.text : theme.textMuted}>{plugin.label}</Text>
                </Box>
              )
            })
          )}
          {installed.length > 0 && (
            <Box marginTop={1} gap={2}>
              <Text color={theme.textMuted}>up/down navigate</Text>
              <Text color={theme.textMuted}>x remove</Text>
            </Box>
          )}
        </Box>
      )}

      {tab === "marketplace" && !loading && (
        <Box flexDirection="column" marginTop={1}>
          {!marketplaceLoaded ? (
            <Box><Spinner color={theme.accent} /> <Text color={theme.textMuted}>Loading marketplace...</Text></Box>
          ) : visibleMarketplace.length === 0 ? (
            <Text color={theme.textMuted}>
              {marketplaceHadError ? "Could not load marketplaces" : "All marketplace plugins are installed"}
            </Text>
          ) : (
            <>
              <Text color={theme.textMuted}>
                {visibleMarketplace.length} available - Enter to install
              </Text>
              {visibleMarketplace.map((plugin, index) => {
                const isSelected = index === selected
                return (
                  <Box key={`${plugin.source}:${plugin.spec}`}>
                    <Text color={isSelected ? theme.secondary : theme.textMuted}>
                      {isSelected ? "> " : "  "}
                    </Text>
                    <Text color={theme.accent}>[{plugin.source}] </Text>
                    <Text color={isSelected ? theme.text : theme.textMuted}>{plugin.name}</Text>
                    {plugin.description ? (
                      <Text color={theme.textMuted}> - {plugin.description}</Text>
                    ) : null}
                  </Box>
                )
              })}
              <Box marginTop={1} gap={2}>
                <Text color={theme.textMuted}>up/down navigate</Text>
                <Text color={theme.textMuted}>enter install</Text>
              </Box>
            </>
          )}
        </Box>
      )}

      {tab === "add" && !loading && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.textMuted}>Enter plugin spec (npm package, git URL, or file:// path):</Text>
          <Box marginTop={1}>
            <Text color={theme.textMuted}>{"> "}</Text>
            <TextInput
              value={addInput}
              onChange={guardedAddInputChange}
              onSubmit={addPlugin}
              placeholder="e.g. feature-dev or file://.lobster/plugins/my-plugin.ts"
              focus={tab === "add"}
            />
          </Box>
          <Text color={theme.textMuted} dimColor>Tip: /plugin install {"<name|spec>"}</Text>
        </Box>
      )}
    </Box>
  )
}
