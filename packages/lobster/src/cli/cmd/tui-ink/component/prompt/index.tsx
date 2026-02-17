/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useTheme } from "../../theme"
import { useAppStore } from "../../store"
import { useSDK } from "../../context/sdk"
import { useArgs } from "../../context/args"
import { useExit } from "../../context/exit"
import { useLocal } from "../../context/local"
import { useKeybind } from "../../context/keybind"
import { useDialog } from "../../ui/dialog"
import { DialogModel } from "../dialog-model"
import { DialogAgent } from "../dialog-agent"
import { DialogSessionList } from "../dialog-session-list"
import { DialogCommand } from "../dialog-command"
import { DialogProvider } from "../dialog-provider"
import { DialogKeybinds } from "../dialog-keybinds"
import { DialogStatus } from "../dialog-status"
import { DialogThemeList } from "../dialog-theme-list"
import { DialogMcp } from "../dialog-mcp"
import { DialogPlugin } from "../dialog-plugin"
import { Spinner } from "../spinner"
import { Autocomplete, type AutocompleteOption } from "./autocomplete"

interface PromptProps {
  sessionID?: string
  onSubmit: (input: string, options: { agent: string; model: { providerID: string; modelID: string } }) => void
}

export function Prompt(props: PromptProps) {
  const { theme } = useTheme()
  const exit = useExit()
  const { sync } = useSDK()
  const args = useArgs()
  const local = useLocal()
  const dialog = useDialog()
  const keybind = useKeybind()

  const [input, setInput] = useState(args.prompt ?? "")
  const [interruptCount, setInterruptCount] = useState(0)
  const isDialogOpen = dialog.content !== null

  // Autocomplete state
  const [acMode, setAcMode] = useState<false | "/" | "@">(false)
  const [acIndex, setAcIndex] = useState(0)
  const [acTriggerPos, setAcTriggerPos] = useState(0)
  const [fileResults, setFileResults] = useState<string[]>([])

  const sessionStatus = useAppStore((s) =>
    props.sessionID ? s.session_status[props.sessionID] : undefined,
  )
  const commands = useAppStore((s) => s.command)
  const agents = useAppStore((s) => s.agent)

  const isBusy = sessionStatus?.type === "busy"
  const currentAgent = local.agent.current()
  const currentModel = local.model.current()
  const modelParsed = local.model.parsed()

  // Suppress global keybindings while autocomplete is open
  useEffect(() => {
    keybind.setDialogOpen(!!acMode || isDialogOpen)
    return () => keybind.setDialogOpen(false)
  }, [!!acMode, isDialogOpen])

  // Reset selection on mode change
  const prevModeRef = useRef<false | "/" | "@">(false)
  useEffect(() => {
    if (prevModeRef.current !== acMode) {
      setAcIndex(0)
      prevModeRef.current = acMode
    }
  }, [acMode])

  // Debounced file search for "@" mode
  const fileSearchTimer = useRef<ReturnType<typeof setTimeout>>()
  const searchFiles = useCallback(
    (query: string) => {
      if (fileSearchTimer.current) clearTimeout(fileSearchTimer.current)
      if (!query) {
        setFileResults([])
        return
      }
      fileSearchTimer.current = setTimeout(async () => {
        const result = await sync.client.find.files({ query, limit: 20 }).catch(() => null)
        if (result?.data) {
          setFileResults(Array.isArray(result.data) ? result.data : [])
        }
      }, 150)
    },
    [sync],
  )

  // Command options for "/" mode
  const commandOptions = useMemo<AutocompleteOption[]>(() => {
    const builtIn: AutocompleteOption[] = [
      { label: "/connect", value: "__connect", description: "Connect a provider" },
      { label: "/model", value: "__model", description: "Switch model" },
      { label: "/agent", value: "__agent", description: "Switch agent" },
      { label: "/sessions", value: "__sessions", description: "Browse sessions" },
      { label: "/status", value: "__status", description: "System status" },
      { label: "/keybinds", value: "__keybinds", description: "Keyboard shortcuts" },
      { label: "/plugins", value: "__plugins", description: "Manage plugins" },
      { label: "/mcp", value: "__mcp", description: "MCP servers" },
      { label: "/theme", value: "__theme", description: "Switch theme" },
    ]
    const sdkCmds = commands.map((c) => ({
      label: "/" + c.name,
      value: c.name,
      description: c.description ?? "",
    }))
    return [...builtIn, ...sdkCmds]
  }, [commands])

  // Agent + file options for "@" mode
  const mentionOptions = useMemo<AutocompleteOption[]>(() => {
    const agentOpts: AutocompleteOption[] = agents
      .filter((a) => !a.hidden && a.mode !== "subagent")
      .map((a) => ({
        label: "@" + a.name,
        value: "agent:" + a.name,
        description: a.description ?? "agent",
      }))
    const fileOpts: AutocompleteOption[] = fileResults.map((f) => ({
      label: "@" + f,
      value: "file:" + f,
      description: "file",
    }))
    return [...agentOpts, ...fileOpts]
  }, [agents, fileResults])

  // Filtered options based on current filter text
  const filteredOptions = useMemo(() => {
    if (!acMode) return []
    const source = acMode === "/" ? commandOptions : mentionOptions
    const filterStart = acMode === "/" ? 1 : acTriggerPos + 1
    const filterText = input.slice(filterStart).toLowerCase()
    if (!filterText) return source
    return source.filter(
      (opt) =>
        opt.label.toLowerCase().includes(filterText) ||
        (opt.description?.toLowerCase().includes(filterText) ?? false),
    )
  }, [acMode, input, acTriggerPos, commandOptions, mentionOptions])

  // Clamp selected index when options change
  useEffect(() => {
    if (acIndex >= filteredOptions.length && filteredOptions.length > 0) {
      setAcIndex(filteredOptions.length - 1)
    }
  }, [filteredOptions.length])

  // Trigger "@" file search
  useEffect(() => {
    if (acMode === "@") {
      const filterText = input.slice(acTriggerPos + 1)
      searchFiles(filterText)
    }
  }, [acMode, input, acTriggerPos])

  // Handle selecting an autocomplete option
  const selectOption = useCallback(
    (option: AutocompleteOption) => {
      if (acMode === "/") {
        const builtInActions: Record<string, () => void> = {
          __connect: () => dialog.replace(<DialogProvider />),
          __model: () => dialog.replace(<DialogModel />),
          __agent: () => dialog.replace(<DialogAgent />),
          __sessions: () => dialog.replace(<DialogSessionList />),
          __status: () => dialog.replace(<DialogStatus />),
          __keybinds: () => dialog.replace(<DialogKeybinds />),
          __plugins: () => dialog.replace(<DialogPlugin />),
          __mcp: () => dialog.replace(<DialogMcp />),
          __theme: () => dialog.replace(<DialogThemeList />),
        }
        const action = builtInActions[option.value]
        if (action) {
          setInput("")
          setAcMode(false)
          action()
        } else {
          setInput("/" + option.value + " ")
          setAcMode(false)
        }
      } else if (acMode === "@") {
        const before = input.slice(0, acTriggerPos)
        const name = option.value.startsWith("agent:")
          ? option.value.slice(6)
          : option.value.startsWith("file:")
            ? option.value.slice(5)
            : option.value
        setInput(before + "@" + name + " ")
        setAcMode(false)
      }
    },
    [acMode, acTriggerPos, input, dialog],
  )

  // Detect triggers on input change
  const handleInputChange = useCallback((value: string) => {
    setInput(value)

    // "/" trigger: starts with "/" and no spaces yet
    if (value.startsWith("/") && !value.includes(" ")) {
      setAcMode("/")
      setAcTriggerPos(0)
      return
    }

    // "@" trigger: find last "@" preceded by whitespace or at start, no space after
    const lastAt = value.lastIndexOf("@")
    if (lastAt >= 0) {
      const charBefore = lastAt === 0 ? undefined : value[lastAt - 1]
      const textAfter = value.slice(lastAt + 1)
      if ((charBefore === undefined || /\s/.test(charBefore)) && !textAfter.includes(" ")) {
        setAcMode("@")
        setAcTriggerPos(lastAt)
        return
      }
    }

    // No trigger
    setAcMode(false)
  }, [])

  const handleSubmit = useCallback(
    (value: string) => {
      // Autocomplete selection on Enter
      if (acMode && filteredOptions.length > 0) {
        const selected = filteredOptions[acIndex]
        if (selected) selectOption(selected)
        return
      }

      const text = value.trim()
      if (!text) return
      if (isBusy) return
      if (!currentAgent || !currentModel) return

      props.onSubmit(text, {
        agent: currentAgent.name,
        model: currentModel,
      })
      setInput("")
    },
    [acMode, acIndex, filteredOptions, selectOption, isBusy, currentAgent, currentModel, props.onSubmit],
  )

  useInput((ch, key) => {
    // Autocomplete navigation when visible
    if (acMode && filteredOptions.length > 0) {
      if (key.upArrow) {
        setAcIndex((prev) => (prev <= 0 ? filteredOptions.length - 1 : prev - 1))
        return
      }
      if (key.downArrow) {
        setAcIndex((prev) => (prev >= filteredOptions.length - 1 ? 0 : prev + 1))
        return
      }
      if (key.tab) {
        const selected = filteredOptions[acIndex]
        if (selected) selectOption(selected)
        return
      }
      if (key.escape) {
        setAcMode(false)
        return
      }
    }

    // Ctrl+C: interrupt or exit
    if (key.ctrl && ch === "c") {
      if (isBusy && props.sessionID) {
        setInterruptCount((c) => c + 1)
        sync.client.session.abort({ sessionID: props.sessionID }).catch(() => {})
        return
      }
      if (interruptCount > 0) {
        exit()
        return
      }
      setInterruptCount(1)
      setTimeout(() => setInterruptCount(0), 2000)
      return
    }

    // When a dialog is open, suppress all hotkeys except Ctrl+C above
    if (isDialogOpen) return

    // Tab: cycle agent (only when autocomplete not active)
    if (key.tab && !acMode) {
      local.agent.move(1)
      return
    }

    // Ctrl+M: open model picker
    if (key.ctrl && ch === "m") {
      dialog.replace(<DialogModel />)
      return
    }

    // Ctrl+A: open agent picker
    if (key.ctrl && ch === "a") {
      dialog.replace(<DialogAgent />)
      return
    }

    // Ctrl+S: open session list
    if (key.ctrl && ch === "s") {
      dialog.replace(<DialogSessionList />)
      return
    }

    // Ctrl+P: command palette
    if (key.ctrl && ch === "p") {
      dialog.replace(<DialogCommand />)
      return
    }

    // Ctrl+O: connect provider
    if (key.ctrl && ch === "o") {
      dialog.replace(<DialogProvider />)
      return
    }

    // Ctrl+/: keybinds reference
    if (ch === "\x1F") {
      dialog.replace(<DialogKeybinds />)
      return
    }
  })

  // Auto-submit piped prompt on mount
  const autoSubmitted = useRef(false)
  useEffect(() => {
    if (!autoSubmitted.current && args.prompt && currentModel && currentAgent) {
      autoSubmitted.current = true
      handleSubmit(args.prompt)
    }
  }, [args.prompt, currentModel, currentAgent])

  return (
    <Box flexDirection="column">
      {/* Status line */}
      <Box paddingLeft={2} gap={1}>
        <Text color={theme.secondary} bold>{currentAgent?.name ?? "build"}</Text>
        <Text color={theme.textMuted}>|</Text>
        <Text color={theme.textMuted}>{modelParsed.model}</Text>
        <Text color={theme.textMuted} dimColor>({modelParsed.provider})</Text>
        {isBusy && (
          <>
            <Text color={theme.textMuted}>|</Text>
            <Spinner color={theme.primary} />
          </>
        )}
      </Box>

      {/* Autocomplete dropdown */}
      {acMode && filteredOptions.length > 0 && !isBusy && (
        <Autocomplete options={filteredOptions} selected={acIndex} />
      )}

      {/* Input line */}
      <Box paddingLeft={1}>
        <Text color={theme.accent}>{"> "}</Text>
        {isBusy ? (
          <Text color={theme.textMuted} dimColor>
            {interruptCount > 0 ? "Press Ctrl+C again to exit" : "Agent is working... Press Ctrl+C to interrupt"}
          </Text>
        ) : (
          <TextInput
            value={input}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            placeholder="Type a message... (/ commands, @ mentions)"
            focus={!isDialogOpen}
          />
        )}
      </Box>

      {/* Hint line */}
      {!isBusy && !acMode && (
        <Box paddingLeft={2} gap={2}>
          <Text color={theme.textMuted} dimColor>tab agent</Text>
          <Text color={theme.textMuted} dimColor>^M model</Text>
          <Text color={theme.textMuted} dimColor>^S sessions</Text>
          <Text color={theme.textMuted} dimColor>^P commands</Text>
          <Text color={theme.textMuted} dimColor>^O connect</Text>
        </Box>
      )}
      {!isBusy && acMode && (
        <Box paddingLeft={2} gap={2}>
          <Text color={theme.textMuted} dimColor>{"↑↓ navigate"}</Text>
          <Text color={theme.textMuted} dimColor>enter/tab select</Text>
          <Text color={theme.textMuted} dimColor>esc dismiss</Text>
        </Box>
      )}
    </Box>
  )
}
