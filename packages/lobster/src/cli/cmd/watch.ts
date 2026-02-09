import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { WatchMode } from "../../watch/watch"

export const WatchCommand = cmd({
  command: "watch",
  describe: "watch for errors and auto-fix them",
  builder: (yargs: Argv) => {
    return yargs
      .option("test", {
        describe: "run tests and fix failures",
        type: "boolean",
      })
      .option("build", {
        describe: "run build and fix compile errors",
        type: "boolean",
      })
      .option("command", {
        alias: ["c"],
        describe: "arbitrary command to run and monitor",
        type: "string",
      })
      .option("model", {
        alias: ["m"],
        describe: "model to use for fixes (provider/model)",
        type: "string",
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      await WatchMode.start({
        test: args.test,
        build: args.build,
        command: args.command,
        model: args.model,
      })
    })
  },
})
