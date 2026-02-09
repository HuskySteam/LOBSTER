import { createMemo, type Accessor } from "solid-js"
import type { AssistantMessage, Message, Provider } from "@lobster-ai/sdk/v2"

export function useContextTokens(messages: Accessor<Message[]>, providers: Accessor<Provider[]>) {
  const context = createMemo(() => {
    const last = messages().findLast((x) => x.role === "assistant" && x.tokens.output > 0) as AssistantMessage
    if (!last) return undefined
    const total =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = providers().find((x) => x.id === last.providerID)?.models[last.modelID]
    const tokens = total.toLocaleString()
    const percentage = model?.limit.context ? Math.round((total / model.limit.context) * 100) : null
    return { tokens, percentage, display: percentage != null ? `${tokens}  ${percentage}%` : tokens }
  })
  return context
}
