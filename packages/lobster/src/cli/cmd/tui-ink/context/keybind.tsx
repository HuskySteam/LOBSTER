/** @jsxImportSource react */
import React, { createContext, useContext, useCallback, useState, useRef, useEffect, type ReactNode } from "react"
import { useInput, useApp } from "ink"
import { useRoute } from "./route"
import { useSDK } from "./sdk"
import { useAppStore } from "../store"

export interface KeybindAction {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  description: string
  action: () => void
}

interface KeybindContextValue {
  /** Whether a dialog is currently open (suppresses global bindings) */
  dialogOpen: boolean
  setDialogOpen: (open: boolean) => void
  /** Register a global keybinding */
  register: (id: string, binding: KeybindAction) => void
  /** Unregister a global keybinding */
  unregister: (id: string) => void
}

const KeybindContext = createContext<KeybindContextValue | undefined>(undefined)

export function KeybindProvider(props: { children: ReactNode }) {
  const { exit } = useApp()
  const route = useRoute()
  const { sync } = useSDK()
  const [dialogOpen, setDialogOpen] = useState(false)
  const bindingsRef = useRef<Map<string, KeybindAction>>(new Map())

  const register = useCallback((id: string, binding: KeybindAction) => {
    bindingsRef.current.set(id, binding)
  }, [])

  const unregister = useCallback((id: string) => {
    bindingsRef.current.delete(id)
  }, [])

  // Global keyboard handler
  useInput((ch, key) => {
    // Always handle Ctrl+C for exit
    if (key.ctrl && ch === "c") {
      // If in a session that's running, abort first
      if (route.data.type === "session") {
        const sessionStatus = useAppStore.getState().session_status[route.data.sessionID]
        if (sessionStatus?.type === "busy" || sessionStatus?.type === "retry") {
          sync.client.session.abort({ sessionID: route.data.sessionID }).catch(() => {})
          return
        }
      }
      exit()
      return
    }

    // Skip other global bindings when dialog is open
    if (dialogOpen) return

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

  return (
    <KeybindContext.Provider value={{ dialogOpen, setDialogOpen, register, unregister }}>
      {props.children}
    </KeybindContext.Provider>
  )
}

export function useKeybind(): KeybindContextValue {
  const ctx = useContext(KeybindContext)
  if (!ctx) throw new Error("useKeybind must be used within KeybindProvider")
  return ctx
}
