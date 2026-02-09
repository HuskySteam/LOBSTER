import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import type { PromptInfo } from "../component/prompt/history"

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

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: () => {
    const [store, setStore] = createStore<Route>(
      process.env["LOBSTER_ROUTE"]
        ? parseRouteEnv(process.env["LOBSTER_ROUTE"])
        : {
            type: "home",
          },
    )

    return {
      get data() {
        return store
      },
      navigate(route: Route) {
        setStore(route)
      },
    }
  },
})

export type RouteContext = ReturnType<typeof useRoute>

export function useRouteData<T extends Route["type"]>(type: T) {
  const route = useRoute()
  return route.data as Extract<Route, { type: typeof type }>
}
