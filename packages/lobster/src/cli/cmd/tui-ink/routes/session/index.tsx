/** @jsxImportSource react */
import { Box, Text, useStdout } from "ink"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useTheme } from "../../theme"
import { useAppStore } from "../../store"
import { useSDK } from "../../context/sdk"
import { useKeybind } from "../../context/keybind"
import { Prompt } from "../../component/prompt"
import { ActivityBar } from "../../component/activity-bar"
import { CostTracker } from "../../component/cost-tracker"
import { MessageRow } from "../../component/message"
import { Sidebar } from "./sidebar"
import { PermissionPrompt } from "./permission"
import { QuestionPrompt } from "./question"
import { Identifier } from "@/id/id"

const EMPTY_MESSAGES: never[] = []
const EMPTY_PERMISSIONS: never[] = []
const EMPTY_QUESTIONS: never[] = []

/** Count rendered terminal rows for a string, accounting for soft-wrap at cols. */
function wrappedLineCount(text: string, cols: number): number {
  const hardLines = text.split("\n")
  let total = 0
  for (const line of hardLines) {
    total += Math.max(1, Math.ceil(line.length / cols))
  }
  return total
}

/** Count wrapped rows for an array of hard lines (already split), capped at maxLines. */
function wrappedSliceCount(lines: string[], maxLines: number, cols: number): number {
  const capped = lines.slice(0, maxLines)
  let total = 0
  for (const line of capped) {
    total += Math.max(1, Math.ceil(line.length / cols))
  }
  return total
}

/** Estimate rendered lines for a tool part based on its state/metadata.
 *  Mirrors the rendering caps in component/message/tools.tsx. */
function estimateToolLines(part: Record<string, any>, cols: number): number {
  const state = part.state ?? {}
  const meta = state.status === "pending" ? {} : (state.metadata ?? {})
  const input = state.input ?? {}

  // InlineTool tools render 1 line (+ optional error)
  const inlineBase = state.error ? 2 : 1

  switch (part.tool) {
    case "bash": {
      if (meta.output === undefined) return inlineBase
      // BlockTool: title(1) + command(1) + up to 10 output lines + overflow indicator
      const raw = (meta.output ?? "").trim()
      const allLines = raw ? raw.split("\n") : []
      const outputRows = raw ? wrappedSliceCount(allLines, 10, cols) : 0
      return 2 + outputRows + (allLines.length > 10 ? 1 : 0) + (state.error ? 1 : 0)
    }
    case "edit": {
      if (meta.diff === undefined) return inlineBase
      // BlockTool: title(1) + up to 30 diff lines + overflow + diagnostics
      const allLines = (meta.diff ?? "").split("\n")
      const diffRows = wrappedSliceCount(allLines, 30, cols)
      const diagCount = Math.min(
        ((meta.diagnostics?.[input.filePath] ?? []) as any[]).filter((x: any) => x.severity === 1).length,
        3,
      )
      return 1 + diffRows + (allLines.length > 30 ? 1 : 0) + diagCount + (state.error ? 1 : 0)
    }
    case "write": {
      if (meta.diagnostics === undefined) return inlineBase
      const diagCount = Math.min((meta.diagnostics?.[input.filePath] ?? []).length, 3)
      return 1 + diagCount + (state.error ? 1 : 0)
    }
    case "apply_patch": {
      const files: any[] = meta.files ?? []
      if (files.length === 0) return inlineBase
      // title(1) + per-file: filename(1) + up to 15 diff lines
      let total = 1
      for (const f of files) {
        total += 1 + (f.diff ? wrappedSliceCount(f.diff.split("\n"), 15, cols) : 0)
      }
      return total + (state.error ? 1 : 0)
    }
    case "read": {
      const loaded: any[] = Array.isArray(meta.loaded) ? meta.loaded : []
      return inlineBase + loaded.length
    }
    case "task": {
      if (input.description || input.subagent_type) {
        // BlockTool: title + description (description may wrap)
        const desc = String(input.description ?? "")
        return 1 + Math.max(1, Math.ceil(desc.length / cols)) + (state.error ? 1 : 0)
      }
      return inlineBase
    }
    case "todowrite": {
      const todos: any[] = input.todos ?? []
      if (todos.length > 0) return 1 + todos.length + (state.error ? 1 : 0)
      return inlineBase
    }
    default:
      return inlineBase
  }
}

export function Session(props: { sessionID: string }) {
  const { theme } = useTheme()
  const { sync } = useSDK()
  const { stdout } = useStdout()
  const keybind = useKeybind()
  const [showSidebar, setShowSidebar] = useState(false)
  const [showThinking, setShowThinking] = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [scrollOffset, setScrollOffset] = useState(0)
  const session = useAppStore((s) =>
    s.session.find((ses) => ses.id === props.sessionID),
  )
  const messages = useAppStore((s) => s.message[props.sessionID] ?? EMPTY_MESSAGES)
  const parts = useAppStore((s) => s.part)
  const permissions = useAppStore((s) => s.permission[props.sessionID] ?? EMPTY_PERMISSIONS)
  const questions = useAppStore((s) => s.question[props.sessionID] ?? EMPTY_QUESTIONS)

  // Scroll viewport — estimate rendered lines per message to avoid clipping
  const termHeight = stdout?.rows ?? 24
  const termCols = stdout?.columns ?? 80
  const availableRows = Math.max(termHeight - 12, 5)
  // Usable width after paddingLeft(2) + paddingRight(2) and sidebar
  const contentWidth = Math.max(termCols - (showSidebar ? 42 : 4), 20)

  const estimateLines = useCallback(
    (msg: { id: string; role: string }) => {
      const msgParts = parts[msg.id] ?? []
      if (msg.role === "user") {
        // UserMessage: "> " prefix + joined text parts + marginBottom(1)
        const text = msgParts
          .filter((p: any) => p.type === "text" && !p.synthetic)
          .map((p: any) => p.text ?? "")
          .join("")
          .trim()
        if (!text) return 1 // empty user message renders null, just marginBottom
        // "> " takes 2 chars, leaving contentWidth - 2 for text
        return wrappedLineCount(text, Math.max(contentWidth - 2, 10)) + 1
      }
      // Assistant: agent badge(1) + parts + marginBottom
      let lines = 1
      for (const part of msgParts) {
        if (part.type === "text") {
          const text = (part as any).text ?? ""
          lines += Math.max(1, wrappedLineCount(text, contentWidth))
        } else if (part.type === "tool") {
          lines += estimateToolLines(part, contentWidth)
        } else {
          lines += 1
        }
      }
      return Math.max(lines, 2)
    },
    [parts, contentWidth],
  )

  // Compute visible window based on estimated line heights
  const { visibleMessages, hasAbove, hasBelow, aboveCount, belowCount } = useMemo(() => {
    if (messages.length === 0)
      return { visibleMessages: [] as typeof messages, hasAbove: false, hasBelow: false, aboveCount: 0, belowCount: 0 }

    const start = Math.max(0, Math.min(scrollOffset, messages.length - 1))
    let totalLines = 0
    let endIdx = start
    for (let i = start; i < messages.length; i++) {
      const est = estimateLines(messages[i]!)
      if (totalLines + est > availableRows && endIdx > start) break
      totalLines += est
      endIdx = i + 1
    }
    return {
      visibleMessages: messages.slice(start, endIdx),
      hasAbove: start > 0,
      hasBelow: endIdx < messages.length,
      aboveCount: start,
      belowCount: messages.length - endIdx,
    }
  }, [messages, scrollOffset, availableRows, estimateLines])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!autoScroll) return
    // Find offset where the last message is visible
    let offset = messages.length - 1
    let totalLines = 0
    while (offset > 0) {
      const est = estimateLines(messages[offset]!)
      if (totalLines + est > availableRows) break
      totalLines += est
      offset--
    }
    const nextOffset = Math.max(0, offset)
    setScrollOffset((prev) => (prev === nextOffset ? prev : nextOffset))
  }, [autoScroll, messages, availableRows, estimateLines])

  // Register sidebar toggle keybinding
  useEffect(() => {
    keybind.register("toggle-sidebar", {
      key: "t",
      ctrl: true,
      description: "Toggle sidebar",
      action: () => setShowSidebar((prev) => !prev),
    })
    return () => keybind.unregister("toggle-sidebar")
  }, [keybind.register, keybind.unregister])

  // Register scroll keybindings — step by ~half-page worth of messages
  const halfPage = Math.max(1, Math.floor(availableRows / 6))
  useEffect(() => {
    keybind.register("scroll-up", {
      key: "u",
      ctrl: true,
      description: "Scroll up",
      action: () => {
        setAutoScroll(false)
        setScrollOffset((s) => Math.max(0, s - halfPage))
      },
    })
    keybind.register("scroll-down", {
      key: "d",
      ctrl: true,
      description: "Scroll down",
      action: () => {
        if (messages.length === 0) return
        setScrollOffset((s) => {
          const next = Math.min(messages.length - 1, s + halfPage)
          // Re-enable auto-scroll when near the bottom
          if (next >= messages.length - halfPage - 1) setAutoScroll(true)
          return next
        })
      },
    })
    return () => {
      keybind.unregister("scroll-up")
      keybind.unregister("scroll-down")
    }
  }, [keybind.register, keybind.unregister, halfPage, messages.length])

  // Sync session data on mount
  useEffect(() => {
    sync.syncSession(props.sessionID)
  }, [props.sessionID])

  const handleSubmit = useCallback(
    async (text: string, options: { agent: string; model: { providerID: string; modelID: string } }) => {
      await sync.client.session.prompt({
        sessionID: props.sessionID,
        ...options.model,
        messageID: Identifier.ascending("message"),
        agent: options.agent,
        model: options.model,
        parts: [{ id: Identifier.ascending("part"), type: "text", text }],
      })
    },
    [sync, props.sessionID],
  )

  const title = session?.title ?? "Untitled"
  const cols = stdout?.columns ?? 80

  return (
    <Box flexDirection="row" height="100%">
      {/* Main panel */}
      <Box flexDirection="column" flexGrow={1}>
        {/* Header */}
        <Box paddingLeft={2} paddingRight={2} flexShrink={0}>
          <Text color={theme.primary} bold>LOBSTER</Text>
          <Text color={theme.textMuted}> | </Text>
          <Text color={theme.text}>{title.length > 50 ? title.slice(0, 47) + "..." : title}</Text>
          <Text color={theme.textMuted}> | </Text>
          <Text color={theme.textMuted}>{messages.length} msg</Text>
        </Box>

        <Box paddingLeft={2} paddingRight={2} flexShrink={0}>
          <Text color={theme.textMuted}>{"─".repeat(Math.max(Math.min(cols - (showSidebar ? 42 : 4), 120), 10))}</Text>
        </Box>

        {/* Activity bar */}
        <ActivityBar sessionID={props.sessionID} />

        {/* Messages area */}
        <Box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2} overflow="hidden">
          {hasAbove && (
            <Text color={theme.textMuted}>  ... {aboveCount} more above (Ctrl+U to scroll up)</Text>
          )}
          {visibleMessages.map((msg) => (
            <MessageRow
              key={msg.id}
              message={msg}
              parts={parts[msg.id] ?? []}
              isLast={msg.id === messages[messages.length - 1]?.id}
              showThinking={showThinking}
              showTimestamps={showTimestamps}
            />
          ))}
          {hasBelow && (
            <Text color={theme.textMuted}>  ... {belowCount} more below (Ctrl+D to scroll down)</Text>
          )}
        </Box>

        {/* Permission prompts */}
        {permissions.map((req) => (
          <PermissionPrompt key={req.id} request={req} />
        ))}

        {/* Question prompts */}
        {questions.map((req) => (
          <QuestionPrompt key={req.id} request={req} />
        ))}

        {/* Footer: cost + prompt */}
        <Box flexDirection="column" flexShrink={0}>
          <Box paddingLeft={2} paddingRight={2}>
            <Text color={theme.textMuted}>{"─".repeat(Math.max(Math.min(cols - (showSidebar ? 42 : 4), 120), 10))}</Text>
          </Box>
          <Box paddingLeft={2} justifyContent="space-between" paddingRight={2}>
            <CostTracker sessionID={props.sessionID} />
            <Text color={theme.textMuted}>Ctrl+U/D scroll  Ctrl+T sidebar</Text>
          </Box>
          <Prompt
            sessionID={props.sessionID}
            onSubmit={handleSubmit}
            showThinking={showThinking}
            showTimestamps={showTimestamps}
            onToggleThinking={() => setShowThinking((prev) => !prev)}
            onToggleTimestamps={() => setShowTimestamps((prev) => !prev)}
          />
        </Box>
      </Box>

      {/* Sidebar */}
      {showSidebar && <Sidebar sessionID={props.sessionID} />}
    </Box>
  )
}
