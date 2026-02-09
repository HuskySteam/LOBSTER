import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless lobster server",
  handler: async (args) => {
    const opts = await resolveNetworkOptions(args)

    if (!Flag.LOBSTER_SERVER_PASSWORD) {
      if (opts.hostname !== "127.0.0.1" && opts.hostname !== "localhost" && opts.hostname !== "::1") {
        console.log("Warning: LOBSTER_SERVER_PASSWORD is not set. Overriding hostname to 127.0.0.1 for security.")
        console.log("Set LOBSTER_SERVER_PASSWORD to bind to other interfaces.")
        opts.hostname = "127.0.0.1"
      } else {
        console.log("Warning: LOBSTER_SERVER_PASSWORD is not set — binding to localhost only.")
      }
    }

    const server = Server.listen(opts)
    console.log(`lobster server listening on http://${server.hostname}:${server.port}`)
    await new Promise(() => {})
    await server.stop()
  },
})
