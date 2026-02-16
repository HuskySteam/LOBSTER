/** @jsxImportSource react */
import React, { useMemo } from "react"
import { useAppStore } from "../store"
import { useLocal } from "../context/local"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"

export function DialogModel() {
  const dialog = useDialog()
  const local = useLocal()
  const providers = useAppStore((s) => s.provider)

  const current = local.model.current()

  const options = useMemo(() => {
    return providers
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((provider) =>
        Object.entries(provider.models)
          .filter(([, info]) => (info as any).status !== "deprecated")
          .map(([modelID, info]) => ({
            value: { providerID: provider.id, modelID },
            title: info.name ?? modelID,
            description: provider.name,
            category: provider.name,
          })),
      )
  }, [providers])

  return (
    <DialogSelect
      title="Select model"
      options={options}
      current={current}
      onSelect={(option) => {
        local.model.set(option.value)
        dialog.clear()
      }}
    />
  )
}
