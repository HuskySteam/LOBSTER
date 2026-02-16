import { Log } from "../util/log"
import type { Provider } from "../provider/provider"

/**
 * Smart Agent Delegator
 *
 * Analyzes task complexity based on the user prompt and session history
 * to suggest model tier overrides. This allows simple tasks (single-file reads,
 * basic searches) to use cheaper/faster models while complex tasks use
 * thinking models.
 *
 * The delegator only SUGGESTS a tier — the actual model selection is done
 * by the session loop which may override based on user preference.
 */
export namespace AgentDelegator {
  const log = Log.create({ service: "agent.delegator" })

  export type Tier = "fast" | "standard" | "thinking"

  export interface DelegationResult {
    tier: Tier
    confidence: number
    reason: string
    suggestedMaxSteps: number
    suggestedMaxToolCalls: number
  }

  // Patterns indicating simple, read-only tasks
  const SIMPLE_PATTERNS = [
    /\bread\s+(the\s+)?file\b/i,
    /\bshow\s+me\b/i,
    /\bwhat\s+is\s+in\b/i,
    /\blist\s+(the\s+)?files?\b/i,
    /\bgrep\s+for\b/i,
    /\bsearch\s+for\b/i,
    /\bfind\s+(the\s+)?file\b/i,
    /\bcat\s+/i,
    /\bcheck\s+(the\s+)?status\b/i,
    /\bgit\s+(status|log|diff|branch)\b/i,
    /\brun\s+(the\s+)?tests?\b/i,
    /\btypecheck\b/i,
    /\blint\b/i,
  ]

  // Patterns indicating complex, multi-step tasks
  const COMPLEX_PATTERNS = [
    /\brefactor\b/i,
    /\bmigrate\b/i,
    /\brewrite\b/i,
    /\brebuild\b/i,
    /\brearchitect\b/i,
    /\bredesign\b/i,
    /\bimplement\s+(?:a\s+)?(?:new\s+)?(?:full|complete|entire)\b/i,
    /\bcreate\s+(?:a\s+)?(?:new\s+)?(?:system|framework|library|package)\b/i,
    /\bmulti[- ]?file\b/i,
    /\bacross\s+(?:the\s+)?(?:entire\s+)?(?:codebase|project|repo)\b/i,
    /\banalyze\s+(?:and\s+)?(?:fix|improve|optimize)\b/i,
    /\bsecurity\s+audit\b/i,
    /\bperformance\s+optimization\b/i,
  ]

  // Patterns indicating medium-complexity tasks
  const MEDIUM_PATTERNS = [
    /\bfix\s+(?:the\s+)?(?:bug|error|issue)\b/i,
    /\badd\s+(?:a\s+)?(?:new\s+)?(?:function|method|field|column)\b/i,
    /\bupdate\s+(?:the\s+)?/i,
    /\bmodify\s+/i,
    /\bchange\s+/i,
    /\bedit\s+/i,
    /\bwrite\s+(?:a\s+)?(?:test|function|method)\b/i,
    /\bcreate\s+(?:a\s+)?(?:new\s+)?(?:file|component|function|test)\b/i,
    /\binstall\b/i,
    /\bconfigure\b/i,
    /\bsetup\b/i,
  ]

  /**
   * Classify the complexity of a user prompt.
   * Returns a delegation result with a tier suggestion.
   */
  export function classify(text: string, step: number): DelegationResult {
    const trimmed = text.trim()
    const wordCount = trimmed.split(/\s+/).length

    // Very short prompts (1-5 words) are usually simple
    if (wordCount <= 5) {
      for (const pattern of SIMPLE_PATTERNS) {
        if (pattern.test(trimmed)) {
          log.info("delegator: fast tier (short + simple pattern)", { text: trimmed.slice(0, 80) })
          return {
            tier: "fast",
            confidence: 0.85,
            reason: "short simple query",
            suggestedMaxSteps: 5,
            suggestedMaxToolCalls: 3,
          }
        }
      }
    }

    // Check complex patterns first (higher priority)
    for (const pattern of COMPLEX_PATTERNS) {
      if (pattern.test(trimmed)) {
        log.info("delegator: thinking tier (complex pattern)", { text: trimmed.slice(0, 80) })
        return {
          tier: "thinking",
          confidence: 0.8,
          reason: "complex task detected",
          suggestedMaxSteps: 50,
          suggestedMaxToolCalls: 15,
        }
      }
    }

    // Long prompts (>100 words) with action verbs are complex
    if (wordCount > 100) {
      log.info("delegator: thinking tier (long prompt)", { text: trimmed.slice(0, 80) })
      return {
        tier: "thinking",
        confidence: 0.7,
        reason: "detailed multi-part request",
        suggestedMaxSteps: 50,
        suggestedMaxToolCalls: 15,
      }
    }

    // Check simple patterns
    for (const pattern of SIMPLE_PATTERNS) {
      if (pattern.test(trimmed)) {
        log.info("delegator: fast tier (simple pattern)", { text: trimmed.slice(0, 80) })
        return {
          tier: "fast",
          confidence: 0.75,
          reason: "read-only / simple query",
          suggestedMaxSteps: 10,
          suggestedMaxToolCalls: 5,
        }
      }
    }

    // Questions without action verbs default to fast
    if (trimmed.endsWith("?") && !MEDIUM_PATTERNS.some((p) => p.test(trimmed))) {
      log.info("delegator: fast tier (question)", { text: trimmed.slice(0, 80) })
      return {
        tier: "fast",
        confidence: 0.65,
        reason: "informational question",
        suggestedMaxSteps: 10,
        suggestedMaxToolCalls: 5,
      }
    }

    // Check medium patterns
    for (const pattern of MEDIUM_PATTERNS) {
      if (pattern.test(trimmed)) {
        log.info("delegator: standard tier (medium pattern)", { text: trimmed.slice(0, 80) })
        return {
          tier: "standard",
          confidence: 0.7,
          reason: "standard edit/create task",
          suggestedMaxSteps: 25,
          suggestedMaxToolCalls: 10,
        }
      }
    }

    // Default: standard tier
    log.info("delegator: standard tier (default)", { text: trimmed.slice(0, 80) })
    return {
      tier: "standard",
      confidence: 0.5,
      reason: "default classification",
      suggestedMaxSteps: 25,
      suggestedMaxToolCalls: 10,
    }
  }

  /**
   * Given a delegation result and the available models for a provider,
   * suggest a model that matches the tier while minimizing cost.
   *
   * Returns undefined if no suitable alternative is found (keep user's choice).
   */
  export function suggestModel(
    tier: Tier,
    currentModel: Provider.Model,
    availableModels: Provider.Model[],
  ): Provider.Model | undefined {
    // Don't override if the user explicitly chose a model
    // (This function is only called when auto-delegation is enabled)

    if (tier === "fast") {
      // Find cheapest model with reasonable capabilities
      const candidates = availableModels
        .filter((m) => m.status === "active" && m.cost.input > 0)
        .sort((a, b) => a.cost.input - b.cost.input)

      // Pick cheapest that isn't the same as current
      const cheapest = candidates[0]
      if (cheapest && cheapest.cost.input < currentModel.cost.input * 0.5) {
        log.info("delegator: suggesting cheaper model", {
          from: currentModel.id,
          to: cheapest.id,
          savingsRatio: 1 - cheapest.cost.input / currentModel.cost.input,
        })
        return cheapest
      }
    }

    if (tier === "thinking") {
      // Find a reasoning-capable model if current doesn't have reasoning
      if (currentModel.capabilities?.reasoning) return undefined

      const reasoning = availableModels
        .filter((m) => m.status === "active" && m.capabilities?.reasoning)
        .sort((a, b) => a.cost.input - b.cost.input)

      if (reasoning[0]) {
        log.info("delegator: suggesting thinking model", {
          from: currentModel.id,
          to: reasoning[0].id,
        })
        return reasoning[0]
      }
    }

    // Standard tier or no better option: keep current
    return undefined
  }
}
