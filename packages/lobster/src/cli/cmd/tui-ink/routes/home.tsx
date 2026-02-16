/** @jsxImportSource react */
import { Box, Text } from "ink"
import React, { useCallback } from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { Logo } from "../component/logo"
import { Prompt } from "../component/prompt"
import { Identifier } from "@/id/id"

export function Home() {
  const { theme } = useTheme()
  const route = useRoute()
  const { sync } = useSDK()
  const sessions = useAppStore((s) => s.session)
  const providers = useAppStore((s) => s.provider)

  const hasProvider = providers.length > 0

  const handleSubmit = useCallback(
    async (text: string, options: { agent: string; model: { providerID: string; modelID: string } }) => {
      // Create a new session
      const result = await sync.client.session.create({})
      if (!result.data?.id) return
      const sessionID = result.data.id

      // Navigate to session
      route.navigate({ type: "session", sessionID })

      // Send the prompt
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

  return (
    <Box flexDirection="column" padding={1}>
      <Logo />

      <Box marginTop={1} marginBottom={1} paddingLeft={2}>
        {hasProvider ? (
          <Text color={theme.text}>
            {sessions.length > 0
              ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}`
              : "Start a new session below"}
          </Text>
        ) : (
          <Text color={theme.warning}>
            No providers connected. Configure a provider in lobster.jsonc
          </Text>
        )}
      </Box>

      {hasProvider && <Prompt onSubmit={handleSubmit} />}
    </Box>
  )
}
