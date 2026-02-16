/** @jsxImportSource react */
import { Box, Text } from "ink"
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"

interface Toast {
  id: number
  title?: string
  message: string
  variant: "info" | "warning" | "error" | "success"
  duration?: number
}

interface ToastContextValue {
  show: (toast: Omit<Toast, "id">) => void
  error: (err: unknown) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider(props: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const show = useCallback((input: Omit<Toast, "id">) => {
    const id = nextId.current++
    const toast = { ...input, id }
    setToasts((prev) => [...prev, toast])

    const duration = input.duration ?? 3000
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [])

  const error = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      show({ message, variant: "error", duration: 5000 })
    },
    [show],
  )

  return (
    <ToastContext.Provider value={{ show, error }}>
      {props.children}
      {toasts.length > 0 && (
        <Box flexDirection="column" position="absolute" marginTop={-toasts.length - 1}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} />
          ))}
        </Box>
      )}
    </ToastContext.Provider>
  )
}

function ToastItem(props: { toast: Toast }) {
  const colorMap = {
    info: "#5599ff",
    warning: "#ffaa00",
    error: "#ff4444",
    success: "#44cc44",
  }
  const color = colorMap[props.toast.variant]

  return (
    <Box paddingLeft={2}>
      <Text color={color}>
        {props.toast.title ? `${props.toast.title}: ` : ""}
        {props.toast.message}
      </Text>
    </Box>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}
