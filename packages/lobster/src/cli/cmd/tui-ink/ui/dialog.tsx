/** @jsxImportSource react */
import { Box, Text } from "ink"
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
      {props.children}
      {content && <DialogOverlay onClose={clear}>{content}</DialogOverlay>}
    </DialogContext.Provider>
  )
}

function DialogOverlay(props: { children: ReactNode; onClose: () => void }) {
  const { theme } = useTheme()

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      paddingLeft={1}
      paddingRight={1}
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
