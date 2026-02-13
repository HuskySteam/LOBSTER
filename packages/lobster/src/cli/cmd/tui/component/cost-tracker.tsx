import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { Show, createMemo } from "solid-js"
import { SessionCost } from "@/session/cost"

export function CostTracker(props: { sessionID: string }) {
  const sync = useSync()
  const { theme } = useTheme()

  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])
  const providers = createMemo(() => sync.data.provider)

  const totalCost = createMemo(() => {
    let cost = 0
    for (const msg of messages()) {
      if (msg.role === "assistant") cost += msg.cost
    }
    return cost
  })

  const tokenStats = createMemo(() => {
    const msgs = messages()
    let input = 0
    let output = 0
    let reasoning = 0
    let cacheRead = 0
    let cacheWrite = 0
    for (const msg of msgs) {
      if (msg.role === "assistant") {
        input += msg.tokens.input
        output += msg.tokens.output
        reasoning += msg.tokens.reasoning
        cacheRead += msg.tokens.cache.read
        cacheWrite += msg.tokens.cache.write
      }
    }
    return { input, output, reasoning, cacheRead, cacheWrite }
  })

  const cacheHitRatio = createMemo(() => {
    const s = tokenStats()
    const total = s.input + s.cacheRead
    if (total === 0) return 0
    return Math.round((s.cacheRead / total) * 100)
  })

  const contextUsage = createMemo(() => {
    const msgs = messages()
    const last = msgs.findLast((x) => x.role === "assistant" && x.tokens.output > 0)
    if (!last || last.role !== "assistant") return null
    const total =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = providers().find((x) => x.id === last.providerID)?.models[last.modelID]
    if (!model?.limit.context) return null
    return Math.round((total / model.limit.context) * 100)
  })

  const hasCost = createMemo(() => totalCost() > 0 || tokenStats().input > 0 || tokenStats().output > 0)

  return (
    <Show when={hasCost()}>
      <text fg={theme.textMuted} wrapMode="none">
        ${totalCost().toFixed(2)} | {SessionCost.formatTokens(tokenStats().input)} in / {SessionCost.formatTokens(tokenStats().output)} out
        <Show when={tokenStats().reasoning > 0}>
          {" "}/ {SessionCost.formatTokens(tokenStats().reasoning)} reasoning
        </Show>
        <Show when={cacheHitRatio() > 0}>
          {" "}| {cacheHitRatio()}% cache
        </Show>
        <Show when={contextUsage() != null}>
          {" "}| {contextUsage()}% ctx
        </Show>
      </text>
    </Show>
  )
}
