/** @jsxImportSource react */
import { render, type Instance } from "ink"
import React, { useState, useEffect, useCallback, useMemo, type ReactNode } from "react"
import { Box, Text } from "ink"
import { ArgsProvider, useArgs, type Args } from "./context/args"
import { ExitProvider, useExit } from "./context/exit"
import { RouteProvider, useRoute } from "./context/route"
import { SDKProvider, useSDK } from "./context/sdk"
import { ThemeProvider, useTheme } from "./theme"
import { useAppStore } from "./store"
import { ToastProvider } from "./ui/toast"
import { DialogProvider } from "./ui/dialog"
import { LocalProvider } from "./context/local"
import { KeybindProvider } from "./context/keybind"
import { Home } from "./routes/home"
import { Session } from "./routes/session"
import type { EventSource } from "./sync"

async function getTerminalBackgroundColor(): Promise<"dark" | "light"> {
  if (!process.stdin.isTTY) return "dark"

  return new Promise((resolve) => {
    let timeout: NodeJS.Timeout

    const cleanup = () => {
      process.stdin.setRawMode(false)
      process.stdin.removeListener("data", handler)
      clearTimeout(timeout)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      const match = str.match(/\x1b]11;([^\x07\x1b]+)/)
      if (match) {
        cleanup()
        const color = match[1]
        let r = 0, g = 0, b = 0

        if (color.startsWith("rgb:")) {
          const parts = color.substring(4).split("/")
          r = parseInt(parts[0], 16) >> 8
          g = parseInt(parts[1], 16) >> 8
          b = parseInt(parts[2], 16) >> 8
        } else if (color.startsWith("#")) {
          r = parseInt(color.substring(1, 3), 16)
          g = parseInt(color.substring(3, 5), 16)
          b = parseInt(color.substring(5, 7), 16)
        } else if (color.startsWith("rgb(")) {
          const parts = color.substring(4, color.length - 1).split(",")
          r = parseInt(parts[0])
          g = parseInt(parts[1])
          b = parseInt(parts[2])
        }

        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        resolve(luminance > 0.5 ? "light" : "dark")
      }
    }

    process.stdin.setRawMode(true)
    process.stdin.on("data", handler)
    process.stdout.write("\x1b]11;?\x07")

    timeout = setTimeout(() => {
      cleanup()
      resolve("dark")
    }, 1000)
  })
}

export async function tui(input: {
  url: string
  args: Args
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
  onExit?: () => Promise<void>
}) {
  const mode = await getTerminalBackgroundColor()

  const onExit = async () => {
    await input.onExit?.()
  }

  const app = render(
    <ErrorBoundary onExit={onExit} mode={mode}>
      <ArgsProvider {...input.args}>
        <ExitProvider onExit={onExit}>
          <RouteProvider>
            <SDKProvider
              url={input.url}
              directory={input.directory}
              fetch={input.fetch}
              headers={input.headers}
              events={input.events}
            >
              <ThemeProvider mode={mode}>
                <LocalProvider>
                  <KeybindProvider>
                    <ToastProvider>
                      <DialogProvider>
                        <App />
                      </DialogProvider>
                    </ToastProvider>
                  </KeybindProvider>
                </LocalProvider>
              </ThemeProvider>
            </SDKProvider>
          </RouteProvider>
        </ExitProvider>
      </ArgsProvider>
    </ErrorBoundary>,
  )

  await app.waitUntilExit()
}

function App() {
  const route = useRoute()
  const { theme } = useTheme()
  const status = useAppStore((s) => s.status)

  if (status === "loading") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.primary}>LOBSTER</Text>
        <Text color={theme.textMuted}>Loading...</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {route.data.type === "home" && <Home />}
      {route.data.type === "session" && <Session sessionID={route.data.sessionID} />}
    </Box>
  )
}

// React error boundary
class ErrorBoundary extends React.Component<
  { children: ReactNode; onExit: () => Promise<void>; mode?: "dark" | "light" },
  { error: Error | null }
> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    if (this.state.error) {
      const isLight = this.props.mode === "light"
      return (
        <Box flexDirection="column" padding={1}>
          <Text color={isLight ? "#3b7dd8" : "#fab283"} bold>
            A fatal error occurred!
          </Text>
          <Text color={isLight ? "#8a8a8a" : "#808080"}>
            {this.state.error.message}
          </Text>
          <Box marginTop={1}>
            <Text color={isLight ? "#8a8a8a" : "#808080"}>
              {this.state.error.stack?.slice(0, 500)}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={isLight ? "#1a1a1a" : "#eeeeee"}>
              Please report an issue at https://github.com/HuskySteam/LOBSTER/issues
            </Text>
          </Box>
        </Box>
      )
    }
    return this.props.children
  }
}
