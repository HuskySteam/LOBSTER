/** @jsxImportSource react */
import { Text } from "ink"
import React, { useMemo } from "react"
import { useTheme } from "../theme"
import { useAppStore } from "../store"
import { SessionCost } from "@/session/cost"

const EMPTY_MESSAGES: never[] = []

export function CostTracker(props: { sessionID: string }) {
  const { theme } = useTheme()
  const messages = useAppStore((s) => s.message[props.sessionID] ?? EMPTY_MESSAGES)
  const providers = useAppStore((s) => s.provider)

  const totalCost = useMemo(() => {
    let cost = 0
    for (const msg of messages) {
      if (msg.role === "assistant") cost += msg.cost
    }
    return cost
  }, [messages])

  const tokenStats = useMemo(() => {
    let input = 0, output = 0, reasoning = 0, cacheRead = 0, cacheWrite = 0
    for (const msg of messages) {
      if (msg.role === "assistant") {
        input += msg.tokens.input
        output += msg.tokens.output
        reasoning += msg.tokens.reasoning
        cacheRead += msg.tokens.cache.read
        cacheWrite += msg.tokens.cache.write
      }
    }
    return { input, output, reasoning, cacheRead, cacheWrite }
  }, [messages])

  const cacheHitRatio = useMemo(() => {
    const total = tokenStats.input + tokenStats.cacheRead
    if (total === 0) return 0
    return Math.round((tokenStats.cacheRead / total) * 100)
  }, [tokenStats])

  const contextUsage = useMemo(() => {
    const last = messages.findLast((x) => x.role === "assistant" && x.tokens.output > 0)
    if (!last || last.role !== "assistant") return null
    const total =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = providers.find((x) => x.id === last.providerID)?.models[last.modelID]
    if (!model?.limit.context) return null
    return Math.round((total / model.limit.context) * 100)
  }, [messages, providers])

  const hasCost = totalCost > 0 || tokenStats.input > 0 || tokenStats.output > 0
  if (!hasCost) return null

  return (
    <Text color={theme.textMuted} wrap="truncate">
      ${totalCost.toFixed(2)} | {SessionCost.formatTokens(tokenStats.input)} in / {SessionCost.formatTokens(tokenStats.output)} out
      {tokenStats.reasoning > 0 && ` / ${SessionCost.formatTokens(tokenStats.reasoning)} reasoning`}
      {cacheHitRatio > 0 && ` | ${cacheHitRatio}% cache`}
      {contextUsage != null && ` | ${contextUsage}% ctx`}
    </Text>
  )
}
