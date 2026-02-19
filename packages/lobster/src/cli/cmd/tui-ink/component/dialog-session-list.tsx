/** @jsxImportSource react */
import React, { useMemo, useState } from "react"
import { Keybind } from "@/util/keybind"
import { useAppStore } from "../store"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { DialogSessionRename } from "./dialog-session-rename"

export function DialogSessionList() {
  const { sync } = useSDK()
  const dialog = useDialog()
  const route = useRoute()
  const sessions = useAppStore((s) => s.session)
  const keybinds = useAppStore((s) => s.config.keybinds)
  const [toDeleteSessionID, setToDeleteSessionID] = useState<string>()

  const currentSessionID = route.data.type === "session" ? route.data.sessionID : undefined
  const sessionDeleteBinding = useMemo(
    () => Keybind.parse(keybinds?.session_delete ?? "ctrl+d")[0],
    [keybinds?.session_delete],
  )
  const sessionRenameBinding = useMemo(
    () => Keybind.parse(keybinds?.session_rename ?? "ctrl+r")[0],
    [keybinds?.session_rename],
  )
  const sessionDeleteLabel = useMemo(
    () => Keybind.toString(sessionDeleteBinding) || "ctrl+d",
    [sessionDeleteBinding],
  )

  const options = useMemo(() => {
    const today = new Date().toDateString()
    return [...sessions]
      .filter((x) => (x as any).parentID === undefined)
      .sort((a, b) => b.time.updated - a.time.updated)
      .map((x) => {
        const date = new Date(x.time.updated)
        const category = date.toDateString() === today ? "Today" : date.toDateString()
        const isDeleting = toDeleteSessionID === x.id
        return {
          title: isDeleting
            ? `Press ${sessionDeleteLabel} again to confirm`
            : x.title ?? "Untitled",
          value: x.id,
          category,
          footer: new Date(x.time.updated).toLocaleTimeString(),
        }
      })
  }, [sessions, toDeleteSessionID, sessionDeleteLabel])

  return (
    <DialogSelect
      title="Sessions"
      options={options}
      current={currentSessionID}
      onMove={() => {
        setToDeleteSessionID(undefined)
      }}
      onSelect={(option) => {
        route.navigate({ type: "session", sessionID: option.value })
        dialog.clear()
      }}
      keybind={[
        {
          title: "delete",
          keybind: sessionDeleteBinding,
          onTrigger: async (option) => {
            if (toDeleteSessionID === option.value) {
              await sync.client.session.delete({
                sessionID: option.value,
              })
              setToDeleteSessionID(undefined)
              return
            }
            setToDeleteSessionID(option.value)
          },
        },
        {
          title: "rename",
          keybind: sessionRenameBinding,
          onTrigger: (option) => {
            dialog.replace(<DialogSessionRename sessionID={option.value} />)
          },
        },
      ]}
    />
  )
}
