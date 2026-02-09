import { createMemo, type Accessor } from "solid-js"
import { pipe, sumBy } from "remeda"
import type { Message } from "@lobster-ai/sdk/v2"

export function useSessionCost(messages: Accessor<Message[]>) {
  return createMemo(() => {
    const total = pipe(
      messages(),
      sumBy((x) => (x.role === "assistant" ? x.cost : 0)),
    )
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(total)
  })
}
