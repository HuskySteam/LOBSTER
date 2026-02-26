/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import React, { useState, useMemo, useCallback, useEffect } from "react"
import open from "open"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogModel } from "./dialog-model"
import { Link } from "../ui/link"
import { useToast } from "../ui/toast"
import { Clipboard } from "@tui/util/clipboard"
import type { ProviderAuthAuthorization } from "@lobster-ai/sdk/v2"

const PROVIDER_PRIORITY: Record<string, number> = {
  anthropic: 1,
  "github-copilot": 2,
  openai: 3,
  google: 4,
  openrouter: 5,
}

async function refreshAfterAuth(sync: {
  client: { instance: { dispose: () => Promise<unknown> } }
  bootstrap: () => Promise<unknown>
}) {
  await sync.client.instance.dispose()
  await sync.bootstrap()
}

export function DialogProvider() {
  const { theme } = useTheme()
  const { sync } = useSDK()
  const dialog = useDialog()
  const providerNext = useAppStore((s) => s.provider_next)
  const providerAuth = useAppStore((s) => s.provider_auth)

  const connected = useMemo(() => new Set(providerNext.connected), [providerNext.connected])

  const options = useMemo<DialogSelectOption<string>[]>(() => {
    const sorted = [...providerNext.all].sort(
      (a, b) => (PROVIDER_PRIORITY[a.id] ?? 99) - (PROVIDER_PRIORITY[b.id] ?? 99),
    )
    return sorted.map((provider) => {
      const isConnected = connected.has(provider.id)
      return {
        title: provider.name,
        value: provider.id,
        description: (
          {
            anthropic: "(Claude Max or API key)",
            openai: "(ChatGPT Plus/Pro or API key)",
          } as Record<string, string>
        )[provider.id],
        category: provider.id in PROVIDER_PRIORITY ? "Popular" : "Other",
        footer: isConnected ? "Connected" : undefined,
      }
    })
  }, [providerNext.all, connected])

  const handleSelect = useCallback(
    async (option: DialogSelectOption<string>) => {
      const providerID = option.value
      const methods = providerAuth[providerID] ?? [{ type: "api" as const, label: "API key" }]

      if (methods.length > 1) {
        dialog.replace(
          <DialogSelect
            title="Select auth method"
            options={methods.map((m, i) => ({ title: m.label, value: i }))}
            onSelect={async (methodOpt) => {
              await startAuth(providerID, methods[methodOpt.value], methodOpt.value)
            }}
          />,
        )
        return
      }
      await startAuth(providerID, methods[0], 0)
    },
    [providerAuth, dialog, sync],
  )

  const startAuth = useCallback(
    async (providerID: string, method: { type: string; label: string }, index: number) => {
      if (method.type === "oauth") {
        const result = await sync.client.provider.oauth.authorize({
          providerID,
          method: index,
        })
        if (result.data?.method === "auto") {
          dialog.replace(
            <AutoMethod providerID={providerID} title={method.label} index={index} authorization={result.data} />,
          )
        }
        if (result.data?.method === "code") {
          dialog.replace(
            <CodeMethod providerID={providerID} title={method.label} index={index} authorization={result.data} />,
          )
        }
        return
      }
      dialog.replace(<ApiMethod providerID={providerID} title={method.label} />)
    },
    [sync, dialog],
  )

  return (
    <DialogSelect
      title="Connect a provider"
      placeholder="Search providers..."
      options={options}
      onSelect={handleSelect}
    />
  )
}

function AutoMethod(props: {
  providerID: string
  title: string
  index: number
  authorization: ProviderAuthAuthorization
}) {
  const { theme } = useTheme()
  const { sync } = useSDK()
  const dialog = useDialog()
  const toast = useToast()

  const openAuthURL = useCallback(async () => {
    await open(props.authorization.url).catch(() => {
      toast.show({ message: "Unable to open browser. Use the link below or press c to copy URL.", variant: "warning" })
    })
  }, [props.authorization.url, toast])

  useEffect(() => {
    let cancelled = false
    void openAuthURL()
    ;(async () => {
      const result = await sync.client.provider.oauth.callback({
        providerID: props.providerID,
        method: props.index,
      })
      if (cancelled) return
      if (result.error) {
        dialog.clear()
        return
      }
      await refreshAfterAuth(sync)
      dialog.replace(<DialogModel />)
    })()
    return () => {
      cancelled = true
    }
  }, [openAuthURL, props.providerID, props.index, sync, dialog])

  useInput((ch, key) => {
    if (key.escape) dialog.clear()
    if (!key.ctrl && !key.meta && ch.toLowerCase() === "o") {
      void openAuthURL()
      return
    }
    if (!key.ctrl && !key.meta && ch.toLowerCase() === "c") {
      void Clipboard.copy(props.authorization.url)
        .then(() => toast.show({ message: "Authorization URL copied to clipboard", variant: "info" }))
        .catch(() => toast.show({ message: "Failed to copy URL", variant: "error" }))
    }
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>
          {props.title}
        </Text>
        <Text color={theme.textMuted}>esc cancel</Text>
      </Box>
      <Box marginTop={1} flexDirection="column" gap={1}>
        <Link href={props.authorization.url}>Open authorization URL</Link>
        <Text color={theme.textMuted}>{props.authorization.instructions}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.accent}>Waiting for authorization...</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.textMuted}>
          <Text color={theme.text}>o</Text> open browser {" | "}
          <Text color={theme.text}>c</Text> copy URL {" | "}
          <Text color={theme.text}>esc</Text> cancel
        </Text>
      </Box>
    </Box>
  )
}

function CodeMethod(props: {
  providerID: string
  title: string
  index: number
  authorization: ProviderAuthAuthorization
}) {
  const { theme } = useTheme()
  const { sync } = useSDK()
  const dialog = useDialog()
  const toast = useToast()
  const [error, setError] = useState(false)

  const openAuthURL = useCallback(async () => {
    await open(props.authorization.url).catch(() => {
      toast.show({ message: "Unable to open browser. Use the link below.", variant: "warning" })
    })
  }, [props.authorization.url, toast])

  useEffect(() => {
    void openAuthURL()
  }, [openAuthURL])

  return (
    <DialogPrompt
      title={props.title}
      placeholder="Authorization code"
      description={
        <Box flexDirection="column" gap={1}>
          <Text color={theme.textMuted}>{props.authorization.instructions}</Text>
          <Link href={props.authorization.url}>Open authorization URL</Link>
          {error && <Text color={theme.error}>Invalid code</Text>}
        </Box>
      }
      onConfirm={async (value) => {
        const result = await sync.client.provider.oauth.callback({
          providerID: props.providerID,
          method: props.index,
          code: value,
        })
        if (result.error) {
          setError(true)
          return
        }
        await refreshAfterAuth(sync)
        dialog.replace(<DialogModel />)
      }}
    />
  )
}

function ApiMethod(props: { providerID: string; title: string }) {
  const { sync } = useSDK()
  const dialog = useDialog()

  return (
    <DialogPrompt
      title={props.title}
      placeholder="API key"
      onConfirm={async (value) => {
        if (!value) return
        await sync.client.auth.set({
          providerID: props.providerID,
          auth: { type: "api", key: value },
        })
        await refreshAfterAuth(sync)
        dialog.replace(<DialogModel />)
      }}
    />
  )
}
