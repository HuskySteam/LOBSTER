import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { search, install, list } from "../../plugin/marketplace"

const PluginSearchCommand = cmd({
  command: "search <query>",
  describe: "search for plugins on npm",
  builder: (yargs: Argv) => {
    return yargs.positional("query", {
      describe: "search query",
      type: "string",
      demandOption: true,
    })
  },
  handler: async (args) => {
    await search(args.query as string)
  },
})

const PluginInstallCommand = cmd({
  command: "install <name>",
  describe: "install a plugin",
  builder: (yargs: Argv) => {
    return yargs.positional("name", {
      describe: "plugin package name",
      type: "string",
      demandOption: true,
    })
  },
  handler: async (args) => {
    await install(args.name as string, process.cwd())
  },
})

const PluginListCommand = cmd({
  command: "list",
  describe: "list installed plugins",
  builder: (yargs: Argv) => yargs,
  handler: async () => {
    await list(process.cwd())
  },
})

export const PluginCommand = cmd({
  command: "plugin",
  describe: "manage plugins",
  builder: (yargs: Argv) =>
    yargs.command(PluginSearchCommand).command(PluginInstallCommand).command(PluginListCommand).demandCommand(),
  async handler() {},
})
