/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useState, useCallback } from "react"
import { useTheme } from "../../theme"
import { useSDK } from "../../context/sdk"
import type { PermissionRequest } from "@lobster-ai/sdk/v2"
import path from "path"

function normalizePath(input?: string) {
  if (!input) return ""
  const cwd = process.cwd()
  const absolute = path.isAbsolute(input) ? input : path.resolve(cwd, input)
  const relative = path.relative(cwd, absolute)
  if (!relative) return "."
  if (!relative.startsWith("..")) return relative
  return absolute
}

function describePermission(request: PermissionRequest, input: Record<string, any>): string {
  switch (request.permission) {
    case "edit":
      return `Edit ${normalizePath(request.metadata?.filepath as string)}`
    case "read":
      return `Read ${normalizePath(input.filePath ?? input.file_path)}`
    case "glob":
      return `Glob "${input.pattern ?? ""}"`
    case "grep":
      return `Grep "${input.pattern ?? ""}"`
    case "list":
      return `List ${normalizePath(input.path)}`
    case "bash":
      return `$ ${input.command ?? ""}`
    case "task":
      return `${input.subagent_type ?? "Agent"} task: ${input.description ?? ""}`
    case "webfetch":
      return `WebFetch ${input.url ?? ""}`
    case "websearch":
      return `Web Search "${input.query ?? ""}"`
    case "doom_loop":
      return "Continue after repeated failures"
    default:
      return `Call tool ${request.permission}`
  }
}

export function PermissionPrompt(props: { request: PermissionRequest }) {
  const { sync } = useSDK()
  const { theme } = useTheme()
  const [selected, setSelected] = useState(0)
  const options = ["Allow once", "Allow always", "Reject"] as const

  // Resolve tool input from parts
  const input = (() => {
    const tool = props.request.tool
    if (!tool) return {}
    const parts = (sync as any).client ? [] : [] // Parts come from store
    return {}
  })()

  const description = describePermission(props.request, input)

  const handleSelect = useCallback(
    (option: number) => {
      switch (option) {
        case 0: // Allow once
          sync.client.permission.reply({
            reply: "once",
            requestID: props.request.id,
          })
          break
        case 1: // Always
          sync.client.permission.reply({
            reply: "always",
            requestID: props.request.id,
          })
          break
        case 2: // Reject
          sync.client.permission.reply({
            reply: "reject",
            requestID: props.request.id,
          })
          break
      }
    },
    [sync, props.request.id],
  )

  useInput((ch, key) => {
    if (key.leftArrow || ch === "h") {
      setSelected((s) => (s - 1 + options.length) % options.length)
    }
    if (key.rightArrow || ch === "l") {
      setSelected((s) => (s + 1) % options.length)
    }
    if (key.return) {
      handleSelect(selected)
    }
    if (key.escape) {
      handleSelect(2) // Reject
    }
    // Number shortcuts
    if (ch === "1") handleSelect(0)
    if (ch === "2") handleSelect(1)
    if (ch === "3") handleSelect(2)
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.warning}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Title */}
      <Box gap={1}>
        <Text color={theme.warning}>{"△"}</Text>
        <Text color={theme.text} bold>Permission required</Text>
      </Box>

      {/* Description */}
      <Box paddingLeft={2} marginTop={1}>
        <Text color={theme.textMuted}>{description}</Text>
      </Box>

      {/* Diff preview for edits */}
      {props.request.permission === "edit" && typeof props.request.metadata?.diff === "string" && (
        <Box paddingLeft={2} marginTop={1} flexDirection="column">
          {(props.request.metadata.diff as string)
            .split("\n")
            .slice(0, 10)
            .map((line, i) => (
              <Text
                key={i}
                color={
                  line.startsWith("+") ? theme.diffAdded
                    : line.startsWith("-") ? theme.diffRemoved
                    : theme.textMuted
                }
              >
                {line}
              </Text>
            ))}
          {(props.request.metadata.diff as string).split("\n").length > 10 && (
            <Text color={theme.textMuted}>... ({(props.request.metadata.diff as string).split("\n").length - 10} more lines)</Text>
          )}
        </Box>
      )}

      {/* Options */}
      <Box marginTop={1} gap={1}>
        {options.map((opt, i) => (
          <Box key={i} paddingLeft={1} paddingRight={1}>
            <Text
              color={i === selected ? theme.text : theme.textMuted}
              bold={i === selected}
              inverse={i === selected}
            >
              {` ${opt} `}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Hints */}
      <Box marginTop={1} gap={2}>
        <Text color={theme.textMuted}>{"←→ select"}</Text>
        <Text color={theme.textMuted}>{"enter confirm"}</Text>
        <Text color={theme.textMuted}>{"esc reject"}</Text>
      </Box>
    </Box>
  )
}
