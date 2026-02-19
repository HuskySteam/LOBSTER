/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import React, { useState, useMemo, useCallback } from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { useHotkeyInputGuard } from "../ui/hotkey-input-guard"
import { Spinner } from "./spinner"

type Tab = "installed" | "add"

export function DialogPlugin() {
  const { theme } = useTheme()
  const { sync } = useSDK()
  const dialog = useDialog()
  const { markHotkeyConsumed, wrapOnChange } = useHotkeyInputGuard()
  const config = useAppStore((s) => s.config)

  const [tab, setTab] = useState<Tab>("installed")
  const [addInput, setAddInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const guardedAddInputChange = useMemo(
    () => wrapOnChange(setAddInput),
    [wrapOnChange],
  )

  const plugins = useMemo<string[]>(() => (config as any)?.plugin ?? [], [config])

  useInput((ch, key) => {
    if (key.escape) {
      markHotkeyConsumed()
      dialog.clear()
      return
    }
    if (key.tab) {
      markHotkeyConsumed()
      setTab((t) => (t === "installed" ? "add" : "installed"))
      setSelected(0)
      return
    }
    if (tab === "installed") {
      if (key.upArrow) setSelected((s) => Math.max(0, s - 1))
      if (key.downArrow) setSelected((s) => Math.min(plugins.length - 1, s + 1))
      if (ch === "x" || key.delete || key.backspace) {
        markHotkeyConsumed()
        removePlugin(selected)
      }
    }
  })

  const removePlugin = useCallback(
    async (index: number) => {
      const plugin = plugins[index]
      if (!plugin) return
      setLoading(true)
      const next = plugins.filter((_, i) => i !== index)
      await sync.client.global.config.update({ config: { plugin: next } })
      await sync.client.instance.dispose()
      await sync.bootstrap()
      setLoading(false)
      setSelected(Math.max(0, selected - 1))
    },
    [plugins, sync, selected],
  )

  const addPlugin = useCallback(
    async (spec: string) => {
      if (!spec.trim()) return
      setLoading(true)
      const next = [...plugins, spec.trim()]
      await sync.client.global.config.update({ config: { plugin: next } })
      await sync.client.instance.dispose()
      await sync.bootstrap()
      setAddInput("")
      setLoading(false)
      setTab("installed")
    },
    [plugins, sync],
  )

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>Plugins</Text>
        <Text color={theme.textMuted}>esc close</Text>
      </Box>

      <Box marginTop={1} gap={2}>
        <Text color={tab === "installed" ? theme.primary : theme.textMuted} bold={tab === "installed"}>
          Installed ({plugins.length})
        </Text>
        <Text color={tab === "add" ? theme.primary : theme.textMuted} bold={tab === "add"}>
          Add
        </Text>
        <Text color={theme.textMuted} dimColor>tab switch</Text>
      </Box>

      {loading && (
        <Box marginTop={1}><Spinner color={theme.accent} /> <Text color={theme.textMuted}>Loading...</Text></Box>
      )}

      {tab === "installed" && !loading && (
        <Box flexDirection="column" marginTop={1}>
          {plugins.length === 0 ? (
            <Text color={theme.textMuted}>  No plugins installed. Press tab to add one.</Text>
          ) : (
            plugins.map((p, i) => {
              const isFile = p.startsWith("file://")
              const label = isFile ? p.replace("file://", "") : p
              const tag = isFile ? "[file]" : "[npm]"
              const isSel = i === selected
              return (
                <Box key={i}>
                  <Text color={isSel ? theme.secondary : theme.textMuted}>
                    {isSel ? "> " : "  "}
                  </Text>
                  <Text color={theme.accent}>{tag} </Text>
                  <Text color={isSel ? theme.text : theme.textMuted}>{label}</Text>
                </Box>
              )
            })
          )}
          {plugins.length > 0 && (
            <Box marginTop={1} gap={2}>
              <Text color={theme.textMuted}>{"↑↓ navigate"}</Text>
              <Text color={theme.textMuted}>x remove</Text>
            </Box>
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
        </Box>
      )}
    </Box>
  )
}
