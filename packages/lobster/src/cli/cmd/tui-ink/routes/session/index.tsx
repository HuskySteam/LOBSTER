/** @jsxImportSource react */
import { Box, Text, useStdout } from "ink"
import React, { useCallback, useEffect, useState } from "react"
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

export function Session(props: { sessionID: string }) {
  const { theme } = useTheme()
  const { sync } = useSDK()
  const { stdout } = useStdout()
  const keybind = useKeybind()
  const [showSidebar, setShowSidebar] = useState(false)
  const [showThinking, setShowThinking] = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(false)
  const session = useAppStore((s) =>
    s.session.find((ses) => ses.id === props.sessionID),
  )
  const messages = useAppStore((s) => s.message[props.sessionID] ?? [])
  const parts = useAppStore((s) => s.part)
  const permissions = useAppStore((s) => s.permission[props.sessionID] ?? [])
  const questions = useAppStore((s) => s.question[props.sessionID] ?? [])

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
          {messages.map((msg, i) => (
            <MessageRow
              key={msg.id}
              message={msg}
              parts={parts[msg.id] ?? []}
              isLast={i === messages.length - 1}
              showThinking={showThinking}
              showTimestamps={showTimestamps}
            />
          ))}
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
            <Text color={theme.textMuted}>Ctrl+T sidebar</Text>
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
