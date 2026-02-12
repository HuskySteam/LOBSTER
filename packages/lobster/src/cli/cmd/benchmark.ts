import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { BenchmarkRunner } from "../../benchmark/runner"

export const BenchmarkCommand = cmd({
  command: "benchmark",
  describe: "run coding benchmark challenges to evaluate agent performance",
  builder: (yargs: Argv) => yargs,
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const results = await BenchmarkRunner.run()
      BenchmarkRunner.report(results)
      process.exitCode = results.every((r) => r.passed) ? 0 : 1
    })
  },
})
