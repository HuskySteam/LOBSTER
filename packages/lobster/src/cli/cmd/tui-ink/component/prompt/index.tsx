/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import React, { useState, useCallback, useRef, useEffect } from "react"
import { useTheme } from "../../theme"
import { useAppStore } from "../../store"
import { useSDK } from "../../context/sdk"
import { useArgs } from "../../context/args"
import { useExit } from "../../context/exit"
import { useLocal } from "../../context/local"
import { useDialog } from "../../ui/dialog"
import { DialogModel } from "../dialog-model"
import { DialogAgent } from "../dialog-agent"
import { DialogSessionList } from "../dialog-session-list"
import { DialogCommand } from "../dialog-command"
import { DialogProvider } from "../dialog-provider"
import { DialogKeybinds } from "../dialog-keybinds"
import { Spinner } from "../spinner"

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

  const [input, setInput] = useState(args.prompt ?? "")
  const [focused, setFocused] = useState(true)
  const [interruptCount, setInterruptCount] = useState(0)

  const sessionStatus = useAppStore((s) =>
    props.sessionID ? s.session_status[props.sessionID] : undefined,
  )

  const isBusy = sessionStatus?.type === "busy"
  const currentAgent = local.agent.current()
  const currentModel = local.model.current()
  const modelParsed = local.model.parsed()

  const handleSubmit = useCallback(
    (value: string) => {
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
    [isBusy, currentAgent, currentModel, props.onSubmit],
  )

  useInput((ch, key) => {
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

    // Tab: cycle agent
    if (key.tab) {
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
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Type a message..."
            focus={focused}
          />
        )}
      </Box>

      {/* Hint line */}
      {!isBusy && (
        <Box paddingLeft={2} gap={2}>
          <Text color={theme.textMuted} dimColor>tab agent</Text>
          <Text color={theme.textMuted} dimColor>^M model</Text>
          <Text color={theme.textMuted} dimColor>^S sessions</Text>
          <Text color={theme.textMuted} dimColor>^P commands</Text>
          <Text color={theme.textMuted} dimColor>^O connect</Text>
        </Box>
      )}
    </Box>
  )
}
