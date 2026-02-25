/** @jsxImportSource react */
import { Box, Text, useInput, useStdout } from "ink"
import React, { useCallback, useMemo } from "react"
import { useAppStore } from "../store"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { Logo } from "../component/logo"
import { Prompt } from "../component/prompt"
import { DialogProvider as DialogProviderSetup } from "../component/dialog-provider"
import { Identifier } from "@/id/id"
import { EmptyState, KeyHints, PanelHeader, StatusBadge } from "../ui/chrome"
import { separator, useDesignTokens } from "../ui/design"

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
  const tokens = useDesignTokens()
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
    () => [...sessions].sort((a, b) => b.time.updated - a.time.updated).slice(0, 4),
    [sessions],
  )
  const rightDivider = useMemo(() => {
    const columns = stdout?.columns ?? 100
    const width = isCompact ? columns - 10 : Math.floor(columns * 0.4)
    return separator(Math.max(18, Math.min(44, width)))
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
      <PanelHeader title="LOBSTER Workspace" right={hasProvider ? "connected" : "engine required"} />

      <Box
        flexDirection={isCompact ? "column" : "row"}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
      >
        <Box flexDirection="column" flexGrow={1} paddingRight={isCompact ? 0 : 2}>
          <Text color={tokens.text.primary} bold>
            Welcome back {username}!
          </Text>
          <Box marginTop={1} marginBottom={1} alignItems={isCompact ? "flex-start" : "center"}>
            <Logo />
          </Box>

          {hasProvider ? (
            <Box gap={1}>
              <StatusBadge tone="success" label={`${sessions.length} sessions`} />
              <StatusBadge tone="accent" label={`${providers.length} providers`} />
            </Box>
          ) : (
            <StatusBadge tone="warning" label="no providers connected" />
          )}

          <Text color={tokens.text.muted}>
            Press{" "}
            <Text color={tokens.text.primary} bold>
              {hasProvider ? "/new" : "Enter"}
            </Text>
            {hasProvider ? " to start a fresh logbook session." : " or Ctrl+O to connect an engine."}
          </Text>
        </Box>

        <Box
          flexDirection="column"
          flexGrow={1}
          paddingLeft={isCompact ? 0 : 2}
          marginTop={isCompact ? 1 : 0}
          borderStyle="single"
          borderColor={tokens.panel.border}
          borderLeft={!isCompact}
          borderTop={isCompact}
          borderBottom={false}
          borderRight={false}
        >
          <Text color={tokens.text.accent} bold>
            Operator Notes
          </Text>
          <Text color={tokens.text.muted}>
            {hasProvider
              ? "Ask Lobster to scaffold, debug, or review code in this repo."
              : "Connect a provider first, then ask Lobster to create your first app."}
          </Text>
          <Text color={tokens.text.muted}>
            Try <Text color={tokens.text.primary}>/model</Text>, <Text color={tokens.text.primary}>/agent</Text>, and{" "}
            <Text color={tokens.text.primary}>/sessions</Text> to navigate faster.
          </Text>

          <Box marginTop={1}>
            <Text color={tokens.text.muted}>{rightDivider}</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color={tokens.text.accent} bold>
              Recent activity
            </Text>
            {recentSessions.length === 0 ? (
              <EmptyState title="No recent activity" />
            ) : (
              recentSessions.map((session) => (
                <Text key={session.id} color={tokens.text.primary}>
                  - {truncateTitle(session.title || "Untitled session")}{" "}
                  <Text color={tokens.text.muted}>({formatSessionDate(session.time.updated)})</Text>
                </Text>
              ))
            )}
          </Box>
        </Box>
      </Box>

      <KeyHints items={["tab agent", "Ctrl+M model", "Ctrl+S logbook", "Ctrl+K palette", "Ctrl+O connect"]} />
      <Box marginTop={1}>
        <Prompt onSubmit={handleSubmit} />
      </Box>
    </Box>
  )
}
