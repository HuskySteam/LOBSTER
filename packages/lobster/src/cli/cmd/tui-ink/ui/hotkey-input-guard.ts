import { useCallback, useRef } from "react"

let globalBlockedUntil = 0

export function markGlobalHotkeyConsumed(windowMs = 32, now = Date.now()) {
  globalBlockedUntil = Math.max(globalBlockedUntil, now + windowMs)
}

export function shouldIgnoreGlobalInput(now = Date.now()) {
  return now <= globalBlockedUntil
}

export function resetGlobalHotkeyGuard() {
  globalBlockedUntil = 0
}

export interface HotkeyInputGuard {
  markHotkeyConsumed: (now?: number) => void
  shouldIgnoreInput: (now?: number) => boolean
  captureSnapshot: (value: string) => void
  restoreSnapshot: (getValue: () => string, setValue: (value: string) => void) => void
  wrapOnChange: <T extends string>(handler: (value: T) => void) => (value: T) => void
}

export function createHotkeyInputGuard(windowMs = 32): HotkeyInputGuard {
  let blockedUntil = 0
  let snapshot: string | null = null

  function markHotkeyConsumed(now = Date.now()) {
    blockedUntil = Math.max(blockedUntil, now + windowMs)
    markGlobalHotkeyConsumed(windowMs, now)
  }

  function shouldIgnoreInput(now = Date.now()) {
    return now <= blockedUntil || shouldIgnoreGlobalInput(now)
  }

  function captureSnapshot(value: string) {
    snapshot = value
  }

  function restoreSnapshot(getValue: () => string, setValue: (value: string) => void) {
    if (snapshot === null) return
    const next = snapshot
    snapshot = null
    if (getValue() === next) return
    setValue(next)
  }

  function wrapOnChange<T extends string>(handler: (value: T) => void) {
    return (value: T) => {
      if (shouldIgnoreInput()) return
      handler(value)
    }
  }

  return {
    markHotkeyConsumed,
    shouldIgnoreInput,
    captureSnapshot,
    restoreSnapshot,
    wrapOnChange,
  }
}

export function useHotkeyInputGuard(windowMs = 32): HotkeyInputGuard {
  const guardRef = useRef<HotkeyInputGuard>()
  if (!guardRef.current) {
    guardRef.current = createHotkeyInputGuard(windowMs)
  }
  const guard = guardRef.current

  const markHotkeyConsumed = useCallback((now?: number) => guard.markHotkeyConsumed(now), [guard])
  const shouldIgnoreInput = useCallback((now?: number) => guard.shouldIgnoreInput(now), [guard])
  const captureSnapshot = useCallback((value: string) => guard.captureSnapshot(value), [guard])
  const restoreSnapshot = useCallback(
    (getValue: () => string, setValue: (value: string) => void) => {
      guard.restoreSnapshot(getValue, setValue)
    },
    [guard],
  )
  const wrapOnChange = useCallback(
    <T extends string>(handler: (value: T) => void) => guard.wrapOnChange(handler),
    [guard],
  )

  return {
    markHotkeyConsumed,
    shouldIgnoreInput,
    captureSnapshot,
    restoreSnapshot,
    wrapOnChange,
  }
}
