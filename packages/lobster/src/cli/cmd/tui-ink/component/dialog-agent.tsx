/** @jsxImportSource react */
import React, { useMemo } from "react"
import { useLocal } from "../context/local"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"

export function DialogAgent() {
  const dialog = useDialog()
  const local = useLocal()

  const options = useMemo(() => {
    return local.agent.list().map((item) => ({
      value: item.name,
      title: item.name,
      description: item.native ? "native" : item.description,
    }))
  }, [local.agent.list()])

  return (
    <DialogSelect
      title="Select agent"
      current={local.agent.current().name}
      options={options}
      onSelect={(option) => {
        local.agent.set(option.value)
        dialog.clear()
      }}
    />
  )
}
