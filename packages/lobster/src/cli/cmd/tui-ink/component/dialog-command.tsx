/** @jsxImportSource react */
import React, { useMemo } from "react"
import { useAppStore } from "../store"
import { useRoute } from "../context/route"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { BUILT_IN_COMMANDS } from "./prompt/command-registry"

interface DialogCommandProps {
  onTrigger?: (command: string) => void
}

export function DialogCommand(props: DialogCommandProps) {
  const dialog = useDialog()
  const route = useRoute()
  const commands = useAppStore((s) => s.command)

  const options = useMemo<DialogSelectOption<string>[]>(() => {
    const inSession = route.data.type === "session"
    const builtIn = BUILT_IN_COMMANDS
      .filter((x) => !x.sessionOnly || inSession)
      .map((x) => ({
        title: `/${x.name}`,
        value: x.name,
        description: x.description,
        category: x.category,
      }))

    const sdkCommands = commands
      .filter((x) => !BUILT_IN_COMMANDS.some((cmd) => cmd.name === x.name))
      .map((x) => ({
        title: `/${x.name}`,
        value: x.name,
        description: x.description,
        category: "Commands",
      }))

    return [...builtIn, ...sdkCommands]
  }, [commands, route.data.type])

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
