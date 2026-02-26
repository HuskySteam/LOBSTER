/** @jsxImportSource react */
import { Box, Text, useInput, useStdout } from "ink"
import React, { useCallback, useMemo } from "react"
import { useAppStore } from "../store"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../theme"
import { Logo } from "../component/logo"
import { Prompt } from "../component/prompt"
import { DialogProvider as DialogProviderSetup } from "../component/dialog-provider"
import { Identifier } from "@/id/id"
import { useLobster } from "../context/lobster"
import { Installation } from "@/installation"

function formatRelativeTime(value: number) {
  const diff = Date.now() - value
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function Home() {
  const { theme } = useTheme()
  const { stdout } = useStdout()
  const route = useRoute()
  const { sync } = useSDK()
  const dialog = useDialog()
  const lobster = useLobster()
  const sessions = useAppStore((s) => s.session)
  const providers = useAppStore((s) => s.provider)
  const mcp = useAppStore((s) => s.mcp)

  const hasProvider = providers.length > 0
  const isFirstTimeUser = sessions.length === 0
  const columns = stdout?.columns ?? 80
  const contentWidth = Math.max(44, Math.min(72, columns - 4))

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((left, right) => right.time.updated - left.time.updated)
        .slice(0, 3)
        .map((session) => ({
          id: session.id,
          title: session.title || "Untitled session",
          updated: formatRelativeTime(session.time.updated),
        })),
    [sessions],
  )

  const hasReviewHistory = (lobster.reviewLoop?.history?.length ?? 0) > 0

  const connectedMcpCount = Object.values(mcp).filter((status) => status.status === "connected").length
  const mcpError = Object.values(mcp).some((status) => status.status === "failed")

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
    [route, sync],
  )

  useInput((_input, key) => {
    if (dialog.content !== null) return
    if (!hasProvider && key.return) {
      dialog.replace(<DialogProviderSetup />)
    }
  })

  const promptHint =
    connectedMcpCount > 0 ? (
      <Text color={theme.textMuted}>
        {mcpError ? (
          <>
            <Text color={theme.error}>!</Text> mcp errors <Text color={theme.textMuted}>Ctrl+X S</Text>
          </>
        ) : (
          <>
            <Text color={theme.success}>*</Text>{" "}
            {connectedMcpCount === 1 ? "1 mcp server" : `${connectedMcpCount} mcp servers`}
          </>
        )}
      </Text>
    ) : undefined

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      justifyContent="center"
      alignItems="center"
      paddingLeft={2}
      paddingRight={2}
    >
      <Box width={contentWidth} flexDirection="column" alignItems="center">
        <Logo />
        <Box marginTop={1}>
          <Text color={theme.textMuted}>LOBSTER v{Installation.VERSION}</Text>
        </Box>

        <Box marginTop={2}>
          <Text color={theme.textMuted}>What can I help you with?</Text>
        </Box>

        {!isFirstTimeUser && recentSessions.length > 0 && !hasReviewHistory ? (
          <Box flexDirection="column" marginTop={2} width="100%">
            <Text color={theme.textMuted}>Recent sessions</Text>
            {recentSessions.map((session) => (
              <Text key={session.id} color={theme.textMuted}>
                <Text color={theme.text}>{session.updated}</Text> {session.title}
              </Text>
            ))}
          </Box>
        ) : null}

        {hasReviewHistory ? (
          <Box marginTop={2} width="100%">
            <Text color={theme.textMuted}>Review loop history is available. Run /review to open the dashboard.</Text>
          </Box>
        ) : null}
      </Box>

      <Box width={contentWidth} marginTop={1} flexDirection="column">
        {isFirstTimeUser ? (
          <Box marginBottom={1}>
            <Text color={theme.textMuted}>
              Welcome! Try <Text color={theme.text}>/connect</Text> or <Text color={theme.text}>/help</Text> to get
              started.
            </Text>
          </Box>
        ) : null}
        <Prompt onSubmit={handleSubmit} hint={promptHint} />
      </Box>
    </Box>
  )
}
