/** @jsxImportSource react */
import { createContext, useContext, type ReactNode } from "react"
import { FormatError, FormatUnknownError } from "@/cli/error"

type Exit = ((reason?: unknown) => Promise<void>) & {
  message: {
    set: (value?: string) => () => void
    clear: () => void
    get: () => string | undefined
  }
}

const ExitContext = createContext<Exit | undefined>(undefined)

export function ExitProvider(props: { onExit?: () => Promise<void>; children: ReactNode }) {
  let message: string | undefined
  const store = {
    set: (value?: string) => {
      const prev = message
      message = value
      return () => {
        message = prev
      }
    },
    clear: () => {
      message = undefined
    },
    get: () => message,
  }

  const exit: Exit = Object.assign(
    async (reason?: unknown) => {
      await props.onExit?.()
      if (reason) {
        const formatted = FormatError(reason) ?? FormatUnknownError(reason)
        if (formatted) {
          process.stderr.write(formatted + "\n")
        }
      }
      const text = store.get()
      if (text) process.stdout.write(text + "\n")
      process.exit(reason ? 1 : 0)
    },
    { message: store },
  )

  return <ExitContext.Provider value={exit}>{props.children}</ExitContext.Provider>
}

export function useExit(): Exit {
  const ctx = useContext(ExitContext)
  if (!ctx) throw new Error("useExit must be used within ExitProvider")
  return ctx
}
