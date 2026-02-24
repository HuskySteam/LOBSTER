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
import { KeyHints, PanelHeader, StatusBadge } from "../../ui/chrome"
import { separator, useDesignTokens } from "../../ui/design"

const EMPTY_MESSAGES: never[] = []
const EMPTY_PERMISSIONS: never[] = []
const EMPTY_QUESTIONS: never[] = []
const BLOCK_TOOL_CHROME_LINES = 5 // marginTop + border(top/bottom) + padding(top/bottom)

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
  // We should account for wrapping in the inline tool text if possible, but as a baseline:
  let inlineBase = state.error ? 2 : 1
  if (input.command) {
    inlineBase = wrappedLineCount(String(input.command), cols) + (state.error ? 1 : 0)
  } else if (input.filePath) {
    inlineBase = wrappedLineCount(String(input.filePath), cols) + (state.error ? 1 : 0)
  }

  // Block tools have borders and padding which reduce available width
  const blockCols = Math.max(10, cols - 4)

  switch (part.tool) {
    case "bash": {
      if (meta.output === undefined) return inlineBase
      // BlockTool: title(1) + command(1) + up to 10 output lines + overflow indicator
      const raw = (meta.output ?? "").trim()
      const allLines = raw ? raw.split("\n") : []
      const outputRows = raw ? wrappedSliceCount(allLines, 10, blockCols) : 0
      const cmdRows = wrappedLineCount(String(input.command ?? ""), blockCols)
      return BLOCK_TOOL_CHROME_LINES + 1 + cmdRows + outputRows + (allLines.length > 10 ? 1 : 0) + (state.error ? 1 : 0)
    }
    case "edit": {
      if (meta.diff === undefined) return inlineBase
      // BlockTool: title(1) + up to 30 diff lines + overflow + diagnostics
      const allLines = (meta.diff ?? "").split("\n")
      const diffRows = wrappedSliceCount(allLines, 30, blockCols)
      const diags = ((meta.diagnostics?.[input.filePath] ?? []) as any[]).filter((x: any) => x.severity === 1).slice(0, 3)
      let diagRows = 0
      for (const d of diags) {
        diagRows += wrappedLineCount(`Error [${d.range?.start?.line}:${d.range?.start?.character}] ${d.message}`, blockCols)
      }
      return BLOCK_TOOL_CHROME_LINES + 1 + diffRows + (allLines.length > 30 ? 1 : 0) + diagRows + (state.error ? 1 : 0)
    }
    case "write": {
      if (meta.diagnostics === undefined) return inlineBase
      const diags = (meta.diagnostics?.[input.filePath] ?? []).slice(0, 3)
      let diagRows = 0
      for (const d of diags) {
        diagRows += wrappedLineCount(`Error [${d.range?.start?.line}:${d.range?.start?.character}] ${d.message}`, blockCols)
      }
      return BLOCK_TOOL_CHROME_LINES + 1 + diagRows + (state.error ? 1 : 0)
    }
    case "apply_patch": {
      const files: any[] = meta.files ?? []
      if (files.length === 0) return inlineBase
      // title(1) + per-file: filename(1) + up to 15 diff lines
      let total = 1
      for (const f of files) {
        total += wrappedLineCount(String(f.file ?? ""), blockCols) + (f.diff ? wrappedSliceCount(f.diff.split("\n"), 15, blockCols) : 0)
      }
      return BLOCK_TOOL_CHROME_LINES + total + (state.error ? 1 : 0)
    }
    case "read": {
      const loaded: any[] = Array.isArray(meta.loaded) ? meta.loaded : []
      let loadedLines = 0
      for (const f of loaded) {
        loadedLines += wrappedLineCount(`-> Loaded ${f}`, Math.max(10, cols - 5))
      }
      return inlineBase + loadedLines
    }
    case "task": {
      if (input.description || input.subagent_type) {
        // BlockTool: title + description (description may wrap)
        const desc = String(input.description ?? "")
        return BLOCK_TOOL_CHROME_LINES + 1 + wrappedLineCount(desc, blockCols) + (state.error ? 1 : 0)
      }
      return inlineBase
    }
    case "todowrite": {
      const todos: any[] = input.todos ?? []
      if (todos.length > 0) {
        let todoLines = 0
        for (const t of todos) {
          todoLines += wrappedLineCount(`[x] ${t.content ?? ""}`, blockCols)
        }
        return BLOCK_TOOL_CHROME_LINES + 1 + todoLines + (state.error ? 1 : 0)
      }
      return inlineBase
    }
    default:
      return inlineBase
  }
}

export function Session(props: { sessionID: string }) {
  const { theme } = useTheme()
  const tokens = useDesignTokens()
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
  
  // Estimate height of permissions and questions
  let promptLines = 0
  for (const req of permissions) {
    // Base: margin(1) + borders(2) + header(1) + badge(1) + desc(2) + options(2) = 9
    let lines = 9
    if (req.permission === "edit" && typeof req.metadata?.diff === "string") {
      const diffLines = req.metadata.diff.split("\n").slice(0, 10).length
      lines += diffLines + 1 // +1 for margin
    }
    promptLines += lines
  }
  for (const req of questions) {
    // Base: margin(1) + borders(2) + header(1) + question(2) + options(4) = 10
    promptLines += 10
  }

  const availableRows = Math.max(termHeight - 12 - promptLines, 5)
  // Usable width after paddingLeft(2) + paddingRight(2) and sidebar
  const contentWidth = Math.max(termCols - (showSidebar ? 42 : 4), 20)

  const estimateLines = useCallback(
    (msg: { id: string; role: string; agent?: string }) => {
      const msgParts = parts[msg.id] ?? []
      if (msg.role === "user") {
        // UserMessage: StatusBadge(1) + "> " prefix + joined text parts + marginBottom(1)
        const text = msgParts
          .filter((p: any) => p.type === "text" && !p.synthetic)
          .map((p: any) => p.text ?? "")
          .join("")
          .trim()
        if (!text) return 1 // empty user message renders null, just marginBottom
        // "> " takes 2 chars, leaving contentWidth - 2 for text
        return wrappedLineCount(text, Math.max(contentWidth - 2, 10)) + 2
      }
      // Assistant: StatusBadge(1) + AgentBadge(1 if agent) + parts + marginBottom(1)
      const isLast = msg.id === messages[messages.length - 1]?.id
      let lines = 2 + (msg.agent ? 1 : 0) + (isLast ? 1 : 0) // +1 for potential spinner
      for (const part of msgParts) {
        if (part.type === "text") {
          const text = (part as any).text ?? ""
          const trimmed = text.trim()
          if (trimmed) {
            // TextPart has marginTop={1}
            let textLines = 1
            const hardLines = trimmed.split("\n")
            for (let i = 0; i < hardLines.length; i++) {
              if (hardLines[i].startsWith("```")) {
                const lang = hardLines[i].slice(3).trim()
                if (lang) textLines += 1 // lang label
                i++
                while (i < hardLines.length && !hardLines[i].startsWith("```")) {
                  textLines += Math.max(1, Math.ceil(hardLines[i].length / Math.max(10, contentWidth - 1)))
                  i++
                }
              } else {
                textLines += Math.max(1, Math.ceil(hardLines[i].length / contentWidth))
              }
            }
            lines += Math.max(1, textLines)
          }
        } else if (part.type === "reasoning") {
          if (showThinking) {
            const text = (part as any).text ?? ""
            if (text.trim()) {
              const display = `Thinking: ${text.trim().slice(0, 200)}${text.trim().length > 200 ? "..." : ""}`
              lines += Math.max(1, wrappedLineCount(display, Math.max(10, contentWidth - 1))) + 1 // +1 for marginTop
            }
          }
        } else if (part.type === "tool") {
          lines += estimateToolLines(part, contentWidth)
        } else {
          lines += 1
        }
      }
      return Math.max(lines, 3)
    },
    [parts, contentWidth, showThinking, messages],
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
  const divider = separator(Math.max(Math.min(cols - (showSidebar ? 42 : 4), 120), 10))

  return (
    <Box flexDirection="row" height="100%">
      {/* Main panel */}
      <Box flexDirection="column" flexGrow={1}>
        {/* Header */}
        <Box paddingLeft={2} paddingRight={2} flexShrink={0}>
          <PanelHeader
            title="Session"
            subtitle={title.length > 60 ? title.slice(0, 57) + "..." : title}
            right={`${messages.length} msg`}
          />
        </Box>

        <Box paddingLeft={2} paddingRight={2} gap={1} flexShrink={0}>
          <StatusBadge tone="accent" label={showThinking ? "thinking on" : "thinking off"} />
          <StatusBadge tone={showTimestamps ? "success" : "muted"} label={showTimestamps ? "time on" : "time off"} />
        </Box>

        <Box paddingLeft={2} paddingRight={2} flexShrink={0}>
          <Text color={tokens.text.muted}>{divider}</Text>
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
            <Text color={tokens.text.muted}>{divider}</Text>
          </Box>
          <Box paddingLeft={2} justifyContent="space-between" paddingRight={2}>
            <CostTracker sessionID={props.sessionID} />
            <Text color={tokens.text.muted}>scroll + layout controls</Text>
          </Box>
          <Box paddingLeft={2} paddingRight={2}>
            <KeyHints items={["Ctrl+U up", "Ctrl+D down", "Ctrl+T sidebar"]} />
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
