import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { BenchmarkRunner } from "../../benchmark/runner"

export const BenchmarkCommand = cmd({
  command: "benchmark",
  describe: "run coding benchmark challenges to evaluate agent performance",
  builder: (yargs: Argv) =>
    yargs
      .option("warmup", {
        describe: "number of warmup iterations per challenge",
        type: "number",
        default: 1,
      })
      .option("runs", {
        describe: "number of measured iterations per challenge",
        type: "number",
        default: 3,
      }),
  handler: async (args) => {
    const warmupRuns = Math.max(0, Math.floor(Number((args as any).warmup ?? 1)))
    const measuredRuns = Math.max(1, Math.floor(Number((args as any).runs ?? 3)))

    await bootstrap(process.cwd(), async () => {
      const results = await BenchmarkRunner.run({
        warmupRuns,
        measuredRuns,
      })
      BenchmarkRunner.report(results)
      process.exitCode = results.every((r) => r.passed) ? 0 : 1
    })
  },
})
