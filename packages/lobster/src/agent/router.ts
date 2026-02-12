import { Log } from "../util/log"

export namespace AgentRouter {
  const log = Log.create({ service: "agent.router" })

  export interface RouteResult {
    agent: string
    confidence: number
    reason: string
  }

  const PLAN_PATTERNS = [
    /\bplan\s+(?:the|a|an|how|to)\b/i,
    /\bdesign\s+(?:the|a|an)\b/i,
    /\boutline\s+(?:the|a|an)\b/i,
    /\bbreak\s+this\s+down\b/i,
    /\bstrategy\s+for\b/i,
    /\bwhat\s+approach\s+should\b/i,
    /\barchitect(?:ure)?\s+(?:the|a|an|for)\b/i,
    /\bcreate\s+(?:a\s+)?plan\b/i,
  ]

  const EXPLORE_PATTERNS = [
    /\bexplain\s+how\b/i,
    /\bhow\s+does\b/i,
    /\bwhere\s+is\b/i,
    /\bwhat\s+is\s+the\b/i,
    /\bshow\s+me\s+the\b/i,
    /\btrace\s+the\b/i,
    /\bfind\s+all\b/i,
    /\blist\s+all\b/i,
    /\bsearch\s+for\b/i,
    /\bwhat\s+are\s+the\b/i,
    /\bwalk\s+(?:me\s+)?through\b/i,
  ]

  const ACTION_VERBS = /\b(?:fix|implement|build|create|add|remove|delete|update|modify|change|write|refactor|migrate|install|deploy|configure|setup|set\s*up)\b/i

  export function classify(text: string): RouteResult {
    const trimmed = text.trim()

    // Check for plan signals
    for (const pattern of PLAN_PATTERNS) {
      if (pattern.test(trimmed)) {
        // Check if there's also an action verb — if so, build wins
        if (ACTION_VERBS.test(trimmed)) {
          const actionMatch = trimmed.match(ACTION_VERBS)
          const planMatch = trimmed.match(pattern)
          if (actionMatch && planMatch && actionMatch.index! > planMatch.index!) {
            log.info("plan signal overridden by action verb", { text: trimmed.slice(0, 100) })
            return { agent: "build", confidence: 0.7, reason: "action verb after plan phrase" }
          }
        }
        log.info("classified as plan", { text: trimmed.slice(0, 100) })
        return { agent: "plan", confidence: 0.9, reason: "plan keyword detected" }
      }
    }

    // Check for explore signals
    for (const pattern of EXPLORE_PATTERNS) {
      if (pattern.test(trimmed)) {
        // Negation check: explore phrase + action verb later = build
        if (ACTION_VERBS.test(trimmed)) {
          const actionMatch = trimmed.match(ACTION_VERBS)
          const exploreMatch = trimmed.match(pattern)
          if (actionMatch && exploreMatch && actionMatch.index! > exploreMatch.index!) {
            log.info("explore signal overridden by action verb", { text: trimmed.slice(0, 100) })
            return { agent: "build", confidence: 0.7, reason: "action verb after explore phrase" }
          }
        }
        log.info("classified as explore", { text: trimmed.slice(0, 100) })
        return { agent: "explore", confidence: 0.85, reason: "explore keyword detected" }
      }
    }

    // Question-only: ends with ? and no action verbs
    if (trimmed.endsWith("?") && !ACTION_VERBS.test(trimmed)) {
      log.info("classified as explore (question)", { text: trimmed.slice(0, 100) })
      return { agent: "explore", confidence: 0.7, reason: "question without action verbs" }
    }

    // Default: build
    log.info("classified as build (default)", { text: trimmed.slice(0, 100) })
    return { agent: "build", confidence: 0.5, reason: "default" }
  }
}
