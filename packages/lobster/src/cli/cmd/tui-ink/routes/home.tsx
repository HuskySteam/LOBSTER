/** @jsxImportSource react */
import { Box, Text, useInput, useStdout } from "ink"
import React, { useCallback, useMemo } from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { Logo } from "../component/logo"
import { Prompt } from "../component/prompt"
import { DialogProvider as DialogProviderSetup } from "../component/dialog-provider"
import { Identifier } from "@/id/id"

function truncateTitle(value: string, max = 36) {
  if (value.length <= max) return value
  return value.slice(0, max - 3) + "..."
}

function formatSessionDate(value: number) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function Home() {
  const { theme } = useTheme()
  const { stdout } = useStdout()
  const route = useRoute()
  const { sync } = useSDK()
  const dialog = useDialog()
  const sessions = useAppStore((s) => s.session)
  const providers = useAppStore((s) => s.provider)

  const hasProvider = providers.length > 0
  const username = process.env.USERNAME || process.env.USER || "there"
  const isCompact = (stdout?.columns ?? 96) < 96
  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.time.updated - a.time.updated)
        .slice(0, 4),
    [sessions],
  )
  const rightDivider = useMemo(() => {
    const columns = stdout?.columns ?? 100
    const width = isCompact ? columns - 10 : Math.floor(columns * 0.4)
    return "─".repeat(Math.max(18, Math.min(44, width)))
  }, [isCompact, stdout?.columns])

  const handleSubmit = useCallback(
    async (text: string, options: { agent: string; model: { providerID: string; modelID: string } }) => {
      const result = await sync.client.session.create({})
      if (!result.data?.id) return
      const sessionID = result.data.id

      route.navigate({ type: "session", sessionID })

      await sync.client.session.prompt({
        sessionID,
        ...options.model,
        messageID: Identifier.ascending("message"),
        agent: options.agent,
        model: options.model,
        parts: [{ id: Identifier.ascending("part"), type: "text", text }],
      })
    },
    [sync, route],
  )

  useInput((_ch, key) => {
    if (dialog.content !== null) return
    if (!hasProvider && key.return) {
      dialog.replace(<DialogProviderSetup />)
    }
  })

  return (
    <Box flexDirection="column" padding={1} height="100%">
      <Box paddingLeft={1} marginBottom={1}>
        <Text color={theme.primary} bold>LOBSTER Code</Text>
      </Box>

      <Box
        borderStyle="round"
        borderColor={theme.accent}
        flexDirection={isCompact ? "column" : "row"}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
      >
        <Box flexDirection="column" flexGrow={1} paddingRight={isCompact ? 0 : 2}>
          <Text color={theme.text} bold>Welcome back {username}!</Text>
          <Box marginTop={1} marginBottom={1} alignItems={isCompact ? "flex-start" : "center"}>
            <Logo />
          </Box>

          {hasProvider ? (
            <Text color={theme.textMuted}>
              {sessions.length} session{sessions.length === 1 ? "" : "s"} · {providers.length} provider
              {providers.length === 1 ? "" : "s"} connected
            </Text>
          ) : (
            <Text color={theme.warning} bold>No providers connected</Text>
          )}

          <Text color={theme.textMuted}>
            Press{" "}
            <Text color={theme.text} bold>{hasProvider ? "/new" : "Enter"}</Text>
            {hasProvider ? " to start a fresh session." : " or Ctrl+O to connect a provider."}
          </Text>
        </Box>

        <Box
          flexDirection="column"
          flexGrow={1}
          paddingLeft={isCompact ? 0 : 2}
          marginTop={isCompact ? 1 : 0}
          borderStyle="single"
          borderColor={theme.borderSubtle}
          borderLeft={!isCompact}
          borderTop={isCompact}
          borderBottom={false}
          borderRight={false}
        >
          <Text color={theme.accent} bold>Tips for getting started</Text>
          <Text color={theme.textMuted}>
            {hasProvider
              ? "Ask Lobster to scaffold, debug, or review code in this repo."
              : "Connect a provider first, then ask Lobster to create your first app."}
          </Text>
          <Text color={theme.textMuted}>
            Try <Text color={theme.text}>/model</Text>, <Text color={theme.text}>/agent</Text>, and{" "}
            <Text color={theme.text}>/sessions</Text> to navigate faster.
          </Text>

          <Box marginTop={1}>
            <Text color={theme.borderSubtle}>{rightDivider}</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color={theme.accent} bold>Recent activity</Text>
            {recentSessions.length === 0 ? (
              <Text color={theme.textMuted}>No recent activity</Text>
            ) : (
              recentSessions.map((session) => (
                <Text key={session.id} color={theme.text}>
                  - {truncateTitle(session.title || "Untitled session")}{" "}
                  <Text color={theme.textMuted}>({formatSessionDate(session.time.updated)})</Text>
                </Text>
              ))
            )}
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Prompt onSubmit={handleSubmit} />
      </Box>
    </Box>
  )
}
