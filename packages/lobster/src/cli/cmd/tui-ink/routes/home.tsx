/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useCallback } from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { Logo } from "../component/logo"
import { Prompt } from "../component/prompt"
import { Tips } from "../component/tips"
import { DialogProvider as DialogProviderSetup } from "../component/dialog-provider"
import { Identifier } from "@/id/id"

export function Home() {
  const { theme } = useTheme()
  const route = useRoute()
  const { sync } = useSDK()
  const dialog = useDialog()
  const sessions = useAppStore((s) => s.session)
  const providers = useAppStore((s) => s.provider)

  const hasProvider = providers.length > 0

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
    <Box flexDirection="column" padding={1}>
      <Logo />

      {hasProvider ? (
        <Box marginTop={1} marginBottom={1} paddingLeft={2}>
          <Text color={theme.text}>
            {sessions.length > 0
              ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}`
              : "Start a new session below"}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1} marginBottom={1} paddingLeft={2} gap={1}>
          <Box flexDirection="column">
            <Text color={theme.warning} bold>No providers connected</Text>
            <Text color={theme.textMuted}>
              Press <Text color={theme.text} bold>Enter</Text> or <Text color={theme.text} bold>Ctrl+O</Text> to connect a provider.
            </Text>
          </Box>
          <Box>
            <Text color={theme.textMuted} dimColor>Supported: Anthropic, OpenAI, Google, GitHub Copilot, Groq, and 15+ more</Text>
          </Box>
        </Box>
      )}

      <Tips />

      <Box marginTop={1}>
        <Prompt onSubmit={handleSubmit} />
      </Box>
    </Box>
  )
}
