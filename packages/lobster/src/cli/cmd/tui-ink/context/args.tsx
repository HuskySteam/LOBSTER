/** @jsxImportSource react */
import { createContext, useContext, type ReactNode } from "react"

export interface Args {
  model?: string
  agent?: string
  prompt?: string
  continue?: boolean
  sessionID?: string
}

const ArgsContext = createContext<Args | undefined>(undefined)

export function ArgsProvider(props: Args & { children: ReactNode }) {
  const { children, ...args } = props
  return <ArgsContext.Provider value={args}>{children}</ArgsContext.Provider>
}

export function useArgs(): Args {
  const ctx = useContext(ArgsContext)
  if (!ctx) throw new Error("useArgs must be used within ArgsProvider")
  return ctx
}
