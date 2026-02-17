/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { useTheme, type ThemeColors } from "../../theme"
import { AgentBadge } from "../agent-badge"
import { Spinner } from "../spinner"
import { TextPart } from "./text-part"
import {
  BashTool,
  WriteTool,
  EditTool,
  ReadTool,
  GlobTool,
  GrepTool,
  WebFetchTool,
  WebSearchTool,
  CodeSearchTool,
  TaskTool,
  ApplyPatchTool,
  TodoWriteTool,
  GenericTool,
  type ToolProps,
} from "./tools"

// ─── Message Row ──────────────────────────────────────────

export function MessageRow(props: {
  message: { id: string; role: string; agent?: string; time?: { created?: number } }
  parts: Array<{ id: string; type: string; [key: string]: any }>
  isLast: boolean
  showThinking?: boolean
  showTimestamps?: boolean
}) {
  const { theme } = useTheme()
  const { message, parts } = props

  if (message.role === "user") {
    return (
      <UserMessage
        parts={parts}
        theme={theme}
        timestamp={props.showTimestamps ? message.time?.created : undefined}
      />
    )
  }

  if (message.role === "assistant") {
    return (
      <AssistantMessage
        message={message}
        parts={parts}
        theme={theme}
        isLast={props.isLast}
        showThinking={props.showThinking ?? true}
        timestamp={props.showTimestamps ? message.time?.created : undefined}
      />
    )
  }

  return null
}

// ─── User Message ─────────────────────────────────────────

function UserMessage(props: {
  parts: Array<Record<string, any>>
  theme: ThemeColors
  timestamp?: number
}) {
  const textParts = props.parts.filter((p) => p.type === "text" && !p.synthetic)
  const text = textParts.map((p) => p.text ?? "").join("").trim()
  if (!text) return null

  return (
    <Box marginBottom={1} flexDirection="column">
      {props.timestamp && (
        <Box paddingLeft={2}>
          <Text color={props.theme.textMuted} dimColor>
            {new Date(props.timestamp).toLocaleTimeString()}
          </Text>
        </Box>
      )}
      <Box>
        <Text color={props.theme.accent} bold>{"> "}</Text>
        <Text color={props.theme.text}>{text}</Text>
      </Box>
    </Box>
  )
}

// ─── Assistant Message ────────────────────────────────────

function AssistantMessage(props: {
  message: { id: string; role: string; agent?: string }
  parts: Array<Record<string, any>>
  theme: ThemeColors
  isLast: boolean
  showThinking: boolean
  timestamp?: number
}) {
  const { message, parts, theme, showThinking } = props

  // Check if still streaming (has running/pending tool or is last message with no completed marker)
  const isStreaming = props.isLast && parts.some(
    (p) => p.type === "tool" && (p.state?.status === "running" || p.state?.status === "pending"),
  )

  return (
    <Box flexDirection="column" marginBottom={1}>
      {props.timestamp && (
        <Box paddingLeft={2}>
          <Text color={theme.textMuted} dimColor>
            {new Date(props.timestamp).toLocaleTimeString()}
          </Text>
        </Box>
      )}
      {message.agent && (
        <AgentBadge name={message.agent} variant="dot" color={theme.secondary} />
      )}
      {parts.map((part) => (
        <PartView key={part.id} part={part} theme={theme} showThinking={showThinking} />
      ))}
      {isStreaming && parts.every((p) => p.type !== "tool" || p.state?.status !== "running") && (
        <Box paddingLeft={2}>
          <Spinner />
        </Box>
      )}
    </Box>
  )
}

// ─── Part Dispatcher ──────────────────────────────────────

function PartView(props: { part: Record<string, any>; theme: ThemeColors; showThinking: boolean }) {
  const { part, theme } = props

  if (part.type === "text") {
    return <TextPart text={part.text ?? ""} />
  }

  if (part.type === "reasoning") {
    if (!props.showThinking) return null
    // Show reasoning/thinking blocks dimmed
    const text = (part.text ?? "").trim()
    if (!text) return null
    return (
      <Box flexDirection="column" marginTop={1} paddingLeft={1}>
        <Text color={theme.textMuted} dimColor italic>Thinking: {text.slice(0, 200)}{text.length > 200 ? "..." : ""}</Text>
      </Box>
    )
  }

  if (part.type === "tool") {
    return <ToolPartView part={part} />
  }

  if (part.type === "step-start") {
    return (
      <Box>
        <Text color={theme.textMuted} dimColor>
          --- step {part.step ?? ""} ---
        </Text>
      </Box>
    )
  }

  return null
}

// ─── Tool Part Dispatcher ─────────────────────────────────

function ToolPartView(props: { part: Record<string, any> }) {
  const { part } = props
  const state = part.state ?? {}
  const toolProps: ToolProps = {
    tool: part.tool ?? "",
    input: state.input ?? {},
    metadata: state.status === "pending" ? {} : (state.metadata ?? {}),
    output: state.status === "completed" ? state.output : undefined,
    status: state.status ?? "pending",
    error: state.status === "error" ? state.error : undefined,
  }

  switch (part.tool) {
    case "bash": return <BashTool {...toolProps} />
    case "write": return <WriteTool {...toolProps} />
    case "edit": return <EditTool {...toolProps} />
    case "apply_patch": return <ApplyPatchTool {...toolProps} />
    case "read": return <ReadTool {...toolProps} />
    case "glob": return <GlobTool {...toolProps} />
    case "grep": return <GrepTool {...toolProps} />
    case "webfetch": return <WebFetchTool {...toolProps} />
    case "websearch": return <WebSearchTool {...toolProps} />
    case "codesearch": return <CodeSearchTool {...toolProps} />
    case "task": return <TaskTool {...toolProps} />
    case "todowrite": return <TodoWriteTool {...toolProps} />
    default: return <GenericTool {...toolProps} />
  }
}
