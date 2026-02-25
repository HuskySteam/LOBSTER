/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useSDK } from "../../context/sdk"
import { useKeybind } from "../../context/keybind"
import { useAppStore } from "../../store"
import type { PermissionRequest } from "@lobster-ai/sdk/v2"
import path from "path"
import { KeyHints, PanelHeader, StatusBadge } from "../../ui/chrome"
import { useDesignTokens } from "../../ui/design"

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
  const tokens = useDesignTokens()
  const { setBlocker } = useKeybind()
  const [selected, setSelected] = useState(0)
  const options = ["Allow once", "Allow always", "Reject"] as const
  const allParts = useAppStore((s) => s.part)

  const blockerID = `permission-${props.request.id}`
  useEffect(() => {
    setBlocker(blockerID, true)
    return () => setBlocker(blockerID, false)
  }, [setBlocker, blockerID])

  const input = useMemo(() => {
    const tool = props.request.tool
    if (!tool) return {}
    const parts = allParts[tool.messageID] ?? []
    for (const part of parts) {
      if (part.type === "tool" && part.callID === tool.callID && part.state.status !== "pending") {
        return part.state.input ?? {}
      }
    }
    return {}
  }, [props.request.tool, allParts])

  const description = describePermission(props.request, input)

  const handleSelect = useCallback(
    (option: number) => {
      switch (option) {
        case 0:
          sync.client.permission.reply({
            reply: "once",
            requestID: props.request.id,
          })
          break
        case 1:
          sync.client.permission.reply({
            reply: "always",
            requestID: props.request.id,
          })
          break
        case 2:
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
      handleSelect(2)
    }
    if (ch === "1") handleSelect(0)
    if (ch === "2") handleSelect(1)
    if (ch === "3") handleSelect(2)
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={tokens.status.warning}
      paddingLeft={1}
      paddingRight={1}
      marginTop={1}
    >
      <PanelHeader title="Permission Required" right="esc reject" />
      <StatusBadge tone="warning" label={props.request.permission} />

      <Box paddingLeft={1} marginTop={1}>
        <Text color={tokens.text.muted}>{description}</Text>
      </Box>

      {props.request.permission === "edit" && typeof props.request.metadata?.diff === "string" ? (
        <Box paddingLeft={1} marginTop={1} flexDirection="column">
          {(props.request.metadata.diff as string)
            .split("\n")
            .slice(0, 10)
            .map((line) => (
              <Text
                key={line}
                color={
                  line.startsWith("+")
                    ? tokens.status.success
                    : line.startsWith("-")
                      ? tokens.status.error
                      : tokens.text.muted
                }
              >
                {line}
              </Text>
            ))}
          {(props.request.metadata.diff as string).split("\n").length > 10 ? (
            <Text color={tokens.text.muted}>
              ... ({(props.request.metadata.diff as string).split("\n").length - 10} more lines)
            </Text>
          ) : null}
        </Box>
      ) : null}

      <Box marginTop={1} gap={1}>
        {options.map((opt, index) => (
          <Box key={opt} paddingLeft={1} paddingRight={1}>
            <Text
              color={index === selected ? tokens.text.primary : tokens.text.muted}
              bold={index === selected}
              inverse={index === selected}
            >
              {` ${opt} `}
            </Text>
          </Box>
        ))}
      </Box>

      <KeyHints items={["left/right select", "enter confirm", "esc reject", "1/2/3 quick select"]} />
    </Box>
  )
}
