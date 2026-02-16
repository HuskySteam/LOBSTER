/** @jsxImportSource react */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { PromptInfo } from "../types"

export type HomeRoute = {
  type: "home"
  initialPrompt?: PromptInfo
}

export type SessionRoute = {
  type: "session"
  sessionID: string
  initialPrompt?: PromptInfo
}

export type Route = HomeRoute | SessionRoute

function parseRouteEnv(raw: string): Route {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return { type: "home" }
    if (parsed.type === "home") return { type: "home" }
    if (parsed.type === "session" && typeof parsed.sessionID === "string") {
      return { type: "session", sessionID: parsed.sessionID }
    }
    return { type: "home" }
  } catch {
    return { type: "home" }
  }
}

interface RouteContextValue {
  data: Route
  navigate: (route: Route) => void
}

const RouteContext = createContext<RouteContextValue | undefined>(undefined)

export function RouteProvider(props: { children: ReactNode }) {
  const initial = process.env["LOBSTER_ROUTE"]
    ? parseRouteEnv(process.env["LOBSTER_ROUTE"])
    : { type: "home" as const }

  const [route, setRoute] = useState<Route>(initial)
  const navigate = useCallback((r: Route) => setRoute(r), [])

  return (
    <RouteContext.Provider value={{ data: route, navigate }}>
      {props.children}
    </RouteContext.Provider>
  )
}

export function useRoute() {
  const ctx = useContext(RouteContext)
  if (!ctx) throw new Error("useRoute must be used within RouteProvider")
  return ctx
}

export type RouteContext = ReturnType<typeof useRoute>
