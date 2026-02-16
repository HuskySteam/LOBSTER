/** @jsxImportSource react */
import React from "react"
import { useAppStore } from "../store"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { DialogPrompt } from "../ui/dialog-prompt"

interface DialogSessionRenameProps {
  sessionID: string
}

export function DialogSessionRename(props: DialogSessionRenameProps) {
  const { sync } = useSDK()
  const dialog = useDialog()
  const session = useAppStore((s) => s.session.find((x) => x.id === props.sessionID))

  return (
    <DialogPrompt
      title="Rename Session"
      value={session?.title ?? ""}
      placeholder="Session title"
      onConfirm={async (value) => {
        if (!value.trim()) return
        await sync.client.session.update({ sessionID: props.sessionID, title: value.trim() })
        dialog.clear()
      }}
    />
  )
}
