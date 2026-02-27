import { beforeEach, describe, expect, test } from "bun:test"
import { estimateToolLines, resetToolLineCacheForTests } from "./line-estimate"

describe("tool line estimate cache", () => {
  beforeEach(() => {
    resetToolLineCacheForTests()
  })

  test("invalidates cache when tool part changes under the same id", () => {
    const pending = {
      id: "part-1",
      tool: "bash",
      state: {
        status: "pending",
        input: { command: "echo done" },
      },
    }
    const completed = {
      id: "part-1",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "echo done" },
        metadata: { output: "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11" },
      },
    }

    const before = estimateToolLines(pending, 40)
    const after = estimateToolLines(completed, 40)

    expect(after).toBeGreaterThan(before)
  })

  test("invalidates cache when output changes but id and cols stay the same", () => {
    const first = {
      id: "part-2",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "echo test" },
        metadata: { output: "ok" },
      },
    }
    const second = {
      id: "part-2",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "echo test" },
        metadata: { output: "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve" },
      },
    }

    const firstEstimate = estimateToolLines(first, 40)
    const secondEstimate = estimateToolLines(second, 40)

    expect(secondEstimate).toBeGreaterThan(firstEstimate)
  })

  test("recomputes estimates for different widths", () => {
    const part = {
      id: "part-3",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "echo 1234567890".repeat(5) },
        metadata: { output: "1234567890".repeat(20) },
      },
    }

    const wide = estimateToolLines(part, 100)
    const narrow = estimateToolLines(part, 20)

    expect(narrow).toBeGreaterThan(wide)
  })
})
