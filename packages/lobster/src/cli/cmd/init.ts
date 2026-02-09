import { cmd } from "./cmd"
import { init } from "../../init/init"

export const InitCommand = cmd({
  command: "init",
  describe: "initialize lobster in the current project",
  builder: (yargs) => yargs,
  handler: async () => {
    await init(process.cwd())
  },
})
