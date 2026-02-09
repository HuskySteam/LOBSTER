import { useSync } from "@tui/context/sync"
import { createMemo, For, Show, Switch, Match } from "solid-js"
import { createStore } from "solid-js/store"
import { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { Installation } from "@/installation"
import { useDirectory } from "../../context/directory"
import { useKV } from "../../context/kv"
import { TodoItem } from "../../component/todo-item"
import { useLocal } from "../../context/local"
import { useLobster } from "../../context/lobster"
import { useSessionCost } from "../../hooks/use-session-cost"
import { useContextTokens } from "../../hooks/use-context-tokens"
import { TeamStatus } from "../../component/team-status"
import { TeamTasks } from "../../component/team-tasks"

export function Sidebar(props: { sessionID: string; overlay?: boolean }) {
  const sync = useSync()
  const { theme } = useTheme()
  const session = createMemo(() => sync.session.get(props.sessionID)!)
  const diff = createMemo(() => sync.data.session_diff[props.sessionID] ?? [])
  const todo = createMemo(() => sync.data.todo[props.sessionID] ?? [])
  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])

  const local = useLocal()
  const lobster = useLobster()
  const agents = createMemo(() => sync.data.agent.filter((x) => !x.hidden))
  const teamNames = createMemo(() => Object.keys(sync.data.teams))

  const [expanded, setExpanded] = createStore({
    mcp: true,
    diff: true,
    todo: true,
    lsp: true,
    reviewLoop: true,
    costTracker: true,
    agentStatus: true,
    teams: true,
  })

  // Sort MCP servers alphabetically for consistent display order
  const mcpEntries = createMemo(() => Object.entries(sync.data.mcp).sort(([a], [b]) => a.localeCompare(b)))

  // Count connected and error MCP servers for collapsed header display
  const connectedMcpCount = createMemo(() => mcpEntries().filter(([_, item]) => item.status === "connected").length)
  const errorMcpCount = createMemo(
    () =>
      mcpEntries().filter(
        ([_, item]) =>
          item.status === "failed" || item.status === "needs_auth" || item.status === "needs_client_registration",
      ).length,
  )

  const cost = useSessionCost(messages)

  const context = useContextTokens(messages, () => sync.data.provider)

  const directory = useDirectory()
  const kv = useKV()

  const hasProviders = createMemo(() =>
    sync.data.provider.some((x) => Object.values(x.models).some((y) => y.cost?.input !== 0)),
  )
  const gettingStartedDismissed = createMemo(() => kv.get("dismissed_getting_started", false))

  const mcpStatusColor = (status: string): RGBA => {
    if (status === "connected") return theme.success
    if (status === "failed") return theme.error
    if (status === "disabled") return theme.textMuted
    if (status === "needs_auth") return theme.warning
    if (status === "needs_client_registration") return theme.error
    return theme.textMuted
  }

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={42}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        position={props.overlay ? "absolute" : "relative"}
      >
        <scrollbox flexGrow={1}>
          <box flexShrink={0} gap={1} paddingRight={1}>
            <box paddingRight={1}>
              <text fg={theme.text}>
                <b>{session().title}</b>
              </text>
              <Show when={session().share?.url}>
                <text fg={theme.textMuted}>{session().share!.url}</text>
              </Show>
            </box>
            <box>
              <text fg={theme.text}>
                <b>Context</b>
              </text>
              <text fg={theme.textMuted}>{context()?.tokens ?? 0} tokens</text>
              <text fg={theme.textMuted}>{context()?.percentage ?? 0}% used</text>
              <text fg={theme.textMuted}>{cost()} spent</text>
            </box>
            <Show when={lobster.reviewLoop()?.phase}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => setExpanded("reviewLoop", !expanded.reviewLoop)}
                >
                  <text fg={theme.text}>{expanded.reviewLoop ? "▼" : "▶"}</text>
                  <text fg={theme.text}>
                    <b>Review Loop</b>
                  </text>
                </box>
                <Show when={expanded.reviewLoop}>
                  <box flexDirection="row" gap={1}>
                    <text
                      style={{
                        fg:
                          lobster.reviewLoop()?.phase === "coding"
                            ? theme.success
                            : theme.textMuted,
                      }}
                    >
                      [Coder]
                    </text>
                    <text fg={theme.textMuted}>→</text>
                    <text
                      style={{
                        fg:
                          lobster.reviewLoop()?.phase === "reviewing"
                            ? theme.warning
                            : theme.textMuted,
                      }}
                    >
                      [Review]
                    </text>
                    <text fg={theme.textMuted}>→</text>
                    <text
                      style={{
                        fg:
                          lobster.reviewLoop()?.phase === "testing"
                            ? theme.info
                            : theme.textMuted,
                      }}
                    >
                      [Test]
                    </text>
                  </box>
                  <text fg={theme.textMuted}>
                    Iteration {lobster.reviewLoop()?.iteration ?? 0}/{lobster.reviewLoop()?.max_iterations ?? "?"}
                  </text>
                  <Show when={lobster.reviewLoop()?.history}>
                    <For each={lobster.reviewLoop()?.history ?? []}>
                      {(entry) => (
                        <text
                          style={{
                            fg: entry.verdict === "PASS" ? theme.success : theme.warning,
                          }}
                        >
                          #{entry.iteration}: {entry.verdict}
                        </text>
                      )}
                    </For>
                  </Show>
                </Show>
              </box>
            </Show>
            <box>
              <box
                flexDirection="row"
                gap={1}
                onMouseDown={() => setExpanded("costTracker", !expanded.costTracker)}
              >
                <text fg={theme.text}>{expanded.costTracker ? "▼" : "▶"}</text>
                <text fg={theme.text}>
                  <b>Cost</b>
                </text>
              </box>
              <Show when={expanded.costTracker}>
                <text fg={theme.textMuted}>Session: {cost()}</text>
                <Show when={lobster.budget()?.budget_usd}>
                  {(() => {
                    const budgetUsd = () => lobster.budget()?.budget_usd ?? 0
                    const totalCost = () => lobster.totalCost()
                    const pct = () => budgetUsd() > 0 ? Math.min(Math.round((totalCost() / budgetUsd()) * 100), 100) : 0
                    const barWidth = 30
                    const filled = () => Math.round((pct() / 100) * barWidth)
                    const barColor = () => pct() > 90 ? theme.error : pct() > 70 ? theme.warning : theme.success
                    return (
                      <>
                        <text>
                          <span style={{ fg: barColor() }}>
                            {"█".repeat(filled())}
                          </span>
                          <span style={{ fg: theme.textMuted }}>
                            {"░".repeat(barWidth - filled())}
                          </span>
                          <span style={{ fg: theme.textMuted }}> {pct()}%</span>
                        </text>
                        <text fg={theme.textMuted}>
                          ${totalCost().toFixed(2)} / ${budgetUsd().toFixed(2)} budget
                        </text>
                      </>
                    )
                  })()}
                </Show>
              </Show>
            </box>
            <Show when={agents().length > 0}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => setExpanded("agentStatus", !expanded.agentStatus)}
                >
                  <text fg={theme.text}>{expanded.agentStatus ? "▼" : "▶"}</text>
                  <text fg={theme.text}>
                    <b>Agents</b>
                  </text>
                </box>
                <Show when={expanded.agentStatus}>
                  <For each={agents()}>
                    {(agent) => (
                      <box flexDirection="row" gap={1}>
                        <text
                          flexShrink={0}
                          style={{ fg: local.agent.color(agent.name) }}
                        >
                          {agent.name === local.agent.current().name ? "▶" : "●"}
                        </text>
                        <text fg={theme.text} wrapMode="none">
                          {agent.name}
                        </text>
                        <text fg={theme.textMuted}>
                          {agent.name === local.agent.current().name ? "active" : ""}
                        </text>
                      </box>
                    )}
                  </For>
                </Show>
              </box>
            </Show>
            <Show when={teamNames().length > 0}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => setExpanded("teams", !expanded.teams)}
                >
                  <text fg={theme.text}>{expanded.teams ? "\u25BC" : "\u25B6"}</text>
                  <text fg={theme.text}>
                    <b>Teams</b>
                    <Show when={!expanded.teams}>
                      <span style={{ fg: theme.textMuted }}>
                        {" "}({teamNames().length})
                      </span>
                    </Show>
                  </text>
                </box>
                <Show when={expanded.teams}>
                  <For each={teamNames()}>
                    {(name) => (
                      <box paddingLeft={1} gap={1}>
                        <TeamStatus teamName={name} />
                        <TeamTasks teamName={name} />
                      </box>
                    )}
                  </For>
                </Show>
              </box>
            </Show>
            <Show when={mcpEntries().length > 0}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => mcpEntries().length > 2 && setExpanded("mcp", !expanded.mcp)}
                >
                  <Show when={mcpEntries().length > 2}>
                    <text fg={theme.text}>{expanded.mcp ? "▼" : "▶"}</text>
                  </Show>
                  <text fg={theme.text}>
                    <b>MCP</b>
                    <Show when={!expanded.mcp}>
                      <span style={{ fg: theme.textMuted }}>
                        {" "}
                        ({connectedMcpCount()} active
                        {errorMcpCount() > 0 ? `, ${errorMcpCount()} error${errorMcpCount() > 1 ? "s" : ""}` : ""})
                      </span>
                    </Show>
                  </text>
                </box>
                <Show when={mcpEntries().length <= 2 || expanded.mcp}>
                  <For each={mcpEntries()}>
                    {([key, item]) => (
                      <box flexDirection="row" gap={1}>
                        <text
                          flexShrink={0}
                          style={{
                            fg: mcpStatusColor(item.status),
                          }}
                        >
                          •
                        </text>
                        <text fg={theme.text} wrapMode="word">
                          {key}{" "}
                          <span style={{ fg: theme.textMuted }}>
                            <Switch fallback={item.status}>
                              <Match when={item.status === "connected"}>Connected</Match>
                              <Match when={item.status === "failed" && item}>{(val) => <i>{val().error}</i>}</Match>
                              <Match when={item.status === "disabled"}>Disabled</Match>
                              <Match when={(item.status as string) === "needs_auth"}>Needs auth</Match>
                              <Match when={(item.status as string) === "needs_client_registration"}>
                                Needs client ID
                              </Match>
                            </Switch>
                          </span>
                        </text>
                      </box>
                    )}
                  </For>
                </Show>
              </box>
            </Show>
            <box>
              <box
                flexDirection="row"
                gap={1}
                onMouseDown={() => sync.data.lsp.length > 2 && setExpanded("lsp", !expanded.lsp)}
              >
                <Show when={sync.data.lsp.length > 2}>
                  <text fg={theme.text}>{expanded.lsp ? "▼" : "▶"}</text>
                </Show>
                <text fg={theme.text}>
                  <b>LSP</b>
                </text>
              </box>
              <Show when={sync.data.lsp.length <= 2 || expanded.lsp}>
                <Show when={sync.data.lsp.length === 0}>
                  <text fg={theme.textMuted}>
                    {sync.data.config.lsp === false
                      ? "LSPs have been disabled in settings"
                      : "LSPs will activate as files are read"}
                  </text>
                </Show>
                <For each={sync.data.lsp}>
                  {(item) => (
                    <box flexDirection="row" gap={1}>
                      <text
                        flexShrink={0}
                        style={{
                          fg: {
                            connected: theme.success,
                            error: theme.error,
                          }[item.status],
                        }}
                      >
                        •
                      </text>
                      <text fg={theme.textMuted}>
                        {item.id} {item.root}
                      </text>
                    </box>
                  )}
                </For>
              </Show>
            </box>
            <Show when={todo().length > 0 && todo().some((t) => t.status !== "completed")}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => todo().length > 2 && setExpanded("todo", !expanded.todo)}
                >
                  <Show when={todo().length > 2}>
                    <text fg={theme.text}>{expanded.todo ? "▼" : "▶"}</text>
                  </Show>
                  <text fg={theme.text}>
                    <b>Todo</b>
                  </text>
                </box>
                <Show when={todo().length <= 2 || expanded.todo}>
                  <For each={todo()}>{(todo) => <TodoItem status={todo.status} content={todo.content} />}</For>
                </Show>
              </box>
            </Show>
            <Show when={diff().length > 0}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => diff().length > 2 && setExpanded("diff", !expanded.diff)}
                >
                  <Show when={diff().length > 2}>
                    <text fg={theme.text}>{expanded.diff ? "▼" : "▶"}</text>
                  </Show>
                  <text fg={theme.text}>
                    <b>Modified Files</b>
                  </text>
                </box>
                <Show when={diff().length <= 2 || expanded.diff}>
                  <For each={diff() || []}>
                    {(item) => {
                      return (
                        <box flexDirection="row" gap={1} justifyContent="space-between">
                          <text fg={theme.textMuted} wrapMode="none">
                            {item.file}
                          </text>
                          <box flexDirection="row" gap={1} flexShrink={0}>
                            <Show when={item.additions}>
                              <text fg={theme.diffAdded}>+{item.additions}</text>
                            </Show>
                            <Show when={item.deletions}>
                              <text fg={theme.diffRemoved}>-{item.deletions}</text>
                            </Show>
                          </box>
                        </box>
                      )
                    }}
                  </For>
                </Show>
              </box>
            </Show>
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <Show when={!hasProviders() && !gettingStartedDismissed()}>
            <box
              backgroundColor={theme.backgroundElement}
              paddingTop={1}
              paddingBottom={1}
              paddingLeft={2}
              paddingRight={2}
              flexDirection="row"
              gap={1}
            >
              <text flexShrink={0} fg={theme.text}>
                ⬖
              </text>
              <box flexGrow={1} gap={1}>
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={theme.text}>
                    <b>Getting started</b>
                  </text>
                  <text fg={theme.textMuted} onMouseDown={() => kv.set("dismissed_getting_started", true)}>
                    ✕
                  </text>
                </box>
                <text fg={theme.textMuted}>LOBSTER includes free models so you can start immediately.</text>
                <text fg={theme.textMuted}>
                  Connect from 75+ providers to use other models, including Claude, GPT, Gemini etc
                </text>
                <box flexDirection="row" gap={1} justifyContent="space-between">
                  <text fg={theme.text}>Connect provider</text>
                  <text fg={theme.textMuted}>/connect</text>
                </box>
              </box>
            </box>
          </Show>
          <text>
            <span style={{ fg: theme.textMuted }}>{directory().split("/").slice(0, -1).join("/")}/</span>
            <span style={{ fg: theme.text }}>{directory().split("/").at(-1)}</span>
          </text>
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.error }}>•</span> <b>LOB</b>
            <span style={{ fg: theme.text }}>
              <b>STER</b>
            </span>{" "}
            <span>{Installation.VERSION}</span>
          </text>
        </box>
      </box>
    </Show>
  )
}
