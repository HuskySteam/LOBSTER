/** @jsxImportSource react */
import { Box, Text, useStdout } from "ink"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useTheme } from "../../theme"
import { useAppStore } from "../../store"
import { useSDK } from "../../context/sdk"
import { useLocal } from "../../context/local"
import { useKeybind } from "../../context/keybind"
import { Prompt } from "../../component/prompt"
import { ActivityBar } from "../../component/activity-bar"
import { MessageRow } from "../../component/message"
import { Sidebar } from "./sidebar"
import { PermissionPrompt } from "./permission"
import { QuestionPrompt } from "./question"
import { Identifier } from "@/id/id"
import {
  PANEL_TABS,
  cycleDockSide,
  cyclePanelTab,
  resolveInteractionMode,
  type DockSide,
  type PanelTab,
} from "./layout-model"
import { estimateToolLines, wrappedLineCount } from "./line-estimate"

const EMPTY_MESSAGES: never[] = []
const EMPTY_PERMISSIONS: never[] = []
const EMPTY_QUESTIONS: never[] = []

export function Session(props: { sessionID: string }) {
  const { theme } = useTheme()
  const { sync } = useSDK()
  const local = useLocal()
  const { stdout } = useStdout()
  const keybind = useKeybind()
  const [dockSide, setDockSide] = useState<DockSide>("hidden")
  const [panelTab, setPanelTab] = useState<PanelTab>("context")
  const [showThinking, setShowThinking] = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [promptPlanning, setPromptPlanning] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [diffCursor, setDiffCursor] = useState(0)
  const [activityCursor, setActivityCursor] = useState(0)
  const [expandedActivity, setExpandedActivity] = useState(false)
  const session = useAppStore((s) => s.session.find((ses) => ses.id === props.sessionID))
  const messages = useAppStore((s) => s.message[props.sessionID] ?? EMPTY_MESSAGES)
  const parts = useAppStore((s) => s.part)
  const permissions = useAppStore((s) => s.permission[props.sessionID] ?? EMPTY_PERMISSIONS)
  const questions = useAppStore((s) => s.question[props.sessionID] ?? EMPTY_QUESTIONS)
  const sessionStatus = useAppStore((s) => s.session_status[props.sessionID])

  // Scroll viewport - estimate rendered lines per message to avoid clipping
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

  const panelWidth = dockSide === "hidden" ? 0 : 42
  const availableRows = Math.max(termHeight - 12 - promptLines, 5)
  // Usable width after shell padding and optional docked panel
  const contentWidth = Math.max(termCols - panelWidth - 4, 20)
  const promptLayoutWidth = Math.max(contentWidth - 2, 20)

  const estimateLines = useCallback(
    (msg: { id: string; role: string; agent?: string }) => {
      const msgParts = parts[msg.id] ?? []
      if (msg.role === "user") {
        // UserMessage: StatusBadge(1) + "> " prefix + joined text parts + marginBottom(1)
        const text = msgParts
          .filter((p) => p.type === "text" && !(p as { synthetic?: boolean }).synthetic)
          .map((p) => (p as { text?: string }).text ?? "")
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
          const text = (part as { text?: string }).text ?? ""
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
            const text = (part as { text?: string }).text ?? ""
            if (text.trim()) {
              const display = `Thinking: ${text.trim().slice(0, 200)}${text.trim().length > 200 ? "..." : ""}`
              lines += Math.max(1, wrappedLineCount(display, Math.max(10, contentWidth - 1))) + 1 // +1 for marginTop
            }
          }
        } else if (part.type === "tool") {
          lines += estimateToolLines(part as Parameters<typeof estimateToolLines>[0], contentWidth)
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

  useEffect(() => {
    if (panelTab !== "activity") setExpandedActivity(false)
  }, [panelTab])

  const isBusy = sessionStatus?.type === "busy"
  const interactionMode = resolveInteractionMode({
    activeTab: panelTab,
    isBusy,
    isPlanning: promptPlanning,
  })

  // Register panel and dock keybindings
  useEffect(() => {
    keybind.register("dock-cycle", {
      key: "t",
      ctrl: true,
      description: "Cycle dock panel",
      action: () => setDockSide((prev) => cycleDockSide(prev)),
    })
    keybind.register("panel-prev", {
      key: "h",
      meta: true,
      description: "Previous panel tab",
      action: () => setPanelTab((prev) => cyclePanelTab(prev, -1)),
    })
    keybind.register("panel-next", {
      key: "l",
      meta: true,
      description: "Next panel tab",
      action: () => setPanelTab((prev) => cyclePanelTab(prev, 1)),
    })
    PANEL_TABS.forEach((tab, index) => {
      keybind.register(`panel-tab-${tab}`, {
        key: String(index + 1),
        meta: true,
        description: `Open ${tab} panel`,
        action: () => setPanelTab(tab),
      })
    })

    return () => {
      keybind.unregister("dock-cycle")
      keybind.unregister("panel-prev")
      keybind.unregister("panel-next")
      PANEL_TABS.forEach((tab) => keybind.unregister(`panel-tab-${tab}`))
    }
  }, [keybind.register, keybind.unregister])

  // Register scroll keybindings - step by ~half-page worth of messages
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
          if (next >= messages.length - halfPage - 1) setAutoScroll(true)
          return next
        })
      },
    })
    keybind.register("panel-cursor-up", {
      key: "k",
      meta: true,
      description: "Move panel selection up",
      action: () => {
        if (panelTab === "diff") {
          setDiffCursor((current) => Math.max(0, current - 1))
          return
        }
        if (panelTab === "activity") {
          setActivityCursor((current) => Math.max(0, current - 1))
          return
        }
      },
    })
    keybind.register("panel-cursor-down", {
      key: "j",
      meta: true,
      description: "Move panel selection down",
      action: () => {
        if (panelTab === "diff") {
          setDiffCursor((current) => current + 1)
          return
        }
        if (panelTab === "activity") {
          setActivityCursor((current) => current + 1)
          return
        }
      },
    })
    keybind.register("panel-expand", {
      key: "e",
      meta: true,
      description: "Expand activity details",
      action: () => {
        if (panelTab !== "activity") return
        setExpandedActivity((current) => !current)
      },
    })
    return () => {
      keybind.unregister("scroll-up")
      keybind.unregister("scroll-down")
      keybind.unregister("panel-cursor-up")
      keybind.unregister("panel-cursor-down")
      keybind.unregister("panel-expand")
    }
  }, [keybind.register, keybind.unregister, halfPage, messages.length, panelTab])

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
  const parsedModel = local.model.parsed()
  const headerTitle = title.length > 72 ? title.slice(0, 69) + "..." : title

  return (
    <Box flexDirection="row" height="100%">
      {dockSide === "left" && (
        <Sidebar
          sessionID={props.sessionID}
          activeTab={panelTab}
          onSelectTab={setPanelTab}
          dockSide="left"
          diffCursor={diffCursor}
          activityCursor={activityCursor}
          expandedActivity={expandedActivity}
        />
      )}

      <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
        <Box flexShrink={0} paddingLeft={1} paddingRight={1}>
          <Text color={theme.textMuted}>
            <Text color={theme.text}>{headerTitle}</Text>
            <Text dimColor> · </Text>
            <Text color={theme.accent}>{interactionMode}</Text>
            <Text dimColor> · </Text>
            {messages.length} msg
            <Text dimColor> · </Text>
            {sessionStatus?.type ?? "idle"}
          </Text>
        </Box>

        <ActivityBar sessionID={props.sessionID} />

        <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1} overflow="hidden" marginTop={1}>
          {hasAbove && <Text color={theme.textMuted}>↑ {aboveCount} more above (Ctrl+U)</Text>}
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
          {hasBelow && <Text color={theme.textMuted}>↓ {belowCount} more below (Ctrl+D)</Text>}
        </Box>

        {permissions.map((req) => (
          <PermissionPrompt key={req.id} request={req} />
        ))}

        {questions.map((req) => (
          <QuestionPrompt key={req.id} request={req} />
        ))}

        <Box flexDirection="column" flexShrink={0} marginTop={1}>
          <Box paddingLeft={1} paddingRight={1}>
            <Text color={theme.textMuted}>
              <Text color={theme.accent}>{local.agent.current().name}</Text>
              <Text dimColor> · </Text>
              {parsedModel.provider}/{parsedModel.model}
              <Text dimColor> · </Text>
              Ctrl+K palette · Ctrl+U/D scroll · Ctrl+T dock
            </Text>
          </Box>
          <Prompt
            sessionID={props.sessionID}
            onSubmit={handleSubmit}
            showThinking={showThinking}
            showTimestamps={showTimestamps}
            activePanelTab={panelTab}
            layoutWidth={promptLayoutWidth}
            onToggleThinking={() => setShowThinking((prev) => !prev)}
            onToggleTimestamps={() => setShowTimestamps((prev) => !prev)}
            onPlanningChange={setPromptPlanning}
          />
        </Box>
      </Box>

      {dockSide === "right" && (
        <Sidebar
          sessionID={props.sessionID}
          activeTab={panelTab}
          onSelectTab={setPanelTab}
          dockSide="right"
          diffCursor={diffCursor}
          activityCursor={activityCursor}
          expandedActivity={expandedActivity}
        />
      )}
    </Box>
  )
}
