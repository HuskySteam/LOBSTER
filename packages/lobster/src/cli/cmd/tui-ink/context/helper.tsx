/** @jsxImportSource react */
import { createContext, useContext, type ReactNode } from "react"

export function createSimpleContext<T, Props extends Record<string, any>>(input: {
  name: string
  init: ((props: Props) => T) | (() => T)
}) {
  const ctx = createContext<T | undefined>(undefined)

  return {
    Provider: (props: Props & { children: ReactNode }) => {
      const { children, ...rest } = props
      const init = input.init(rest as unknown as Props)
      return <ctx.Provider value={init}>{children}</ctx.Provider>
    },
    use() {
      const value = useContext(ctx)
      if (!value) throw new Error(`${input.name} context must be used within a context provider`)
      return value
    },
  }
}
