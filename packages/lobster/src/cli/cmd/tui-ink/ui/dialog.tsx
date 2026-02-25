/** @jsxImportSource react */
import { Box, useStdout } from "ink"
import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { useTheme } from "../theme"
import { useKeybind } from "../context/keybind"

interface DialogContextValue {
  content: ReactNode | null
  replace: (content: ReactNode) => void
  clear: () => void
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined)

export function DialogProvider(props: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode | null>(null)
  const { setBlocker } = useKeybind()

  const replace = useCallback((node: ReactNode) => setContent(node), [])
  const clear = useCallback(() => setContent(null), [])

  React.useEffect(() => {
    setBlocker("dialog", content !== null)
    return () => setBlocker("dialog", false)
  }, [content, setBlocker])

  return (
    <DialogContext.Provider value={{ content, replace, clear }}>
      {content ? null : <Box flexDirection="column">{props.children}</Box>}
      {content ? (
        <Box width="100%" height="100%" justifyContent="center" alignItems="center" paddingLeft={1} paddingRight={1}>
          <DialogOverlay>{content}</DialogOverlay>
        </Box>
      ) : null}
    </DialogContext.Provider>
  )
}

function DialogOverlay(props: { children: ReactNode }) {
  const { theme } = useTheme()
  const { stdout } = useStdout()
  const rows = stdout?.rows ?? 24
  const cols = stdout?.columns ?? 80
  const maxHeight = Math.max(rows - 6, 8)
  const width = Math.max(Math.min(cols - 4, 120), 20)

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.borderActive}
      paddingLeft={1}
      paddingRight={1}
      height={maxHeight}
      width={width}
      overflow="hidden"
    >
      {props.children}
    </Box>
  )
}

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error("useDialog must be used within DialogProvider")
  return ctx
}
