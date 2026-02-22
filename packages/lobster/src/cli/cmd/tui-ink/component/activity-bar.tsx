/** @jsxImportSource react */
import { Box } from "ink"
import React, { useMemo } from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { Spinner } from "./spinner"
import path from "path"

const EMPTY_MESSAGES: never[] = []
const EMPTY_PARTS: never[] = []
const EMPTY_SESSION_PARTS: Record<string, never[]> = {}

export function ActivityBar(props: { sessionID: string }) {
  const { theme } = useTheme()
  const sessionStatus = useAppStore((s) => s.session_status[props.sessionID])
  const messages = useAppStore((s) => s.message[props.sessionID] ?? EMPTY_MESSAGES)
  const sessionParts = useAppStore((s) => s.session_part[props.sessionID] ?? EMPTY_SESSION_PARTS)

  const isBusy = sessionStatus?.type === "busy"

  const activityInfo = useMemo(() => {
    if (!isBusy) return null

    const pendingMessage = messages.findLast(
      (x) => x.role === "assistant" && !x.time.completed,
    )
    if (!pendingMessage) return { text: "Thinking...", count: "" }

    const msgParts = sessionParts[pendingMessage.id] ?? EMPTY_PARTS
    const toolParts = msgParts.filter((p) => p.type === "tool")
    if (toolParts.length === 0) return { text: "Thinking...", count: "" }

    const running = toolParts.filter((p) => p.state.status === "running")
    const completed = toolParts.filter(
      (p) => p.state.status === "completed" || p.state.status === "error",
    )

    if (running.length === 0) return { text: "Thinking...", count: "" }
    if (running.length > 1) return { text: `${running.length} tools running...`, count: "" }

    const part = running[0]
    const text = describeToolCall(part.tool, part.state.input)
    const total = toolParts.length
    const done = completed.length
    const count = total > 1 ? ` ${done}/${total}` : ""

    return { text, count }
  }, [isBusy, messages, sessionParts])

  if (!isBusy || !activityInfo) return null

  return (
    <Box flexShrink={0} paddingLeft={2} paddingRight={2}>
      <Spinner color={theme.primary}>
        {activityInfo.text}{activityInfo.count}
      </Spinner>
    </Box>
  )
}

function describeToolCall(tool: string, input: Record<string, any>): string {
  switch (tool) {
    case "read":
      return `Reading ${relativePath(input.filePath ?? input.file_path ?? "")}`
    case "write":
      return `Writing ${relativePath(input.filePath ?? input.file_path ?? "")}`
    case "edit":
      return `Editing ${relativePath(input.filePath ?? input.file_path ?? "")}`
    case "bash":
      return `Running: ${truncate(input.command ?? "", 40)}`
    case "glob":
      return `Searching for "${input.pattern ?? ""}"`
    case "grep":
      return `Searching for "${input.pattern ?? ""}"`
    case "webfetch":
      return `Fetching ${truncate(input.url ?? "", 40)}`
    case "websearch":
      return `Searching: "${input.query ?? ""}"`
    case "task":
      return `Delegating ${input.subagent_type ?? input.subagentType ?? "agent"} task`
    default:
      return `Running ${tool}`
  }
}

function relativePath(filePath: string): string {
  if (!filePath) return ""
  try {
    return path.relative(process.cwd(), filePath) || filePath
  } catch {
    return filePath
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.substring(0, max) + "..."
}
