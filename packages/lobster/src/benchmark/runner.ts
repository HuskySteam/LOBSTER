import fs from "fs/promises"
import path from "path"
import os from "os"
import { Benchmark } from "./benchmark"

const DEFAULT_WARMUP_RUNS = 1
const DEFAULT_MEASURED_RUNS = 3

export namespace BenchmarkRunner {
  export type PermissionRule = {
    permission: string
    action: "allow" | "deny"
    pattern: string
  }

  export interface IterationResult {
    passed: boolean
    setupMs: number
    agentMs: number
    verifyMs: number
    error?: string
  }

  export interface Result {
    name: string
    passed: boolean
    time: number
    error?: string
    iterations: number
    warmupRuns: number
    passRate: number
    agentMeanMs: number
    agentStdDevMs: number
    harnessMeanMs: number
    harnessStdDevMs: number
  }

  export interface RunOptions {
    warmupRuns?: number
    measuredRuns?: number
    challenges?: Benchmark.Challenge[]
    executeChallenge?: (challenge: Benchmark.Challenge) => Promise<IterationResult>
  }

  function toSafeInteger(value: number | undefined, fallback: number, min: number) {
    if (typeof value !== "number" || Number.isNaN(value)) return fallback
    return Math.max(min, Math.floor(value))
  }

  function mean(values: number[]) {
    if (values.length === 0) return 0
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  function stdDev(values: number[]) {
    if (values.length === 0) return 0
    const avg = mean(values)
    const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length
    return Math.sqrt(variance)
  }

  function tmpBenchmarkDirectory() {
    return path.join(os.tmpdir(), `lobster-bench-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  }

  function summarizeBunTestError(stderr: Uint8Array | string | undefined) {
    if (!stderr) return undefined
    const text = typeof stderr === "string" ? stderr : Buffer.from(stderr).toString()
    return text.slice(0, 500)
  }

  export function createBenchmarkPermissions(tmpDir: string): PermissionRule[] {
    return [
      { permission: "*", action: "deny", pattern: "*" },
      { permission: "read", action: "allow", pattern: path.join(tmpDir, "**") },
      { permission: "edit", action: "allow", pattern: path.join(tmpDir, "**") },
      { permission: "write", action: "allow", pattern: path.join(tmpDir, "**") },
      { permission: "glob", action: "allow", pattern: path.join(tmpDir, "**") },
      { permission: "grep", action: "allow", pattern: path.join(tmpDir, "**") },
      { permission: "bash", action: "deny", pattern: "*" },
      { permission: "bash", action: "allow", pattern: "bun test*" },
      { permission: "question", action: "deny", pattern: "*" },
    ]
  }

  async function runChallenge(challenge: Benchmark.Challenge): Promise<IterationResult> {
    const tmpDir = tmpBenchmarkDirectory()
    await fs.mkdir(tmpDir, { recursive: true })

    let setupMs = 0
    let agentMs = 0
    let verifyMs = 0

    try {
      const setupStarted = Date.now()

      for (const [filename, content] of Object.entries(challenge.files)) {
        const filepath = path.join(tmpDir, filename)
        await fs.mkdir(path.dirname(filepath), { recursive: true })
        await fs.writeFile(filepath, content)
      }

      const testPath = path.join(tmpDir, "test.test.ts")
      await fs.writeFile(testPath, challenge.test)

      const baselineResult = Bun.spawnSync(["bun", "test", testPath], {
        cwd: tmpDir,
        env: { ...process.env, NODE_ENV: "test" },
      })
      setupMs = Date.now() - setupStarted

      if (baselineResult.exitCode === 0) {
        return {
          passed: false,
          setupMs,
          agentMs,
          verifyMs,
          error: "Benchmark challenge baseline unexpectedly passed before agent execution",
        }
      }

      const { SessionPrompt } = await import("../session/prompt")
      const { Session } = await import("../session")
      const { Provider } = await import("../provider/provider")

      const model = await Provider.defaultModel()
      const session = await Session.createNext({
        parentID: undefined,
        directory: tmpDir,
        title: `Benchmark: ${challenge.name}`,
        permission: createBenchmarkPermissions(tmpDir),
      })

      const prompt = [
        `You are working in directory: ${tmpDir}`,
        "",
        `Task: ${challenge.description}`,
        "",
        "Files in the directory:",
        ...Object.entries(challenge.files).map(([name, content]) => `\n--- ${name} ---\n${content}`),
        "",
        "A test file exists at test.test.ts. Modify project files so all tests pass.",
        "Use read/glob/grep and write/edit tools, then validate with bun test.",
      ].join("\n")

      const agentStarted = Date.now()
      await SessionPrompt.prompt({
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: "build",
        parts: [{ type: "text", text: prompt }],
      })
      agentMs = Date.now() - agentStarted

      const verifyStarted = Date.now()
      const finalResult = Bun.spawnSync(["bun", "test", testPath], {
        cwd: tmpDir,
        env: { ...process.env, NODE_ENV: "test" },
      })
      verifyMs = Date.now() - verifyStarted

      const passed = finalResult.exitCode === 0

      return {
        passed,
        setupMs,
        agentMs,
        verifyMs,
        error: passed ? undefined : summarizeBunTestError(finalResult.stderr),
      }
    } catch (err) {
      return {
        passed: false,
        setupMs,
        agentMs,
        verifyMs,
        error: err instanceof Error ? err.message : String(err),
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  export async function run(options?: RunOptions): Promise<Result[]> {
    const challenges = options?.challenges ?? Benchmark.challenges
    const warmupRuns = toSafeInteger(options?.warmupRuns, DEFAULT_WARMUP_RUNS, 0)
    const measuredRuns = toSafeInteger(options?.measuredRuns, DEFAULT_MEASURED_RUNS, 1)
    const executeChallenge = options?.executeChallenge ?? runChallenge

    const results: Result[] = []

    console.log(
      `Running ${challenges.length} benchmark challenges (warmup=${warmupRuns}, measured=${measuredRuns})...\n`,
    )

    for (const challenge of challenges) {
      console.log(`  Running: ${challenge.name}...`)

      for (let i = 0; i < warmupRuns; i++) {
        await executeChallenge(challenge)
      }

      const measured: IterationResult[] = []
      for (let i = 0; i < measuredRuns; i++) {
        measured.push(await executeChallenge(challenge))
      }

      const passCount = measured.filter((run) => run.passed).length
      const passRate = measured.length > 0 ? passCount / measured.length : 0
      const agentTimes = measured.map((run) => run.agentMs)
      const harnessTimes = measured.map((run) => run.setupMs + run.verifyMs)
      const agentMeanMs = mean(agentTimes)
      const harnessMeanMs = mean(harnessTimes)
      const result: Result = {
        name: challenge.name,
        passed: passCount === measured.length,
        time: agentMeanMs + harnessMeanMs,
        error: [...measured].reverse().find((run) => !run.passed)?.error,
        iterations: measured.length,
        warmupRuns,
        passRate,
        agentMeanMs,
        agentStdDevMs: stdDev(agentTimes),
        harnessMeanMs,
        harnessStdDevMs: stdDev(harnessTimes),
      }
      results.push(result)

      const status = result.passed ? "PASS" : "FAIL"
      const agentSummary = `${result.agentMeanMs.toFixed(1)}ms ±${result.agentStdDevMs.toFixed(1)}`
      const harnessSummary = `${result.harnessMeanMs.toFixed(1)}ms ±${result.harnessStdDevMs.toFixed(1)}`
      const passPercent = `${Math.round(result.passRate * 100)}%`

      console.log(
        `  ${status}  ${challenge.name} (agent ${agentSummary}, harness ${harnessSummary}, pass-rate ${passPercent})`,
      )
      if (result.error) {
        console.log(`         ${result.error.split("\n")[0]}`)
      }
      console.log()
    }

    return results
  }

  export function report(results: Result[]) {
    const passed = results.filter((r) => r.passed).length
    const total = results.length
    const totalTime = results.reduce((sum, r) => sum + r.time, 0)
    const aggregatePassRate = results.length === 0 ? 0 : results.reduce((sum, r) => sum + r.passRate, 0) / results.length

    console.log("=".repeat(70))
    console.log(`Results: ${passed}/${total} fully passed`)
    console.log(`Average pass-rate: ${(aggregatePassRate * 100).toFixed(1)}%`)
    console.log(`Aggregate mean time: ${(totalTime / 1000).toFixed(2)}s`)
    console.log("=".repeat(70))
    console.log()

    for (const result of results) {
      const status = result.passed ? "[PASS]" : "[FAIL]"
      console.log(
        `  ${status} ${result.name.padEnd(30)} agent ${result.agentMeanMs.toFixed(1)}ms ±${result.agentStdDevMs.toFixed(1)} | harness ${result.harnessMeanMs.toFixed(1)}ms ±${result.harnessStdDevMs.toFixed(1)} | pass ${(result.passRate * 100).toFixed(0)}%`,
      )
    }
  }
}

