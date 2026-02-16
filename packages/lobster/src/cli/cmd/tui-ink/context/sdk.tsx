/** @jsxImportSource react */
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react"
import { createSyncManager, type SyncManager, type EventSource } from "../sync"
import { useAppStore } from "../store"
import { useArgs } from "./args"
import { useExit } from "./exit"

interface SDKContextValue {
  sync: SyncManager
}

const SDKContext = createContext<SDKContextValue | undefined>(undefined)

export function SDKProvider(props: {
  url: string
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
  children: ReactNode
}) {
  const args = useArgs()
  const exit = useExit()

  const syncRef = useRef<SyncManager | null>(null)
  if (!syncRef.current) {
    syncRef.current = createSyncManager({
      url: props.url,
      directory: props.directory,
      fetch: props.fetch,
      headers: props.headers,
      events: props.events,
      args: { continue: args.continue },
      onExit: exit,
    })
  }

  useEffect(() => {
    const sync = syncRef.current!
    sync.bootstrap()
    sync.startEventLoop()
    return () => sync.dispose()
  }, [])

  return (
    <SDKContext.Provider value={{ sync: syncRef.current }}>
      {props.children}
    </SDKContext.Provider>
  )
}

export function useSDK() {
  const ctx = useContext(SDKContext)
  if (!ctx) throw new Error("useSDK must be used within SDKProvider")
  return ctx
}
