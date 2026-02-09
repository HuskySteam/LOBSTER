export * from "./client.js"
export * from "./server.js"

import { createLobsterClient } from "./client.js"
import { createLobsterServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export async function createLobster(options?: ServerOptions) {
  const server = await createLobsterServer({
    ...options,
  })

  const client = createLobsterClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
