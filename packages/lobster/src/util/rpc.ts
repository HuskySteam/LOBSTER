export namespace Rpc {
  type Definition = {
    [method: string]: (input: any) => any
  }

  export function listen(rpc: Definition) {
    onmessage = async (evt) => {
      let parsed: any
      try {
        parsed = JSON.parse(evt.data)
      } catch {
        console.error("RPC: malformed message received", evt.data)
        return
      }
      if (parsed.type === "rpc.request") {
        if (typeof rpc[parsed.method] !== "function") {
          console.error(`RPC method not found: ${parsed.method}`)
          postMessage(JSON.stringify({ type: "rpc.result", id: parsed.id, error: `RPC method not found: ${parsed.method}` }))
          return
        }
        try {
          const result = await rpc[parsed.method](parsed.input)
          postMessage(JSON.stringify({ type: "rpc.result", result, id: parsed.id }))
        } catch (e) {
          postMessage(JSON.stringify({ type: "rpc.result", id: parsed.id, error: e instanceof Error ? e.message : String(e) }))
        }
      }
    }
  }

  export function emit(event: string, data: unknown) {
    postMessage(JSON.stringify({ type: "rpc.event", event, data }))
  }

  export function client<T extends Definition>(target: {
    postMessage: (data: string) => void | null
    onmessage: ((this: Worker, ev: MessageEvent<any>) => any) | null
  }) {
    const pending = new Map<number, (result: any) => void>()
    const listeners = new Map<string, Set<(data: any) => void>>()
    let id = 0
    target.onmessage = async (evt) => {
      let parsed: any
      try {
        parsed = JSON.parse(evt.data)
      } catch {
        console.error("RPC client: malformed message received", evt.data)
        return
      }
      if (parsed.type === "rpc.result") {
        const handler = pending.get(parsed.id)
        if (handler) {
          pending.delete(parsed.id)
          if (parsed.error) {
            handler({ __rpc_error: parsed.error })
          } else {
            handler({ __rpc_result: parsed.result })
          }
        }
      }
      if (parsed.type === "rpc.event") {
        const handlers = listeners.get(parsed.event)
        if (handlers) {
          for (const handler of handlers) {
            handler(parsed.data)
          }
        }
      }
    }
    return {
      call<Method extends keyof T>(method: Method, input: Parameters<T[Method]>[0], timeoutMs = 30_000): Promise<ReturnType<T[Method]>> {
        const requestId = id++
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(requestId)
            reject(new Error(`RPC call '${String(method)}' timed out after ${timeoutMs}ms`))
          }, timeoutMs)
          pending.set(requestId, (response) => {
            clearTimeout(timer)
            if (response.__rpc_error) {
              reject(new Error(response.__rpc_error))
              return
            }
            resolve(response.__rpc_result)
          })
          target.postMessage(JSON.stringify({ type: "rpc.request", method, input, id: requestId }))
        })
      },
      on<Data>(event: string, handler: (data: Data) => void) {
        let handlers = listeners.get(event)
        if (!handlers) {
          handlers = new Set()
          listeners.set(event, handlers)
        }
        handlers.add(handler)
        return () => {
          handlers!.delete(handler)
        }
      },
      dispose() {
        for (const [reqId, handler] of pending) {
          handler({ __rpc_error: "RPC client disposed" })
        }
        pending.clear()
        listeners.clear()
      },
    }
  }
}
