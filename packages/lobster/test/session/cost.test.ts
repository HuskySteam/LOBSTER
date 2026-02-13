import { test, expect, describe } from "bun:test"
import { SessionCost } from "../../src/session/cost"

describe("SessionCost.aggregate", () => {
  test("empty messages returns zero stats", () => {
    const stats = SessionCost.aggregate([])
    expect(stats.totalCost).toBe(0)
    expect(stats.inputTokens).toBe(0)
    expect(stats.outputTokens).toBe(0)
    expect(stats.reasoningTokens).toBe(0)
    expect(stats.cacheRead).toBe(0)
    expect(stats.cacheWrite).toBe(0)
  })

  test("single assistant message with tokens", () => {
    const stats = SessionCost.aggregate([
      {
        role: "assistant",
        cost: 0.05,
        tokens: {
          input: 100,
          output: 50,
          reasoning: 10,
          cache: { read: 20, write: 30 },
        },
      },
    ])
    expect(stats.totalCost).toBe(0.05)
    expect(stats.inputTokens).toBe(100)
    expect(stats.outputTokens).toBe(50)
    expect(stats.reasoningTokens).toBe(10)
    expect(stats.cacheRead).toBe(20)
    expect(stats.cacheWrite).toBe(30)
  })

  test("multiple assistant messages accumulate", () => {
    const stats = SessionCost.aggregate([
      {
        role: "assistant",
        cost: 0.01,
        tokens: {
          input: 100,
          output: 50,
          reasoning: 0,
          cache: { read: 10, write: 5 },
        },
      },
      {
        role: "assistant",
        cost: 0.02,
        tokens: {
          input: 200,
          output: 100,
          reasoning: 20,
          cache: { read: 30, write: 15 },
        },
      },
    ])
    expect(stats.totalCost).toBeCloseTo(0.03)
    expect(stats.inputTokens).toBe(300)
    expect(stats.outputTokens).toBe(150)
    expect(stats.reasoningTokens).toBe(20)
    expect(stats.cacheRead).toBe(40)
    expect(stats.cacheWrite).toBe(20)
  })

  test("non-assistant messages are skipped", () => {
    const stats = SessionCost.aggregate([
      { role: "user", cost: 999 },
      { role: "system", cost: 888 },
      {
        role: "assistant",
        cost: 0.01,
        tokens: {
          input: 10,
          output: 5,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      },
    ])
    expect(stats.totalCost).toBe(0.01)
    expect(stats.inputTokens).toBe(10)
    expect(stats.outputTokens).toBe(5)
  })

  test("assistant message without tokens", () => {
    const stats = SessionCost.aggregate([
      { role: "assistant", cost: 0.01 },
    ])
    expect(stats.totalCost).toBe(0.01)
    expect(stats.inputTokens).toBe(0)
    expect(stats.outputTokens).toBe(0)
  })

  test("assistant message without cost", () => {
    const stats = SessionCost.aggregate([
      {
        role: "assistant",
        tokens: {
          input: 50,
          output: 25,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      },
    ])
    expect(stats.totalCost).toBe(0)
    expect(stats.inputTokens).toBe(50)
  })
})

describe("SessionCost.cacheHitRatio", () => {
  test("zero total returns 0", () => {
    const ratio = SessionCost.cacheHitRatio({
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
    })
    expect(ratio).toBe(0)
  })

  test("formula is cacheRead / (inputTokens + cacheRead)", () => {
    const ratio = SessionCost.cacheHitRatio({
      totalCost: 0,
      inputTokens: 80,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheRead: 20,
      cacheWrite: 100, // cacheWrite should NOT be in denominator
    })
    // 20 / (80 + 20) = 0.2
    expect(ratio).toBe(0.2)
  })

  test("100% cache hit", () => {
    const ratio = SessionCost.cacheHitRatio({
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheRead: 100,
      cacheWrite: 50,
    })
    // 100 / (0 + 100) = 1
    expect(ratio).toBe(1)
  })

  test("no cache reads", () => {
    const ratio = SessionCost.cacheHitRatio({
      totalCost: 0,
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 0,
      cacheRead: 0,
      cacheWrite: 50,
    })
    // 0 / (100 + 0) = 0
    expect(ratio).toBe(0)
  })
})

describe("SessionCost.formatTokens", () => {
  test("zero", () => {
    expect(SessionCost.formatTokens(0)).toBe("0")
  })

  test("below 1K", () => {
    expect(SessionCost.formatTokens(999)).toBe("999")
  })

  test("exactly 1K", () => {
    expect(SessionCost.formatTokens(1000)).toBe("1.0K")
  })

  test("1.5K", () => {
    expect(SessionCost.formatTokens(1500)).toBe("1.5K")
  })

  test("below 1M", () => {
    expect(SessionCost.formatTokens(999999)).toBe("1000.0K")
  })

  test("exactly 1M", () => {
    expect(SessionCost.formatTokens(1_000_000)).toBe("1.0M")
  })

  test("1.5M", () => {
    expect(SessionCost.formatTokens(1_500_000)).toBe("1.5M")
  })
})
