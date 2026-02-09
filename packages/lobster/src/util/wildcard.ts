import { sortBy, pipe } from "remeda"

export namespace Wildcard {
  export function match(str: string, pattern: string) {
    let escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape special regex chars
      .replace(/\*/g, ".*") // * becomes .*
      .replace(/\?/g, ".") // ? becomes .

    // If pattern ends with " *" (space + wildcard), make the trailing part optional
    // This allows "ls *" to match both "ls" and "ls -la"
    if (escaped.endsWith(" .*")) {
      escaped = escaped.slice(0, -3) + "( .*)?"
    }

    return new RegExp("^" + escaped + "$", "s").test(str)
  }

  export function all(input: string, patterns: Record<string, any>) {
    const sorted = pipe(patterns, Object.entries, sortBy([([key]) => key.length, "asc"], [([key]) => key, "asc"]))
    let result = undefined
    for (const [pattern, value] of sorted) {
      if (match(input, pattern)) {
        result = value
        continue
      }
    }
    return result
  }

  export function allStructured(input: { head: string; tail: string[] }, patterns: Record<string, any>) {
    const sorted = pipe(patterns, Object.entries, sortBy([([key]) => key.length, "asc"], [([key]) => key, "asc"]))
    let result = undefined
    for (const [pattern, value] of sorted) {
      const parts = pattern.split(/\s+/)
      if (!match(input.head, parts[0])) continue
      if (parts.length === 1 || matchSequence(input.tail, parts.slice(1))) {
        result = value
        continue
      }
    }
    return result
  }

  function matchSequence(items: string[], patterns: string[]): boolean {
    // Filter out standalone "*" patterns (they match anything)
    const filtered = patterns.filter((p) => p !== "*")
    if (filtered.length === 0) return true

    const n = items.length
    const m = filtered.length
    // dp[j] = true means filtered[0..j-1] have been matched
    const dp = new Array<boolean>(m + 1).fill(false)
    dp[0] = true
    for (let i = 0; i < n; i++) {
      // Iterate backwards to avoid using updated values from the same row
      for (let j = m - 1; j >= 0; j--) {
        if (dp[j] && match(items[i], filtered[j])) {
          dp[j + 1] = true
        }
      }
    }
    return dp[m]
  }
}
