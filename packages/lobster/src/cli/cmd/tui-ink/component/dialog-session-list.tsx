/** @jsxImportSource react */
import React, { useMemo } from "react"
import { useAppStore } from "../store"
import { useRoute } from "../context/route"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"

export function DialogSessionList() {
  const dialog = useDialog()
  const route = useRoute()
  const sessions = useAppStore((s) => s.session)

  const currentSessionID = route.data.type === "session" ? route.data.sessionID : undefined

  const options = useMemo(() => {
    const today = new Date().toDateString()
    return [...sessions]
      .filter((x) => (x as any).parentID === undefined)
      .sort((a, b) => b.time.updated - a.time.updated)
      .map((x) => {
        const date = new Date(x.time.updated)
        const category = date.toDateString() === today ? "Today" : date.toDateString()
        return {
          title: x.title ?? "Untitled",
          value: x.id,
          category,
          footer: new Date(x.time.updated).toLocaleTimeString(),
        }
      })
  }, [sessions])

  return (
    <DialogSelect
      title="Sessions"
      options={options}
      current={currentSessionID}
      onSelect={(option) => {
        route.navigate({ type: "session", sessionID: option.value })
        dialog.clear()
      }}
    />
  )
}
