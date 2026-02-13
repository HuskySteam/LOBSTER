import { test, expect, describe } from "bun:test"
import { CompactionWeights } from "../../src/session/compaction-weights"

// Minimal mock for MessageV2.ToolPart - only the fields score() uses
const mockToolPart = (overrides: {
  tool?: string
  status?: "pending" | "running" | "completed" | "error"
  output?: string
} = {}) => ({
  type: "tool" as const,
  tool: overrides.tool ?? "bash",
  callID: "test-call",
  id: "test-id",
  messageID: "test-msg",
  sessionID: "test-session",
  state: overrides.status === "error"
    ? {
        status: "error" as const,
        input: {},
        error: "some error",
        time: { start: 0, end: 0 },
      }
    : {
        status: overrides.status ?? ("completed" as const),
        input: {},
        output: overrides.output ?? "",
        title: "test",
        metadata: {},
        time: { start: 0, end: 0 },
      },
})

describe("CompactionWeights.score", () => {
  describe("recency bonus", () => {
    test("message in last 20% gets +3", () => {
      const part = mockToolPart()
      // msgIndex 9 > 10 * 0.8 = 8, so recency bonus applies
      const score = CompactionWeights.score(part as any, 9, 10)
      expect(score).toBeGreaterThanOrEqual(3)
    })

    test("message not in last 20% gets no recency bonus", () => {
      const part = mockToolPart()
      // msgIndex 5 <= 10 * 0.8 = 8, no recency bonus
      const score = CompactionWeights.score(part as any, 5, 10)
      expect(score).toBeLessThan(3)
    })

    test("message at exact threshold boundary does not get bonus", () => {
      const part = mockToolPart()
      // msgIndex 8 === 10 * 0.8 = 8, not > so no bonus
      const score = CompactionWeights.score(part as any, 8, 10)
      expect(score).toBeLessThan(3)
    })
  })

  describe("error bonus", () => {
    test("error status gets +2", () => {
      const part = mockToolPart({ status: "error" })
      // Non-recent, non-exploration tool
      const score = CompactionWeights.score(part as any, 0, 100)
      expect(score).toBe(2)
    })
  })

  describe("large output penalty", () => {
    test("completed with >5000 tokens gets -2", () => {
      // Token.estimate uses chars / 4, so >20000 chars = >5000 tokens
      const largeOutput = "x".repeat(20004)
      const part = mockToolPart({ output: largeOutput })
      // Non-recent, non-exploration tool, completed with large output
      const score = CompactionWeights.score(part as any, 0, 100)
      expect(score).toBe(-2)
    })

    test("completed with <=5000 tokens gets no penalty", () => {
      const smallOutput = "x".repeat(100)
      const part = mockToolPart({ output: smallOutput })
      const score = CompactionWeights.score(part as any, 0, 100)
      expect(score).toBe(0)
    })
  })

  describe("exploration tools bonus", () => {
    test("read tool gets +1", () => {
      const part = mockToolPart({ tool: "read", output: "" })
      const score = CompactionWeights.score(part as any, 0, 100)
      expect(score).toBe(1)
    })

    test("grep tool gets +1", () => {
      const part = mockToolPart({ tool: "grep", output: "" })
      const score = CompactionWeights.score(part as any, 0, 100)
      expect(score).toBe(1)
    })

    test("glob tool gets +1", () => {
      const part = mockToolPart({ tool: "glob", output: "" })
      const score = CompactionWeights.score(part as any, 0, 100)
      expect(score).toBe(1)
    })

    test("bash tool gets no exploration bonus", () => {
      const part = mockToolPart({ tool: "bash", output: "" })
      const score = CompactionWeights.score(part as any, 0, 100)
      expect(score).toBe(0)
    })
  })

  describe("combined scoring", () => {
    test("recent error exploration tool", () => {
      const part = mockToolPart({ tool: "read", status: "error" })
      // recency(+3) + error(+2) + exploration(+1) = 6
      const score = CompactionWeights.score(part as any, 9, 10)
      expect(score).toBe(6)
    })

    test("recent completed large output non-exploration", () => {
      const largeOutput = "x".repeat(20004)
      const part = mockToolPart({ output: largeOutput })
      // recency(+3) + large_output(-2) = 1
      const score = CompactionWeights.score(part as any, 9, 10)
      expect(score).toBe(1)
    })

    test("non-recent completed exploration with large output", () => {
      const largeOutput = "x".repeat(20004)
      const part = mockToolPart({ tool: "read", output: largeOutput })
      // exploration(+1) + large_output(-2) = -1
      const score = CompactionWeights.score(part as any, 0, 100)
      expect(score).toBe(-1)
    })
  })
})
