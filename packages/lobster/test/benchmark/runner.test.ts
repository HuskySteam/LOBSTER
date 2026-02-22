import { describe, expect, test } from "bun:test"
import path from "path"
import { Benchmark } from "../../src/benchmark/benchmark"
import { BenchmarkRunner } from "../../src/benchmark/runner"
import { PermissionNext } from "../../src/permission/next"

describe("benchmark.runner permissions", () => {
  test("uses a strict benchmark permission matrix", () => {
    const tmpDir = path.join(process.cwd(), ".bench-permissions")
    const rules = BenchmarkRunner.createBenchmarkPermissions(tmpDir)

    expect(PermissionNext.evaluate("read", path.join(tmpDir, "src/index.ts"), rules).action).toBe("allow")
    expect(PermissionNext.evaluate("edit", path.join(tmpDir, "src/index.ts"), rules).action).toBe("allow")
    expect(PermissionNext.evaluate("write", path.join(tmpDir, "src/index.ts"), rules).action).toBe("allow")
    expect(PermissionNext.evaluate("glob", path.join(tmpDir, "**/*.ts"), rules).action).toBe("allow")
    expect(PermissionNext.evaluate("grep", path.join(tmpDir, "**/*.ts"), rules).action).toBe("allow")

    expect(PermissionNext.evaluate("bash", "bun test test.test.ts", rules).action).toBe("allow")
    expect(PermissionNext.evaluate("bash", "bun install", rules).action).toBe("deny")
    expect(PermissionNext.evaluate("question", "*", rules).action).toBe("deny")
    expect(PermissionNext.evaluate("webfetch", "https://example.com", rules).action).toBe("deny")
  })
})

describe("benchmark.runner timing methodology", () => {
  test("runs warmup + measured iterations and excludes warmup from statistics", async () => {
    const challenge: Benchmark.Challenge = {
      name: "synthetic",
      description: "synthetic challenge",
      files: {
        "src/index.ts": "export const x = 1\n",
      },
      test: `import { expect, test } from "bun:test"\nimport { x } from "./src/index"\ntest("x", () => expect(x).toBe(1))\n`,
    }

    const samples = [
      // warmup (should be ignored in stats)
      { passed: true, setupMs: 10, agentMs: 1_000, verifyMs: 20 },
      // measured runs
      { passed: true, setupMs: 40, agentMs: 200, verifyMs: 20 },
      { passed: true, setupMs: 45, agentMs: 400, verifyMs: 25 },
      { passed: true, setupMs: 50, agentMs: 600, verifyMs: 30 },
    ]
    let index = 0

    const results = await BenchmarkRunner.run({
      challenges: [challenge],
      warmupRuns: 1,
      measuredRuns: 3,
      executeChallenge: async () => samples[index++]!,
    })

    expect(index).toBe(4)
    expect(results).toHaveLength(1)

    const result = results[0]!
    expect(result.warmupRuns).toBe(1)
    expect(result.iterations).toBe(3)
    expect(result.passed).toBe(true)
    expect(result.passRate).toBe(1)

    expect(result.agentMeanMs).toBeCloseTo(400, 3)
    expect(result.agentStdDevMs).toBeGreaterThan(100)
    expect(result.harnessMeanMs).toBeCloseTo(70, 3)
    expect(result.harnessStdDevMs).toBeGreaterThan(8)
  })

  test("tracks pass-rate across repeated measured runs", async () => {
    const challenge: Benchmark.Challenge = {
      name: "synthetic-failure",
      description: "synthetic challenge with intermittent failures",
      files: {
        "src/index.ts": "export const x = 1\n",
      },
      test: `import { expect, test } from "bun:test"\nimport { x } from "./src/index"\ntest("x", () => expect(x).toBe(1))\n`,
    }

    const samples = [
      { passed: true, setupMs: 20, agentMs: 100, verifyMs: 10 },
      { passed: false, setupMs: 20, agentMs: 110, verifyMs: 10, error: "assertion failed" },
      { passed: true, setupMs: 20, agentMs: 120, verifyMs: 10 },
    ]
    let index = 0

    const [result] = await BenchmarkRunner.run({
      challenges: [challenge],
      warmupRuns: 0,
      measuredRuns: 3,
      executeChallenge: async () => samples[index++]!,
    })

    expect(result?.passed).toBe(false)
    expect(result?.passRate).toBeCloseTo(2 / 3, 5)
    expect(result?.error).toContain("assertion failed")
  })
})

