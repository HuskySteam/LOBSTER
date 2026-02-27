import { useCallback, useRef } from "react"

const globalGuard = {
  blockedUntil: 0,
  snapshot: null as string | null,
}

export function markGlobalHotkeyConsumed(windowMs = 32, now = Date.now()) {
  globalGuard.blockedUntil = Math.max(globalGuard.blockedUntil, now + windowMs)
}

export function shouldIgnoreGlobalInput(now = Date.now()) {
  return now <= globalGuard.blockedUntil
}

export function resetGlobalHotkeyGuard() {
  globalGuard.blockedUntil = 0
  globalGuard.snapshot = null
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
    globalGuard.snapshot = value
  }

  function restoreSnapshot(getValue: () => string, setValue: (value: string) => void) {
    const next = snapshot ?? globalGuard.snapshot
    if (next === null) return
    snapshot = null
    globalGuard.snapshot = null
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
