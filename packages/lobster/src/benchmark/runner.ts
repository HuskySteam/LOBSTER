import fs from "fs/promises"
import path from "path"
import os from "os"
import { Benchmark } from "./benchmark"

export namespace BenchmarkRunner {
  export interface Result {
    name: string
    passed: boolean
    time: number
    error?: string
  }

  async function runChallenge(challenge: Benchmark.Challenge): Promise<Result> {
    const tmpDir = path.join(os.tmpdir(), `lobster-bench-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.mkdir(tmpDir, { recursive: true })

    const start = Date.now()
    try {
      // Write challenge files
      for (const [filename, content] of Object.entries(challenge.files)) {
        const filepath = path.join(tmpDir, filename)
        await fs.mkdir(path.dirname(filepath), { recursive: true })
        await fs.writeFile(filepath, content)
      }

      // Write test file
      const testPath = path.join(tmpDir, "test.test.ts")
      await fs.writeFile(testPath, challenge.test)

      // Run the test to verify initial state (should fail)
      const initialResult = Bun.spawnSync(["bun", "test", testPath], {
        cwd: tmpDir,
        env: { ...process.env, NODE_ENV: "test" },
      })

      // Now spawn the agent to fix the challenge
      const { SessionPrompt } = await import("../session/prompt")
      const { Session } = await import("../session")
      const { Provider } = await import("../provider/provider")
      const { Instance } = await import("../project/instance")
      const { Identifier } = await import("../id/id")

      const model = await Provider.defaultModel()
      const session = await Session.createNext({
        parentID: undefined,
        directory: tmpDir,
        title: `Benchmark: ${challenge.name}`,
        permission: [],
      })

      const prompt = [
        `You are working in directory: ${tmpDir}`,
        "",
        `Task: ${challenge.description}`,
        "",
        "Files in the directory:",
        ...Object.entries(challenge.files).map(([name, content]) => `\n--- ${name} ---\n${content}`),
        "",
        "A test file exists at test.test.ts. Your goal is to modify the source files so all tests pass.",
        "Use the edit or write tool to make changes. When done, the tests will be run automatically.",
      ].join("\n")

      await SessionPrompt.prompt({
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: "build",
        parts: [{ type: "text", text: prompt }],
      })

      // Run the test to verify the fix
      const finalResult = Bun.spawnSync(["bun", "test", testPath], {
        cwd: tmpDir,
        env: { ...process.env, NODE_ENV: "test" },
      })

      const passed = finalResult.exitCode === 0
      const elapsed = Date.now() - start

      return {
        name: challenge.name,
        passed,
        time: elapsed,
        error: passed ? undefined : finalResult.stderr.toString().slice(0, 500),
      }
    } catch (err) {
      return {
        name: challenge.name,
        passed: false,
        time: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  export async function run(): Promise<Result[]> {
    const results: Result[] = []

    console.log(`Running ${Benchmark.challenges.length} benchmark challenges...\n`)

    for (const challenge of Benchmark.challenges) {
      console.log(`  Running: ${challenge.name}...`)
      const result = await runChallenge(challenge)
      results.push(result)

      const status = result.passed ? "PASS" : "FAIL"
      const timeStr = `${(result.time / 1000).toFixed(1)}s`
      console.log(`  ${status}  ${challenge.name} (${timeStr})`)
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

    console.log("=".repeat(50))
    console.log(`Results: ${passed}/${total} passed`)
    console.log(`Total time: ${(totalTime / 1000).toFixed(1)}s`)
    console.log("=".repeat(50))
    console.log()

    for (const result of results) {
      const status = result.passed ? "[PASS]" : "[FAIL]"
      const timeStr = `${(result.time / 1000).toFixed(1)}s`
      console.log(`  ${status} ${result.name.padEnd(25)} ${timeStr}`)
    }
  }
}
