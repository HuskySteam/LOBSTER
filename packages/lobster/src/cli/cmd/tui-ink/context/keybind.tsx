/** @jsxImportSource react */
import React, { createContext, useContext, useCallback, useMemo, useRef, type ReactNode } from "react"
import { useInput, useApp } from "ink"
import { useRoute } from "./route"

export interface KeybindAction {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  description: string
  action: () => void
}

interface KeybindContextValue {
  setBlocker: (id: string, open: boolean) => void
  /** Register a global keybinding */
  register: (id: string, binding: KeybindAction) => void
  /** Unregister a global keybinding */
  unregister: (id: string) => void
}

const KeybindContext = createContext<KeybindContextValue | undefined>(undefined)

export function KeybindProvider(props: { children: ReactNode }) {
  const { exit } = useApp()
  const route = useRoute()
  const blockersRef = useRef<Map<string, true>>(new Map())
  const bindingsRef = useRef<Map<string, KeybindAction>>(new Map())

  const register = useCallback((id: string, binding: KeybindAction) => {
    bindingsRef.current.set(id, binding)
  }, [])

  const unregister = useCallback((id: string) => {
    bindingsRef.current.delete(id)
  }, [])

  const setBlocker = useCallback((id: string, open: boolean) => {
    if (!id) return
    if (open) {
      blockersRef.current.set(id, true)
      return
    }
    blockersRef.current.delete(id)
  }, [])

  // Global keyboard handler
  useInput((ch, key) => {
    // Ctrl+C handling: on session routes, defer entirely to the prompt's
    // double-press handler (abort when busy, press-twice-to-exit when idle).
    // On non-session routes, exit immediately unless a dialog blocker is active.
    if (key.ctrl && ch === "c") {
      if (route.data.type === "session") return
      if (blockersRef.current.size > 0) return
      exit()
      return
    }

    // Skip other global bindings when dialog is open
    if (blockersRef.current.size > 0) return

    // Escape: go back to home from session
    if (key.escape && route.data.type === "session") {
      route.navigate({ type: "home" })
      return
    }

    // Check registered bindings
    for (const binding of bindingsRef.current.values()) {
      const match =
        (binding.key === ch || binding.key === key.upArrow?.toString()) &&
        (binding.ctrl ?? false) === (key.ctrl ?? false) &&
        (binding.meta ?? false) === (key.meta ?? false)

      if (match) {
        binding.action()
        return
      }
    }
  })

  const value = useMemo<KeybindContextValue>(
    () => ({ setBlocker, register, unregister }),
    [setBlocker, register, unregister],
  )

  return (
    <KeybindContext.Provider value={value}>
      {props.children}
    </KeybindContext.Provider>
  )
}

export function useKeybind(): KeybindContextValue {
  const ctx = useContext(KeybindContext)
  if (!ctx) throw new Error("useKeybind must be used within KeybindProvider")
  return ctx
}
