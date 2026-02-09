import { Prompt, type PromptRef } from "@tui/component/prompt"
import { createMemo, For, Match, onMount, Show, Switch } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useKeybind } from "@tui/context/keybind"
import { Logo } from "../component/logo"
import { Tips } from "../component/tips"
import { Locale } from "@/util/locale"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useDirectory } from "../context/directory"
import { useRouteData } from "@tui/context/route"
import { usePromptRef } from "../context/prompt"
import { Installation } from "@/installation"
import { useKV } from "../context/kv"
import { useCommandDialog } from "../component/dialog-command"
import { useLocal } from "../context/local"
import { useLobster } from "../context/lobster"
import { HealthDashboard } from "../component/health-dashboard"

// Intentionally module-level: guards against re-submitting the initial prompt
// across component re-mounts within the same process lifetime.
let once = false

export function Home() {
  const sync = useSync()
  const kv = useKV()
  const { theme } = useTheme()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const command = useCommandDialog()
  const local = useLocal()
  const lobster = useLobster()
  const hasReviewHistory = createMemo(() => {
    const rl = lobster.reviewLoop()
    return rl?.history && rl.history.length > 0
  })
  const agents = createMemo(() => sync.data.agent.filter((x) => !x.hidden))
  const mcp = createMemo(() => Object.keys(sync.data.mcp).length > 0)
  const mcpError = createMemo(() => {
    return Object.values(sync.data.mcp).some((x) => x.status === "failed")
  })

  const connectedMcpCount = createMemo(() => {
    return Object.values(sync.data.mcp).filter((x) => x.status === "connected").length
  })

  const isFirstTimeUser = createMemo(() => sync.data.session.length === 0)
  const tipsHidden = createMemo(() => kv.get("tips_hidden", false))
  const showTips = createMemo(() => {
    // Don't show tips for first-time users
    if (isFirstTimeUser()) return false
    return !tipsHidden()
  })

  command.register(() => [
    {
      title: tipsHidden() ? "Show tips" : "Hide tips",
      value: "tips.toggle",
      keybind: "tips_toggle",
      category: "System",
      onSelect: (dialog) => {
        kv.set("tips_hidden", !tipsHidden())
        dialog.clear()
      },
    },
  ])

  const Hint = (
    <Show when={connectedMcpCount() > 0}>
      <box flexShrink={0} flexDirection="row" gap={1}>
        <text fg={theme.text}>
          <Switch>
            <Match when={mcpError()}>
              <span style={{ fg: theme.error }}>•</span> mcp errors{" "}
              <span style={{ fg: theme.textMuted }}>ctrl+x s</span>
            </Match>
            <Match when={true}>
              <span style={{ fg: theme.success }}>•</span>{" "}
              {Locale.pluralize(connectedMcpCount(), "{} mcp server", "{} mcp servers")}
            </Match>
          </Switch>
        </text>
      </box>
    </Show>
  )

  let prompt: PromptRef
  const args = useArgs()
  onMount(() => {
    if (once) return
    if (route.initialPrompt) {
      prompt.set(route.initialPrompt)
      once = true
    } else if (args.prompt) {
      prompt.set({ input: args.prompt, parts: [] })
      once = true
      prompt.submit()
    }
  })
  const directory = useDirectory()

  const keybind = useKeybind()

  const recentSessions = createMemo(() => {
    const now = Date.now()
    return sync.data.session
      .slice()
      .sort((a, b) => b.time.updated - a.time.updated)
      .slice(0, 5)
      .map((s) => {
        const diff = now - s.time.updated
        const seconds = Math.floor(diff / 1000)
        const minutes = Math.floor(seconds / 60)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)
        let time: string
        if (seconds < 60) time = "just now"
        else if (minutes < 60) time = `${minutes}m ago`
        else if (hours < 24) time = `${hours}h ago`
        else time = `${days}d ago`
        return {
          time,
          title: s.title || "Untitled session",
        }
      })
  })

  return (
    <>
      <box flexGrow={1} justifyContent="center" alignItems="center" paddingLeft={2} paddingRight={2}>
        <box
          border={["top", "bottom", "left", "right"]}
          borderColor={theme.border}
          title={` LOBSTER v${Installation.VERSION} `}
          titleAlignment="center"
          width="100%"
          maxWidth={80}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <box alignItems="center">
            <Logo />
          </box>
          <box flexDirection="row" gap={4} marginTop={1}>
            <box flexGrow={1} flexBasis={0}>
              <text fg={theme.text}><b>Welcome back!</b></text>
              <text fg={theme.textMuted} marginTop={1}>
                {local.model.parsed().model} · {local.model.parsed().provider}
              </text>
              <text fg={theme.textMuted}>{directory()}</text>
            </box>
            <box flexGrow={1} flexBasis={0}>
              <Show when={hasReviewHistory()} fallback={
                <>
                  <text fg={theme.accent}><b>Tips for getting started</b></text>
                  <box marginTop={1} gap={1}>
                    <text fg={theme.textMuted}>Ask LOBSTER to create a new app</text>
                    <text fg={theme.textMuted}>Use /connect to add a provider</text>
                    <text fg={theme.textMuted}>Try /help for all commands</text>
                  </box>
                  <Show when={recentSessions().length > 0}>
                    <text fg={theme.accent} marginTop={1}><b>Recent activity</b></text>
                    <For each={recentSessions()}>
                      {(s) => (
                        <text fg={theme.textMuted}>
                          <span style={{ fg: theme.text }}>{s.time}</span>  {s.title}
                        </text>
                      )}
                    </For>
                  </Show>
                </>
              }>
                <HealthDashboard />
              </Show>
            </box>
          </box>
        </box>
        <box width="100%" maxWidth={80} paddingTop={1} zIndex={1000}>
          <Show when={isFirstTimeUser()}>
            <text fg={theme.textMuted} paddingBottom={1}>
              Welcome! Connect a provider to get started. Try <span style={{ fg: theme.text }}>/connect</span> or <span style={{ fg: theme.text }}>/help</span>
            </text>
          </Show>
          <Prompt
            ref={(r) => {
              prompt = r
              promptRef.set(r)
            }}
            hint={Hint}
          />
        </box>
      </box>
      <Toast />
    </>
  )
}
