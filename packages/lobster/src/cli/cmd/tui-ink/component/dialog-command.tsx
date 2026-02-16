/** @jsxImportSource react */
import React, { useMemo } from "react"
import { useAppStore } from "../store"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"

const BUILT_IN: DialogSelectOption<string>[] = [
  { title: "/connect", value: "connect", description: "Connect a provider", category: "Suggested" },
  { title: "/model", value: "model", description: "Switch model", category: "Suggested" },
  { title: "/agent", value: "agent", description: "Switch agent", category: "Suggested" },
  { title: "/sessions", value: "sessions", description: "Browse sessions", category: "Navigation" },
  { title: "/status", value: "status", description: "System status", category: "Navigation" },
  { title: "/keybinds", value: "keybinds", description: "Keyboard shortcuts", category: "Navigation" },
  { title: "/plugins", value: "plugins", description: "Manage plugins", category: "System" },
  { title: "/mcp", value: "mcp", description: "MCP servers", category: "System" },
  { title: "/theme", value: "theme", description: "Switch theme", category: "System" },
]

interface DialogCommandProps {
  onTrigger?: (command: string) => void
}

export function DialogCommand(props: DialogCommandProps) {
  const dialog = useDialog()
  const commands = useAppStore((s) => s.command)

  const options = useMemo<DialogSelectOption<string>[]>(() => {
    const sdkCommands = commands.map((c) => ({
      title: `/${c.name}`,
      value: c.name,
      description: c.description,
      category: "Commands",
    }))
    return [...BUILT_IN, ...sdkCommands]
  }, [commands])

  return (
    <DialogSelect
      title="Commands"
      placeholder="Search commands..."
      options={options}
      onSelect={(opt) => {
        dialog.clear()
        props.onTrigger?.(opt.value)
      }}
    />
  )
}
