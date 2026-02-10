import { createMemo, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { useDirectory } from "../../context/directory"
import { useConnected } from "../../component/dialog-model"
import { createStore } from "solid-js/store"
import { useRoute } from "../../context/route"
import { useLobster } from "../../context/lobster"
import { CostTracker } from "../../component/cost-tracker"
import { EmptyBorder } from "@tui/component/border"

export function Footer() {
  const { theme } = useTheme()
  const sync = useSync()
  const route = useRoute()
  const mcp = createMemo(() => Object.values(sync.data.mcp).filter((x) => x.status === "connected").length)
  const mcpError = createMemo(() => Object.values(sync.data.mcp).some((x) => x.status === "failed"))
  const lsp = createMemo(() => Object.keys(sync.data.lsp))
  const permissions = createMemo(() => {
    if (route.data.type !== "session") return []
    return sync.data.permission[route.data.sessionID] ?? []
  })
  const directory = useDirectory()
  const connected = useConnected()
  const lobster = useLobster()
  const sessionCost = createMemo(() => {
    const total = lobster.totalCost()
    if (total <= 0) return null
    return "$" + total.toFixed(2)
  })
  const sessionID = createMemo(() => route.data.type === "session" ? route.data.sessionID : undefined)

  const [store, setStore] = createStore({
    welcome: false,
  })

  onMount(() => {
    // Track all timeouts to ensure proper cleanup
    const timeouts: ReturnType<typeof setTimeout>[] = []

    function tick() {
      if (connected()) return
      if (!store.welcome) {
        setStore("welcome", true)
        timeouts.push(setTimeout(() => tick(), 5000))
        return
      }

      if (store.welcome) {
        setStore("welcome", false)
        timeouts.push(setTimeout(() => tick(), 10_000))
        return
      }
    }
    timeouts.push(setTimeout(() => tick(), 10_000))

    onCleanup(() => {
      timeouts.forEach(clearTimeout)
    })
  })

  return (
    <box flexShrink={0}>
      <box border={["top"]} borderColor={theme.borderSubtle} customBorderChars={{...EmptyBorder, horizontal: "─"}} />
      <box
        flexDirection="row"
        justifyContent="space-between"
        gap={1}
        backgroundColor={theme.backgroundPanel}
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={theme.textMuted} wrapMode="none">{directory()}</text>
        <box gap={2} flexDirection="row" flexShrink={0}>
          <Switch>
            <Match when={store.welcome}>
              <text fg={theme.text}>
                Get started <span style={{ fg: theme.textMuted }}>/connect</span>
              </text>
            </Match>
            <Match when={connected()}>
              <Show when={permissions().length > 0}>
                <text fg={theme.warning} wrapMode="none">
                  ⚠ {permissions().length} permission{permissions().length > 1 ? "s" : ""}
                </text>
              </Show>
              <text fg={theme.textMuted} wrapMode="none">
                <span style={{ fg: theme.success }}>●</span> {lsp().length} LSP
              </text>
              <Show when={mcp()}>
                <text fg={theme.textMuted} wrapMode="none">
                  <span style={{ fg: mcpError() ? theme.error : theme.success }}>●</span> {mcp()} MCP
                </text>
              </Show>
              <Show when={sessionID()}>
                <CostTracker sessionID={sessionID()!} />
              </Show>
              <Show when={!sessionID() && sessionCost()}>
                <text fg={theme.textMuted}>{sessionCost()}</text>
              </Show>
            </Match>
          </Switch>
        </box>
      </box>
    </box>
  )
}
