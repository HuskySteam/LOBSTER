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

function getTerminalBackgroundColor(): "dark" | "light" {
  // Use COLORFGBG env var if available (set by many terminals)
  const colorfgbg = process.env.COLORFGBG
  if (colorfgbg) {
    const parts = colorfgbg.split(";")
    const bg = parseInt(parts[parts.length - 1])
    if (!isNaN(bg) && bg < 8) return "dark"
    if (!isNaN(bg) && bg >= 8) return "light"
  }
  // Default to dark mode
  return "dark"
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
  const mode = getTerminalBackgroundColor()

  const onExit = async () => {
    await input.onExit?.()
  }

  const app = render(
    React.createElement(
      ErrorBoundary,
      { onExit, mode },
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
      </ArgsProvider>,
    ),
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

// React error boundary — uses React.createElement to bypass SolidJS JSX transform
// which would call class components as functions (without `new`)
class ErrorBoundary extends React.Component<
  { children?: ReactNode; onExit: () => Promise<void>; mode?: "dark" | "light" },
  { error: Error | null }
> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    if (this.state.error) {
      const isLight = this.props.mode === "light"
      const e = React.createElement
      return e(Box, { flexDirection: "column", padding: 1 },
        e(Text, { color: isLight ? "#3b7dd8" : "#fab283", bold: true }, "A fatal error occurred!"),
        e(Text, { color: isLight ? "#8a8a8a" : "#808080" }, this.state.error.message),
        e(Box, { marginTop: 1 },
          e(Text, { color: isLight ? "#8a8a8a" : "#808080" }, this.state.error.stack?.slice(0, 500)),
        ),
        e(Box, { marginTop: 1 },
          e(Text, { color: isLight ? "#1a1a1a" : "#eeeeee" }, "Please report an issue at https://github.com/HuskySteam/LOBSTER/issues"),
        ),
      )
    }
    return this.props.children
  }
}
