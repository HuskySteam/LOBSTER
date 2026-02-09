import { createLobsterClient, type Event } from "@lobster-ai/sdk/v2"
import { createSimpleContext } from "./helper"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { batch, onCleanup, onMount } from "solid-js"

export type EventSource = {
  on: (handler: (event: Event) => void) => () => void
}

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: {
    url: string
    directory?: string
    fetch?: typeof fetch
    headers?: RequestInit["headers"]
    events?: EventSource
  }) => {
    const abort = new AbortController()
    const sdk = createLobsterClient({
      baseUrl: props.url,
      signal: abort.signal,
      directory: props.directory,
      fetch: props.fetch,
      headers: props.headers,
    })

    const emitter = createGlobalEmitter<{
      [key in Event["type"]]: Extract<Event, { type: key }>
    }>()

    let queue: Event[] = []
    let timer: Timer | undefined
    let last = 0

    const flush = () => {
      if (queue.length === 0) return
      const events = queue
      queue = []
      timer = undefined
      last = Date.now()
      // Batch all event emissions so all store updates result in a single render
      batch(() => {
        for (const event of events) {
          emitter.emit(event.type, event)
        }
      })
    }

    const handleEvent = (event: Event) => {
      queue.push(event)
      const elapsed = Date.now() - last

      if (timer) return
      // If we just flushed recently (within 16ms), batch this with future events
      // Otherwise, process immediately to avoid latency
      if (elapsed < 16) {
        timer = setTimeout(flush, 16)
        return
      }
      flush()
    }

    onMount(async () => {
      // If an event source is provided, use it instead of SSE
      if (props.events) {
        const unsub = props.events.on(handleEvent)
        onCleanup(unsub)
        return
      }

      // Fall back to SSE with exponential backoff on reconnection
      let backoff = 0
      const MAX_BACKOFF = 8000
      while (true) {
        if (abort.signal.aborted) break
        try {
          const events = await sdk.event.subscribe(
            {},
            {
              signal: abort.signal,
            },
          )

          // Reset backoff on successful connection
          backoff = 0

          for await (const event of events.stream) {
            handleEvent(event)
          }

          // Flush any remaining events
          if (timer) clearTimeout(timer)
          if (queue.length > 0) {
            flush()
          }
        } catch {
          // Connection failed or stream ended with error
        }

        if (abort.signal.aborted) break

        // Exponential backoff: 1s, 2s, 4s, 8s max
        backoff = backoff === 0 ? 1000 : Math.min(backoff * 2, MAX_BACKOFF)
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, backoff)
          const onAbort = () => {
            clearTimeout(t)
            resolve()
          }
          abort.signal.addEventListener("abort", onAbort, { once: true })
        })
      }
    })

    onCleanup(() => {
      abort.abort()
      if (timer) clearTimeout(timer)
    })

    return { client: sdk, event: emitter, url: props.url }
  },
})
