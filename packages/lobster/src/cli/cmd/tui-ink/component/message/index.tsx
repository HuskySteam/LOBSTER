/** @jsxImportSource react */
import { Box, Text } from "ink"
import React from "react"
import { Spinner } from "../spinner"
import { useDesignTokens } from "../../ui/design"
import { TextPart } from "./text-part"
import {
  ApplyPatchTool,
  BashTool,
  CodeSearchTool,
  EditTool,
  GenericTool,
  GlobTool,
  GrepTool,
  ReadTool,
  TaskTool,
  TodoWriteTool,
  type ToolProps,
  WebFetchTool,
  WebSearchTool,
  WriteTool,
} from "./tools"

const FILE_BADGE: Record<string, string> = {
  "text/plain": "txt",
  "image/png": "img",
  "image/jpeg": "img",
  "image/gif": "img",
  "image/webp": "img",
  "application/pdf": "pdf",
  "application/x-directory": "dir",
}

function formatTime(timestamp?: number) {
  if (!timestamp) return ""
  return new Date(timestamp).toLocaleTimeString()
}

export function MessageRow(props: {
  message: {
    id: string
    role: string
    agent?: string
    error?: { data?: { message?: string }; name?: string }
    time?: { created?: number }
  }
  parts: Array<{ id: string; type: string; [key: string]: any }>
  isLast: boolean
  showThinking?: boolean
  showTimestamps?: boolean
}) {
  const { message, parts } = props

  if (message.role === "user") {
    return <UserMessage parts={parts} showTimestamp={props.showTimestamps ? message.time?.created : undefined} />
  }

  if (message.role === "assistant") {
    return (
      <AssistantMessage
        message={message}
        parts={parts}
        isLast={props.isLast}
        showThinking={props.showThinking ?? true}
        showTimestamp={props.showTimestamps ? message.time?.created : undefined}
      />
    )
  }

  return null
}

function UserMessage(props: { parts: Array<Record<string, any>>; showTimestamp?: number }) {
  const tokens = useDesignTokens()
  const textParts = props.parts.filter((part) => part.type === "text" && !part.synthetic)
  const text = textParts
    .map((part) => part.text ?? "")
    .join("")
    .trim()
  const files = props.parts.filter((part) => part.type === "file")

  if (!text && files.length === 0) return null

  return (
    <Box marginBottom={1} flexDirection="column">
      {text ? (
        <Box>
          <Text color={tokens.text.accent}>{"> "}</Text>
          <Text color={tokens.text.primary}>{text}</Text>
          {props.showTimestamp ? (
            <Text color={tokens.text.muted} dimColor>
              {`  ${formatTime(props.showTimestamp)}`}
            </Text>
          ) : null}
        </Box>
      ) : null}

      {files.length > 0 ? (
        <Box paddingLeft={2} flexDirection="column">
          {files.map((file) => {
            const badge = FILE_BADGE[file.mime] ?? file.mime ?? "file"
            return (
              <Text key={file.id} color={tokens.text.muted}>
                <Text color={tokens.text.accent}>[{badge}]</Text> {file.filename}
              </Text>
            )
          })}
        </Box>
      ) : null}
    </Box>
  )
}

function AssistantMessage(props: {
  message: { id: string; role: string; agent?: string; error?: { data?: { message?: string }; name?: string } }
  parts: Array<Record<string, any>>
  isLast: boolean
  showThinking: boolean
  showTimestamp?: number
}) {
  const tokens = useDesignTokens()
  const running =
    props.isLast &&
    props.parts.some(
      (part) => part.type === "tool" && (part.state?.status === "running" || part.state?.status === "pending"),
    )

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={tokens.text.accent}>{props.message.agent ?? "assistant"}</Text>
        {props.showTimestamp ? (
          <Text color={tokens.text.muted} dimColor>
            {`  ${formatTime(props.showTimestamp)}`}
          </Text>
        ) : null}
      </Box>

      {props.parts.map((part) => (
        <PartView key={part.id} part={part} showThinking={props.showThinking} />
      ))}

      {props.message.error?.name === "MessageAbortedError" ? (
        <Box paddingLeft={2}>
          <Text color={tokens.text.muted}>-- interrupted</Text>
        </Box>
      ) : null}

      {props.message.error?.name !== "MessageAbortedError" && props.message.error?.data?.message ? (
        <Box paddingLeft={2}>
          <Text color={tokens.status.error}>{props.message.error.data.message}</Text>
        </Box>
      ) : null}

      {running ? (
        <Box paddingLeft={2}>
          <Spinner color={tokens.text.accent} />
        </Box>
      ) : null}
    </Box>
  )
}

function PartView(props: { part: Record<string, any>; showThinking: boolean }) {
  const tokens = useDesignTokens()
  const { part } = props

  if (part.type === "text") {
    return <TextPart text={part.text ?? ""} />
  }

  if (part.type === "reasoning") {
    if (!props.showThinking) return null
    const text = (part.text ?? "").replace("[REDACTED]", "").trim()
    if (!text) return null
    return (
      <Box marginTop={1} paddingLeft={2}>
        <Text color={tokens.text.muted} dimColor>
          _Thinking:_ {text}
        </Text>
      </Box>
    )
  }

  if (part.type === "tool") {
    return <ToolPartView part={part} />
  }

  if (part.type === "step-start") {
    return (
      <Box paddingLeft={2}>
        <Text color={tokens.text.muted} dimColor>
          -- step {part.step ?? ""} --
        </Text>
      </Box>
    )
  }

  return null
}

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
    case "bash":
      return <BashTool {...toolProps} />
    case "write":
      return <WriteTool {...toolProps} />
    case "edit":
      return <EditTool {...toolProps} />
    case "apply_patch":
      return <ApplyPatchTool {...toolProps} />
    case "read":
      return <ReadTool {...toolProps} />
    case "glob":
      return <GlobTool {...toolProps} />
    case "grep":
      return <GrepTool {...toolProps} />
    case "webfetch":
      return <WebFetchTool {...toolProps} />
    case "websearch":
      return <WebSearchTool {...toolProps} />
    case "codesearch":
      return <CodeSearchTool {...toolProps} />
    case "task":
      return <TaskTool {...toolProps} />
    case "todowrite":
      return <TodoWriteTool {...toolProps} />
    default:
      return <GenericTool {...toolProps} />
  }
}
