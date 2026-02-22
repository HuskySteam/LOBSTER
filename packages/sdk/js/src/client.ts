export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { LobsterClient } from "./gen/sdk.gen.js"
export { LobsterClient }

export type LobsterClientConfig = Config & {
  directory?: string
  timeout?: number | false
}

const DEFAULT_REQUEST_TIMEOUT_MS = 300_000

function createTimeoutFetch(baseFetch: (request: Request) => ReturnType<typeof fetch>, timeout: number | false) {
  if (timeout === false) {
    return baseFetch
  }

  return (request: Request) => {
    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => {
      timeoutController.abort(new DOMException(`Request timed out after ${timeout}ms`, "TimeoutError"))
    }, timeout)

    const signal = AbortSignal.any([request.signal, timeoutController.signal])
    const timeoutRequest = new Request(request, { signal })

    return baseFetch(timeoutRequest).finally(() => {
      clearTimeout(timeoutId)
    })
  }
}

export function createLobsterClient(config?: LobsterClientConfig) {
  const baseFetch = config?.fetch ?? fetch
  const timeoutConfig = config?.timeout === undefined ? DEFAULT_REQUEST_TIMEOUT_MS : config.timeout
  const timeout = typeof timeoutConfig === "number" ? Math.max(1, Math.floor(timeoutConfig)) : timeoutConfig

  const clientConfig: Config = {
    ...config,
    fetch: createTimeoutFetch(baseFetch as (request: Request) => ReturnType<typeof fetch>, timeout),
  }

  if (config?.directory) {
    clientConfig.headers = {
      ...config.headers,
      "x-lobster-directory": config.directory,
    }
  }

  const client = createClient(clientConfig)
  return new LobsterClient({ client })
}
