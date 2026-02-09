import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { Show, createMemo } from "solid-js"
import { pipe, sumBy } from "remeda"
import type { Message } from "@lobster-ai/sdk/v2"

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return String(n)
}

export function CostTracker(props: { sessionID: string }) {
  const sync = useSync()
  const { theme } = useTheme()

  const messages = createMemo(() => (sync.data.message[props.sessionID] ?? []) as Message[])

  const totalCost = createMemo(() => {
    return pipe(
      messages(),
      sumBy((x) => (x.role === "assistant" ? x.cost : 0)),
    )
  })

  const tokenStats = createMemo(() => {
    const msgs = messages()
    let input = 0
    let output = 0
    for (const msg of msgs) {
      if (msg.role === "assistant") {
        input += msg.tokens.input
        output += msg.tokens.output
      }
    }
    return { input, output }
  })

  const hasCost = createMemo(() => totalCost() > 0 || tokenStats().input > 0 || tokenStats().output > 0)

  return (
    <Show when={hasCost()}>
      <text fg={theme.textMuted}>
        Cost: ${totalCost().toFixed(2)} | Tokens: {formatTokens(tokenStats().input)} in / {formatTokens(tokenStats().output)} out
      </text>
    </Show>
  )
}
